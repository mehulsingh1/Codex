"""Post-session report: speaking share (computed), scored feedback (LLM), every quote verified against the transcript."""
import asyncio
import json
import logging
import re
from difflib import SequenceMatcher

from pydantic import BaseModel, Field, ValidationError

from . import personas as P
from . import turn_engine as TE

log = logging.getLogger("report")

CATEGORIES = [
    ("opening", "Opening the discussion"),
    ("ideas", "Quality of ideas"),
    ("building", "Building on others"),
    ("listening", "Listening"),
    ("interruptions", "Handling interruptions"),
    ("closing", "Ending strongly"),
]
REPORT_TIMEOUT = 45.0
MIN_STUDENT_WORDS = 8  # below this there is nothing meaningful to score
MIN_QUOTE_WORDS = 3
FUZZY_MIN = 0.88


# ---------- input / output models ----------
class Entry(BaseModel):
    id: int
    speaker: str
    text: str
    t_start: float
    t_end: float | None = None
    interrupted: bool = False


class Point(BaseModel):
    text: str
    quote: str
    line_id: int
    t: float = 0.0
    speaker: str = ""


class Category(BaseModel):
    key: str
    label: str
    score: int | None  # 0-10, None when there is no grounded evidence
    summary: str
    points: list[Point]


class Missed(BaseModel):
    suggestion: str
    quote: str = ""  # the moment it applies to (verbatim); empty for generic tips
    line_id: int | None = None
    t: float | None = None
    speaker: str = ""


class Share(BaseModel):
    speaker: str
    name: str
    seconds: float
    words: int
    share: float  # of total speaking time, 0..1


class Report(BaseModel):
    empty: bool = False
    error: str | None = None
    overall: float | None = None
    summary: str = ""
    shares: list[Share]
    stats: dict
    categories: list[Category]
    missed: list[Missed]
    dropped: int = 0  # LLM points discarded because their quote was not in the transcript


# ---------- what the LLM must return (lenient: we validate and repair afterwards) ----------
class LPoint(BaseModel):
    key: str
    text: str
    quote: str
    line_id: int


class LCategory(BaseModel):
    key: str
    score: int = Field(ge=0, le=10)
    summary: str = ""


class LMissed(BaseModel):
    line_id: int
    quote: str
    suggestion: str


class LReport(BaseModel):
    """Deliberately flat: deeply nested JSON from the model was often malformed."""
    summary: str = ""
    categories: list[LCategory]
    points: list[LPoint] = []
    missed: list[LMissed] = []


# ---------- speaking share and stats (computed, never LLM-estimated) ----------
def _name(speaker: str) -> str:
    if speaker == "student":
        return "You"
    try:
        return P.get(speaker).name
    except KeyError:
        return speaker


def _seconds(e: Entry) -> float:
    if e.t_end is not None and e.t_end > e.t_start:
        return e.t_end - e.t_start
    return len(e.text.split()) / 2.6


def compute_shares(entries: list[Entry]) -> list[Share]:
    secs: dict[str, float] = {}
    words: dict[str, int] = {}
    for e in entries:
        secs[e.speaker] = secs.get(e.speaker, 0.0) + _seconds(e)
        words[e.speaker] = words.get(e.speaker, 0) + len(e.text.split())
    total = sum(secs.values()) or 1.0
    shares = [Share(speaker=s, name=_name(s), seconds=round(v, 1), words=words[s], share=v / total) for s, v in secs.items()]
    return sorted(shares, key=lambda s: -s.share)


def compute_stats(entries: list[Entry]) -> dict:
    mine = [e for e in entries if e.speaker == "student"]
    first_student = mine[0].id if mine else None
    # Speaking turns by others before the student first spoke (did they open or wait?)
    waited = sum(1 for e in entries if first_student is not None and e.id < first_student and e.speaker != "moderator")
    return {
        "student_turns": len(mine),
        "student_words": sum(len(e.text.split()) for e in mine),
        "student_seconds": round(sum(_seconds(e) for e in mine), 1),
        "ai_turns_before_first_student_turn": waited if mine else None,
        "times_student_cut_off_ai": sum(1 for e in entries if e.interrupted and e.speaker != "student"),
        "total_turns": len(entries),
    }


# ---------- quote verification ----------
_TOK = re.compile(r"[\w']+")


def _norm(text: str) -> str:
    return TE.clean_text(text)


def find_verbatim(quote: str, text: str) -> str | None:
    """Return the exact substring of `text` that matches `quote` ignoring case and punctuation, else None."""
    toks = _TOK.findall(_norm(quote).lower())
    if len(toks) < MIN_QUOTE_WORDS:
        return None
    pat = r"[\W_]+".join(re.escape(t) for t in toks)
    m = re.search(pat, text, re.I)
    return text[m.start(): m.end()] if m else None


def find_fuzzy(quote: str, text: str) -> str | None:
    """Closest same-length run of words in `text` (ratio >= FUZZY_MIN), returned verbatim from `text`."""
    qt = _TOK.findall(_norm(quote).lower())
    spans = [(m.start(), m.end(), m.group().lower()) for m in _TOK.finditer(text)]
    n = len(qt)
    if n < MIN_QUOTE_WORDS or len(spans) < n:
        return None
    target = " ".join(qt)
    best, best_r = None, 0.0
    for i in range(len(spans) - n + 1):
        r = SequenceMatcher(None, target, " ".join(s[2] for s in spans[i: i + n])).ratio()
        if r > best_r:
            best, best_r = (spans[i][0], spans[i + n - 1][1]), r
    return text[best[0]: best[1]] if best and best_r >= FUZZY_MIN else None


def ground_quote(quote: str, line_id: int, entries: list[Entry]) -> tuple[str, Entry] | None:
    """Make (quote, line) exact: check the named line, then every line, then fuzzy-repair. None means drop it."""
    by_id = {e.id: e for e in entries}
    named = by_id.get(line_id)
    if named:
        hit = find_verbatim(quote, named.text)
        if hit:
            return hit, named
    for e in entries:
        hit = find_verbatim(quote, e.text)
        if hit:
            return hit, e
    for e in ([named] if named else []) + entries:
        hit = find_fuzzy(quote, e.text)
        if hit:
            return hit, e
    return None


def validate_report(raw: LReport, entries: list[Entry]) -> tuple[list[Category], list[Missed], int]:
    labels = dict(CATEGORIES)
    seen: dict[str, LCategory] = {c.key: c for c in raw.categories if c.key in labels}
    dropped = 0
    cats: list[Category] = []
    for key, label in CATEGORIES:
        lc = seen.get(key)
        pts: list[Point] = []
        if lc:
            for p in (p for p in raw.points if p.key == key):
                g = ground_quote(p.quote, p.line_id, entries)
                if g is None:
                    dropped += 1
                    continue
                quote, line = g
                pts.append(Point(text=_norm(p.text), quote=quote, line_id=line.id, t=line.t_start, speaker=line.speaker))
        if lc and pts:
            cats.append(Category(key=key, label=label, score=lc.score, summary=_norm(lc.summary), points=pts))
        else:  # no grounded evidence: say so instead of showing an unsupported score
            cats.append(Category(key=key, label=label, score=None, summary="Not enough evidence in this session to score this.", points=[]))
    missed: list[Missed] = []
    for m in raw.missed:
        g = ground_quote(m.quote, m.line_id, entries)
        if g is None:
            dropped += 1
            continue
        quote, line = g
        missed.append(Missed(suggestion=_norm(m.suggestion), quote=quote, line_id=line.id, t=line.t_start, speaker=line.speaker))
    return cats, missed[:3], dropped


# ---------- LLM ----------
def _mmss(t: float) -> str:
    return f"{int(t // 60)}:{int(t % 60):02d}"


def build_prompt(topic: str, entries: list[Entry], stats: dict) -> list[dict]:
    transcript = "\n".join(f"[line {e.id} | {_mmss(e.t_start)}] {_name(e.speaker)}{' (cut off by the student)' if e.interrupted and e.speaker != 'student' else ''}: {e.text}" for e in entries)
    keys = ", ".join(f'"{k}" ({l})' for k, l in CATEGORIES)
    system = f"""You are a strict but fair placement group-discussion coach. The student is the participant named "You"; everyone else is an AI. Assess ONLY the student's performance, using the transcript.

Score each category 0-10 (5 is an average student; do not inflate). Categories: {keys}.
Give each category 1 or 2 points in the flat "points" list. Each point has its category "key", "text" (specific feedback, one sentence, addressed to the student as "you") and "quote": a VERBATIM copy of 3 to 25 consecutive words from ONE transcript line, with that line's "line_id". Copy the words exactly as they appear. Never paraphrase inside a quote. Quote the student's own words for feedback about what they said; quote another speaker only to show what the student missed or ignored.
Also give exactly 3 "missed" openings: moments (a line_id plus a verbatim quote from that line) where the student could have jumped in, each with a "suggestion" of what they could have said (1-2 sentences, first person, concrete, specific to the topic and that moment).
If a category has no evidence in the transcript, give it score 0 and no points.

Return ONLY a JSON object with exactly these four keys, nothing else:
{{"summary": "<2 sentences overall>",
 "categories": [{{"key": "opening", "score": 0, "summary": "<1 sentence>"}}, ...one per category...],
 "points": [{{"key": "opening", "text": "...", "quote": "...", "line_id": 0}}, ...],
 "missed": [{{"line_id": 0, "quote": "...", "suggestion": "..."}}, ...]}}"""
    user = f'Topic: "{topic}"\nFacts (computed): {json.dumps(stats)}\n\nTranscript:\n{transcript}'
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def _obj(props: dict) -> dict:
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}


_STR, _INT = {"type": "string"}, {"type": "integer"}
# Strict schema: the API itself guarantees well-formed JSON of exactly this shape.
REPORT_SCHEMA = _obj({
    "summary": _STR,
    "categories": {"type": "array", "items": _obj({"key": {"type": "string", "enum": [k for k, _ in CATEGORIES]}, "score": _INT, "summary": _STR})},
    "points": {"type": "array", "items": _obj({"key": {"type": "string", "enum": [k for k, _ in CATEGORIES]}, "text": _STR, "quote": _STR, "line_id": _INT})},
    "missed": {"type": "array", "items": _obj({"line_id": _INT, "quote": _STR, "suggestion": _STR})},
})


async def _call_llm(messages: list[dict]) -> LReport:
    resp = await asyncio.wait_for(
        TE._get_client().chat.completions.create(
            model=TE.MAIN_MODEL,
            messages=messages,
            response_format={"type": "json_schema", "json_schema": {"name": "gd_report", "strict": True, "schema": REPORT_SCHEMA}},
            temperature=0.3,
            max_completion_tokens=2600,
            reasoning_effort="medium",
        ),
        timeout=REPORT_TIMEOUT,
    )
    raw = resp.choices[0].message.content or ""
    m = re.search(r"\{.*\}", raw, re.S)
    if not m:
        raise ValueError("no JSON in reply")
    return LReport.model_validate(json.loads(m.group(0)))


GENERIC_OPENINGS = [
    Missed(suggestion="Open by defining the key term in the topic, then state which side you will argue and why."),
    Missed(suggestion="Start with one surprising fact or example, then link it to the topic in a single sentence."),
    Missed(suggestion="Frame the discussion: name two or three angles (economic, social, ethical) and offer to take the first."),
]


async def build_report(topic: str, raw_entries: list[dict]) -> Report:
    entries = [Entry.model_validate(e) for e in raw_entries]
    shares = compute_shares(entries)
    stats = compute_stats(entries)

    if stats["student_words"] < MIN_STUDENT_WORDS:
        return Report(
            empty=True,
            summary="You did not say enough for us to assess. Here is who spoke, and three ways to open next time.",
            shares=shares, stats=stats, categories=[], missed=GENERIC_OPENINGS,
        )

    messages = build_prompt(topic, entries, stats)
    last_err = "unknown"
    for attempt in range(3):  # two retries: the second covers waiting out a rate limit
        try:
            raw = await _call_llm(messages)
            cats, missed, dropped = validate_report(raw, entries)
            scored = [c.score for c in cats if c.score is not None]
            if not scored:
                raise ValueError("no category had a verifiable quote")
            return Report(
                overall=round(sum(scored) / len(scored), 1), summary=_norm(raw.summary),
                shares=shares, stats=stats, categories=cats, missed=missed or GENERIC_OPENINGS, dropped=dropped,
            )
        except (ValueError, ValidationError, json.JSONDecodeError, asyncio.TimeoutError) as e:
            last_err = type(e).__name__
            log.warning("report attempt %d failed: %s %s", attempt + 1, last_err, e)
        except Exception as e:  # noqa: BLE001 - rate limit, network, auth
            last_err = type(e).__name__
            log.warning("report attempt %d failed: %s", attempt + 1, last_err)
            # A rate limit clears within the minute: wait as long as Groq asks, then try again.
            await asyncio.sleep(TE.retry_after(e, 4.0) if TE.is_rate_limit(e) else 2.0)
    return Report(
        error="The feedback service is busy right now. Your speaking share is below; try generating the feedback again.",
        shares=shares, stats=stats, categories=[], missed=[],
    )
