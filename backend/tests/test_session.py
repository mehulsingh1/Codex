import asyncio

from app import session as S
from app.turn_engine import Turn


def fake_llm(monkeypatch):
    """Replace the LLM with scripted two-sentence turns."""
    n = {"i": 0}

    async def fake_next_turn(topic, panel, history, lang="en", force=None, instruction=None):
        n["i"] += 1
        who = force or ("data" if n["i"] % 2 else "dominator")
        return Turn(speaker=who, text="First point here. Second point follows.", addresses="all", stance="add"), "llm"

    monkeypatch.setattr(S.TE, "next_turn", fake_next_turn)


async def start_session():
    sent = []

    async def send(msg):
        sent.append(msg)

    s = S.Session(S.Config(topic="t", panel=3, duration=60, closing=20, patience=0.2))
    await s.attach(send)
    s.start()

    async def wait_for(pred, timeout=5.0):
        loop = asyncio.get_running_loop()
        end = loop.time() + timeout
        while loop.time() < end:
            m = next((m for m in sent if pred(m)), None)
            if m:
                return m
            await asyncio.sleep(0.02)
        raise AssertionError("timed out waiting for a message")

    turn = await wait_for(lambda m: m["type"] == "turn")
    return s, sent, wait_for, turn


def test_barge_in_marks_the_line_interrupted_and_gives_the_student_the_floor(monkeypatch):
    fake_llm(monkeypatch)

    async def go():
        s, sent, wait_for, _ = await start_session()
        assert s.floor == "ai_speaking"
        await s.on_message({"type": "speech_start", "heard_sentences": 1})
        await wait_for(lambda m: m["type"] == "interrupted")
        assert s.floor == "student_speaking"
        e = s.transcript[0]
        assert e.interrupted and e.text == "First point here." and e.t_end is not None
        await s.stop()

    asyncio.run(go())


def test_student_reply_comes_after_patience_and_floor_states_stay_valid(monkeypatch):
    fake_llm(monkeypatch)

    async def go():
        s, sent, wait_for, turn = await start_session()
        await s.on_message({"type": "playback_done", "id": turn["id"]})
        await wait_for(lambda m: m["type"] == "state" and m["floor"] == "idle")
        await s.on_message({"type": "student_text", "text": "My view is this."})
        assert s.floor == "student_speaking"
        await wait_for(lambda m: m["type"] == "turn" and m["id"] > turn["id"])
        assert any(e.speaker == "student" and e.text == "My view is this." for e in s.transcript)
        assert all(m["floor"] in ("idle", "ai_speaking", "student_speaking") for m in sent if m["type"] == "state")
        await s.stop()

    asyncio.run(go())


def test_reconnect_resumes_with_the_full_transcript(monkeypatch):
    fake_llm(monkeypatch)

    async def go():
        s, _, _, _ = await start_session()
        s.detach()  # connection lost
        again = []

        async def send2(msg):
            again.append(msg)

        await s.attach(send2)
        snap = again[0]
        assert snap["type"] == "snapshot" and snap["session_id"] == s.id
        assert snap["transcript"] and snap["phase"] in ("opening", "discussion")
        await s.stop()

    asyncio.run(go())


def test_a_dead_socket_never_breaks_the_session():
    async def go():
        async def broken(msg):
            raise RuntimeError("socket closed")

        s = S.Session(S.Config(topic="t", duration=60, closing=20))
        s._send = broken
        await s.emit({"type": "x"})  # must swallow the error and detach
        assert s._send is None

    asyncio.run(go())


def test_sentence_splitting_for_streaming_tts():
    assert S.split_sentences("One. Two! Three? Four") == ["One.", "Two!", "Three?", "Four"]


def test_fishbowl_ignores_the_student_until_the_moderator_invites_them(monkeypatch):
    fake_llm(monkeypatch)
    monkeypatch.setattr(S, "FISHBOWL_TURNS", 1)
    monkeypatch.setattr(S, "AI_GAP", 0.05)

    async def go():
        sent = []

        async def send(msg):
            sent.append(msg)

        s = S.Session(S.Config(topic="t", panel=3, format="fishbowl", duration=60, closing=20, patience=0.1))
        await s.attach(send)
        s.start()

        async def ack_turns_until(pred, timeout=8.0):
            loop = asyncio.get_running_loop()
            end, seen = loop.time() + timeout, set()
            while loop.time() < end:
                for m in list(sent):
                    if m["type"] == "turn" and m["id"] not in seen:
                        seen.add(m["id"])
                        await s.on_message({"type": "playback_done", "id": m["id"]})
                if pred():
                    return
                await asyncio.sleep(0.02)
            raise AssertionError("condition not reached")

        await ack_turns_until(lambda: any(m["type"] == "turn" for m in sent))
        assert s._observing
        await s.on_message({"type": "speech_start"})
        await s.on_message({"type": "student_text", "text": "Can I say something?"})
        assert s.floor != "student_speaking" and not any(e.speaker == "student" for e in s.transcript)

        await ack_turns_until(lambda: not s._observing)
        assert any(m["type"] == "observing" and m["value"] is False for m in sent)
        assert s.transcript[-1].speaker == "moderator"  # the invitation

        await ack_turns_until(lambda: s.floor == "idle")
        await s.on_message({"type": "student_text", "text": "Thanks, here is my point."})
        await ack_turns_until(lambda: any(e.speaker == "student" for e in s.transcript))
        await s.stop()

    asyncio.run(go())


def test_watchdog_frees_the_floor_when_the_client_never_ends_the_students_speech(monkeypatch):
    fake_llm(monkeypatch)
    monkeypatch.setattr(S, "STUCK_LIMIT", 0.3)

    async def go():
        s, sent, wait_for, turn = await start_session()
        await s.on_message({"type": "playback_done", "id": turn["id"]})
        await wait_for(lambda m: m["type"] == "state" and m["floor"] == "idle")
        await s.on_message({"type": "speech_start"})  # ...and then no speech_end, no text, ever
        assert s.floor == "student_speaking"
        await wait_for(lambda m: m["type"] == "turn" and m["id"] > turn["id"], timeout=6)
        assert s.floor in ("ai_speaking", "idle")
        await s.stop()

    asyncio.run(go())


def test_token_budget_routes_to_the_other_model_when_one_is_full():
    from app import turn_engine as TE

    TE._usage.clear()
    assert TE.pick_model(1500) == TE.MAIN_MODEL
    TE._record(TE.MAIN_MODEL, 6400)  # the main model is nearly out of its per-minute tokens
    assert TE.pick_model(1500) == TE.FAST_MODEL
    TE._usage.clear()
