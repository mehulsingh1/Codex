"""One LLM call per turn. The model picks the next speaker and writes their line as strict JSON."""
import asyncio
import json
import logging
import os
import re
import time
from collections import deque
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from . import personas as P

log = logging.getLogger("turn_engine")

# Groq retired the Llama models named in the original spec; these are the closest available replacements.
# Override with GROQ_MAIN_MODEL / GROQ_FAST_MODEL in .env.
MAIN_MODEL = os.getenv("GROQ_MAIN_MODEL", "openai/gpt-oss-120b")
FAST_MODEL = os.getenv("GROQ_FAST_MODEL", "openai/gpt-oss-20b")
MAX_REPLY_TOKENS = 380  # the cap counts against the per-minute token limit, so keep it tight
LLM_TIMEOUT = 12.0  # seconds per call; a slow reply is retried once, then the moderator fallback is used
HISTORY_TURNS = 10  # recent transcript lines sent to the model (keeps each call small)


class Turn(BaseModel):
    speaker: str
    text: str = Field(min_length=1, max_length=600)
    addresses: str = "all"
    stance: Literal["agree", "disagree", "add", "redirect"] = "add"


class Line(BaseModel):
    speaker: str  # persona id, "moderator" or "student"
    text: str


_client = None


def _get_client():
    global _client
    if _client is None:
        from groq import AsyncGroq

        key = os.getenv("GROQ_API_KEY")
        if not key:
            raise RuntimeError("GROQ_API_KEY not set")
        _client = AsyncGroq(api_key=key)
    return _client


def build_messages(
    topic: str,
    panel: list[P.Persona],
    history: list[Line],
    lang: str = "en",
    force_speaker: str | None = None,
    instruction: str | None = None,
) -> list[dict]:
    ids = [p.id for p in panel] + ["moderator"]
    cast = "\n".join(f"- {p.id} ({p.name}, {p.role}): {p.style}" for p in [P.MODERATOR, *panel])
    counts = {i: sum(1 for l in history if l.speaker == i) for i in ids + ["student"]}
    language = (
        "Speak Hinglish in EVERY reply: Hindi and English mixed the way urban Indian students talk, written in Roman script (for example 'Mujhe lagta hai ki productivity improve hogi, lekin pehle data dekhna padega'). At least half the words must be Hindi. Never reply in plain English."
        if lang == "hi"
        else "Speak natural, clear English."
    )
    system = f"""You run a placement-style group discussion on the topic: "{topic}".
The human participant is the "student". You play the AI participants and the moderator, one turn at a time.

Cast:
{cast}

Rules:
- Each reply is ONE turn by ONE speaker: 1 to 3 short spoken sentences, under 55 words. No stage directions, no emojis, no markdown, no speaker label inside the text.
- Stay strictly in the chosen speaker's personality. The cast must sound clearly different from each other.
- Participants react to each other, not only to the student. Refer to people by first name and to what they actually said.
- If the student just spoke, someone should respond to the student's specific point. If the last speaker was an AI, another AI may respond to it.
- Never pick the same speaker twice in a row. Let quiet personas speak rarely, and spread turns so nobody monopolises.
- {language}
- Speaking turns so far: {json.dumps(counts)}

Reply with ONLY this JSON object:
{{"speaker": "<one of {ids}>", "text": "<what they say>", "addresses": "<a persona id, or student, or all>", "stance": "agree|disagree|add|redirect"}}"""

    convo = "\n".join(
        f"{P.get(l.speaker).name if l.speaker in ids else 'Student'} [{l.speaker}]: {l.text}"
        for l in history[-HISTORY_TURNS:]
    ) or "(the discussion has not started)"

    ask = f"Transcript so far:\n{convo}\n\n"
    if force_speaker:
        ask += f'The next speaker MUST be "{force_speaker}". '
    else:
        ask += "Choose who speaks next and write their turn. "
    if instruction:
        ask += instruction
    return [{"role": "system", "content": system}, {"role": "user", "content": ask.strip()}]


_SPACES = dict.fromkeys(map(ord, "     "), " ")
_DASHES = dict.fromkeys(map(ord, "‐‑‒–—"), "-")
_QUOTES = {ord("‘"): "'", ord("’"): "'", ord("“"): '"', ord("”"): '"'}
_CLEAN = {**_SPACES, **_DASHES, **_QUOTES}


def clean_text(text: str) -> str:
    """Spoken text only: swap typographic characters the TTS engines stumble on, drop markdown."""
    text = text.translate(_CLEAN).replace("�", "-")
    text = re.sub(r"[*_`#]+", "", text)
    return re.sub(r"\s+", " ", text).strip()


def parse_turn(raw: str, valid_ids: set[str], force_speaker: str | None = None, last_speaker: str | None = None) -> Turn:
    """Validate model output. Raises ValueError / ValidationError on anything unusable."""
    m = re.search(r"\{.*\}", raw, re.S)
    if not m:
        raise ValueError("no JSON object in reply")
    turn = Turn.model_validate(json.loads(m.group(0)))
    if turn.speaker not in valid_ids:
        raise ValueError(f"unknown speaker {turn.speaker!r}")
    if force_speaker and turn.speaker != force_speaker:
        raise ValueError(f"expected {force_speaker}, got {turn.speaker}")
    if last_speaker and turn.speaker == last_speaker:
        raise ValueError("same speaker twice in a row")
    turn.text = clean_text(turn.text)
    if not turn.text:
        raise ValueError("empty text")
    return turn


def fallback_turn(topic: str, lang: str = "en") -> Turn:
    """Used when the LLM is unusable: the moderator asks the student a question."""
    clean_topic = topic.rstrip("?.! ")
    text = (
        f"Let's hear from you. What is your view on {clean_topic}?"
        if lang != "hi"
        else f"Aapka kya view hai is topic par: {clean_topic}?"
    )
    return Turn(speaker="moderator", text=text, addresses="student", stance="redirect")


# ---------- rate-limit awareness ----------
# Groq's free tier allows about 8,000 tokens per minute PER MODEL, counting prompt + requested reply size.
# We track what each model has used in the last minute and send the call to the one with room.
TPM_BUDGET = 6500  # stay under the 8,000 limit with a margin
_usage: dict[str, deque] = {}


def _used(model: str) -> int:
    q = _usage.setdefault(model, deque())
    cutoff = time.monotonic() - 60
    while q and q[0][0] < cutoff:
        q.popleft()
    return sum(n for _, n in q)


def _record(model: str, tokens: int) -> None:
    _usage.setdefault(model, deque()).append((time.monotonic(), tokens))


def pick_model(est_tokens: int, exclude: tuple[str, ...] = ()) -> str:
    """Prefer the main model; use the fast one when the main one is close to its per-minute budget."""
    for m in (MAIN_MODEL, FAST_MODEL):
        if m not in exclude and _used(m) + est_tokens <= TPM_BUDGET:
            return m
    candidates = [m for m in (MAIN_MODEL, FAST_MODEL) if m not in exclude] or [MAIN_MODEL]
    return min(candidates, key=_used)


def retry_after(exc: Exception, default: float = 3.0) -> float:
    """Seconds Groq asks us to wait, from the Retry-After header when present."""
    try:
        return min(20.0, float(exc.response.headers.get("retry-after", default)))  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        return default


def is_rate_limit(exc: Exception) -> bool:
    return type(exc).__name__ == "RateLimitError"


async def next_turn(
    topic: str,
    panel: list[P.Persona],
    history: list[Line],
    lang: str = "en",
    force_speaker: str | None = None,
    instruction: str | None = None,
) -> tuple[Turn, str]:
    """Return (turn, source) where source is 'llm', 'llm-retry' or 'fallback'."""
    valid = {p.id for p in panel} | {"moderator"}
    last = history[-1].speaker if history and not force_speaker else None
    messages = build_messages(topic, panel, history, lang, force_speaker, instruction)
    est = sum(len(m["content"]) for m in messages) // 4 + MAX_REPLY_TOKENS
    tried: list[str] = []
    attempts = 0
    while attempts < 3:  # first try, plus up to two retries (the extra one is for rate limits)
        model = pick_model(est, exclude=tuple(tried[-1:]) if tried and is_rl_last(tried) else ())
        attempts += 1
        try:
            resp = await asyncio.wait_for(
                _get_client().chat.completions.create(
                    model=model,
                    messages=messages,
                    response_format={"type": "json_object"},
                    temperature=0.85,
                    max_completion_tokens=MAX_REPLY_TOKENS,  # gpt-oss spends part of this on reasoning
                    reasoning_effort="low",
                ),
                timeout=LLM_TIMEOUT,
            )
            if getattr(resp, "usage", None):
                _record(model, resp.usage.total_tokens)
            turn = parse_turn(resp.choices[0].message.content or "", valid, force_speaker, last)
            return turn, "llm" if attempts == 1 else "llm-retry"
        except (ValueError, ValidationError, json.JSONDecodeError) as e:
            log.warning("invalid turn (attempt %d): %s", attempts, e)
        except Exception as e:  # noqa: BLE001 - rate limits, network, auth
            log.warning("LLM call failed on %s (attempt %d): %s", model, attempts, type(e).__name__)
            if is_rate_limit(e):
                _record(model, TPM_BUDGET)  # treat this model as full for the rest of the minute
                tried.append(model + "|rl")
                if attempts == 2:  # both models are busy: wait as long as Groq asks, then try once more
                    await asyncio.sleep(retry_after(e))
            else:
                await asyncio.sleep(0.5)
    return fallback_turn(topic, lang), "fallback"


def is_rl_last(tried: list[str]) -> bool:
    return bool(tried) and tried[-1].endswith("|rl")


async def warm() -> None:
    """Open the connection to Groq at startup so the first real turn is not slow. Never raises."""
    try:
        await asyncio.wait_for(
            _get_client().chat.completions.create(
                model=FAST_MODEL, messages=[{"role": "user", "content": "hi"}], max_completion_tokens=16, reasoning_effort="low"
            ),
            timeout=15,
        )
    except Exception as e:  # noqa: BLE001
        log.warning("LLM warm-up failed: %s", type(e).__name__)
