import asyncio
import json
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app import personas as P
from app import turn_engine as TE
from app.turn_engine import Line

from conftest import RateLimitError

PANEL = P.roster(3)
VALID = {p.id for p in PANEL} | {"moderator"}


def reply(speaker="data", text="Roughly a third of firms report gains.", addresses="all", stance="add"):
    return json.dumps({"speaker": speaker, "text": text, "addresses": addresses, "stance": stance})


def run(history=None, force=None):
    return asyncio.run(TE.next_turn("Four-day week", PANEL, history or [], "en", force))


def test_parse_accepts_valid_turn():
    t = TE.parse_turn(reply(), VALID)
    assert (t.speaker, t.stance) == ("data", "add")


def test_parse_rejects_unknown_speaker():
    with pytest.raises(ValueError):
        TE.parse_turn(reply(speaker="hacker"), VALID)


def test_parse_rejects_same_speaker_twice():
    with pytest.raises(ValueError):
        TE.parse_turn(reply(speaker="data"), VALID, last_speaker="data")


def test_parse_rejects_bad_stance_and_empty_text():
    with pytest.raises(ValidationError):
        TE.parse_turn(reply(stance="shout"), VALID)
    with pytest.raises(ValidationError):
        TE.parse_turn(reply(text=""), VALID)


def test_parse_finds_json_inside_fenced_reply():
    t = TE.parse_turn("```json\n" + reply() + "\n```", VALID)
    assert t.speaker == "data"


def test_clean_text_normalises_typography_and_markdown():
    assert TE.clean_text("four‑day week, “nice” **bold**") == 'four-day week, "nice" bold'


def test_next_turn_happy_path(fake_groq):
    fake = fake_groq([reply()])
    turn, src = run()
    assert src == "llm" and turn.speaker == "data" and len(fake.calls) == 1


def test_invalid_json_then_valid_is_retried_once(fake_groq):
    fake = fake_groq(["not json at all", reply()])
    turn, src = run()
    assert src == "llm-retry" and turn.speaker == "data" and len(fake.calls) == 2


def test_two_bad_replies_fall_back_to_moderator_question(fake_groq):
    fake_groq(["garbage", reply(speaker="nobody")])
    turn, src = run()
    assert src == "fallback"
    assert turn.speaker == "moderator" and turn.addresses == "student" and "Four-day week" in turn.text


def test_rate_limit_retries_on_the_fast_model(fake_groq):
    fake = fake_groq([RateLimitError("429"), reply()])
    turn, src = run()
    assert src == "llm-retry"
    assert fake.calls[0]["model"] == TE.MAIN_MODEL and fake.calls[1]["model"] == TE.FAST_MODEL


def test_network_failure_twice_falls_back(fake_groq):
    fake_groq([ConnectionError("down"), ConnectionError("down")])
    _, src = run()
    assert src == "fallback"


def test_slow_llm_times_out_then_falls_back(monkeypatch):
    async def slow(**kw):
        await asyncio.sleep(5)

    monkeypatch.setattr(TE, "_client", SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=slow))))
    monkeypatch.setattr(TE, "LLM_TIMEOUT", 0.05)
    _, src = run()
    assert src == "fallback"


def test_forced_speaker_is_enforced(fake_groq):
    fake_groq([reply(speaker="data"), reply(speaker="moderator", text="Welcome.")])
    turn, src = run(force="moderator")
    assert turn.speaker == "moderator" and src == "llm-retry"


def test_prompt_contains_topic_cast_and_recent_history():
    hist = [Line(speaker="dominator", text="Bold claim."), Line(speaker="student", text="I disagree.")]
    system, user = TE.build_messages("Four-day week", PANEL, hist, "hi")
    assert "Four-day week" in system["content"] and "Hinglish" in system["content"]
    assert "Arjun" in system["content"] and "I disagree." in user["content"]
