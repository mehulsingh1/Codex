import asyncio

from app import report as R


def E(i, who, text, a, b, x=False):
    return R.Entry(id=i, speaker=who, text=text, t_start=a, t_end=b, interrupted=x)


ENTRIES = [
    E(0, "moderator", "Welcome everyone. Arjun, you may start.", 0, 5),
    E(1, "dominator", "Four days will cripple productivity; companies will lose output.", 6, 12, True),
    E(2, "student", "I would start by defining productivity: output per hour, not hours at a desk.", 13, 21),
    E(3, "data", "Trials showed only a small dip in output initially.", 22, 28),
]


def test_verbatim_quote_is_returned_from_the_original_text():
    q, line = R.ground_quote("OUTPUT per hour not hours at a DESK", 2, ENTRIES)
    assert q == "output per hour, not hours at a desk" and line.id == 2


def test_wrong_line_id_is_repaired():
    _, line = R.ground_quote("defining productivity: output per hour", 0, ENTRIES)
    assert line.id == 2


def test_paraphrase_and_invented_quotes_are_dropped():
    assert R.ground_quote("output per hour not hours in an office", 2, ENTRIES) is None
    assert R.ground_quote("automation will create millions of jobs overnight", 2, ENTRIES) is None


def test_too_short_quote_is_dropped():
    assert R.ground_quote("small dip", 3, ENTRIES) is None


def test_fuzzy_repair_snaps_to_real_words():
    got = R.ground_quote("trials showed only a small dips in output initially", 3, ENTRIES)
    assert got is not None and got[0] in ENTRIES[3].text


def test_validate_report_drops_ungrounded_points_and_withholds_the_score():
    raw = R.LReport(
        summary="ok",
        categories=[R.LCategory(key="opening", score=7, summary="good"), R.LCategory(key="ideas", score=6, summary="fine")],
        points=[
            R.LPoint(key="opening", text="Strong frame.", quote="defining productivity: output per hour", line_id=2),
            R.LPoint(key="ideas", text="Invented.", quote="the moon is made of green cheese", line_id=2),
        ],
        missed=[
            R.LMissed(line_id=1, quote="companies will lose output", suggestion="Counter with data."),
            R.LMissed(line_id=1, quote="totally made up words here", suggestion="x"),
        ],
    )
    cats, missed, dropped = R.validate_report(raw, ENTRIES)
    by = {c.key: c for c in cats}
    assert by["opening"].score == 7 and by["opening"].points[0].quote in ENTRIES[2].text
    assert by["ideas"].score is None and by["ideas"].points == []
    assert len(missed) == 1 and dropped == 2
    assert len(cats) == len(R.CATEGORIES)  # every category is present, evidence or not


def test_every_surviving_quote_is_verbatim_in_its_line():
    raw = R.LReport(
        categories=[R.LCategory(key="opening", score=5)],
        points=[R.LPoint(key="opening", text="t", quote="Output per hour, NOT hours at a desk", line_id=2)],
    )
    cats, _, _ = R.validate_report(raw, ENTRIES)
    p = cats[0].points[0]
    assert p.quote in {e.id: e.text for e in ENTRIES}[p.line_id] and p.t == 13


def test_shares_sum_to_one_and_student_is_counted():
    shares = R.compute_shares(ENTRIES)
    assert abs(sum(s.share for s in shares) - 1) < 1e-9
    assert {s.speaker for s in shares} >= {"student", "moderator"}


def test_stats_count_interruptions_of_ai():
    assert R.compute_stats(ENTRIES)["times_student_cut_off_ai"] == 1


def test_empty_student_transcript_gives_a_report_without_calling_the_llm(monkeypatch):
    def boom(*a, **k):
        raise AssertionError("LLM must not be called")

    monkeypatch.setattr(R, "_call_llm", boom)
    rep = asyncio.run(R.build_report("t", [e.model_dump() for e in ENTRIES if e.speaker != "student"]))
    assert rep.empty and rep.categories == [] and len(rep.missed) == 3 and rep.shares


def test_llm_failure_degrades_to_shares_and_a_friendly_error(monkeypatch):
    async def fail(*a, **k):
        raise ConnectionError("down")

    real_sleep = R.asyncio.sleep

    async def fast_sleep(_):
        await real_sleep(0)

    monkeypatch.setattr(R, "_call_llm", fail)
    monkeypatch.setattr(R.asyncio, "sleep", fast_sleep)
    rep = asyncio.run(R.build_report("t", [e.model_dump() for e in ENTRIES]))
    assert rep.error and rep.shares and rep.categories == []
