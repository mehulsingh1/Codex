"""A live discussion room. Owns the floor (who may speak), the timer, barge-in and the transcript.

Floor states:  idle -> ai_speaking -> idle,   idle/ai_speaking -> student_speaking -> idle.
Only the Session changes the floor. The client reports what it hears (speech_start, speech_end,
student_text, playback_done) and plays what it is told to play.
"""
import asyncio
import logging
import re
import time
import uuid
from dataclasses import asdict, dataclass
from typing import Awaitable, Callable

from . import personas as P
from . import turn_engine as TE
from .turn_engine import Line, Turn

log = logging.getLogger("session")

Send = Callable[[dict], Awaitable[None]]

AI_GAP = 1.0  # seconds of shared silence before an AI answers another AI
MAX_AI_IN_ROW = 3  # then the moderator hands the floor to the student
STUDENT_WAIT = 6.0  # silence after the moderator's question before the AIs carry on
DETACHED_LIMIT = 120.0  # end a session whose client has been gone this long
FISHBOWL_TURNS = 4  # AI turns the student watches before being invited in
NO_TEXT_LIMIT = 20.0  # speech_end without any transcript text (covers Whisper upload latency): treat as noise
STUCK_LIMIT = 10.0  # student 'speaking' with no sign of life this long: the client lost its end-of-speech signal


@dataclass
class Entry:
    id: int
    speaker: str
    text: str
    t_start: float  # seconds since session start
    t_end: float | None = None
    interrupted: bool = False


@dataclass
class Config:
    topic: str
    panel: int = 4
    format: str = "standard"
    lang: str = "en"
    duration: float = 480.0  # total seconds, including the closing round
    closing: float = 60.0  # seconds reserved for the closing round
    patience: float = 1.0  # silence (s) before the AIs reply to the student
    nudge_after: float = 180.0  # nudge a student who has been silent this long


def split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p for p in parts if p]


def estimate_seconds(text: str) -> float:
    return len(text.split()) / 2.6 + 1.0


class Session:
    def __init__(self, config: Config, session_id: str | None = None):
        self.id = session_id or uuid.uuid4().hex[:12]
        self.cfg = config
        self.panel = P.roster(config.panel)
        self.transcript: list[Entry] = []
        self.phase = "setup"  # setup | opening | discussion | closing | ended
        self.floor = "idle"
        self.speaker: str | None = None
        self.thinking: str | None = None

        self._send: Send | None = None
        self._detached_since: float | None = time.monotonic()
        self._t0 = time.monotonic()
        self._task: asyncio.Task | None = None
        self._turn_task: asyncio.Task | None = None
        self._turn_seq = 0

        self._playback_done = asyncio.Event()
        self._interrupted = asyncio.Event()
        self._student_committed = asyncio.Event()
        self._cur_turn_id = -1
        self._cur_entry: Entry | None = None
        self._cur_sentences: list[str] = []

        self._student_t_start = 0.0
        self._student_text: list[str] = []
        self._speech_ended_at: float | None = None
        self._last_student_event = time.monotonic()  # last speech_start / text from the student (watchdog)
        self._last_text_at: float | None = None
        self._free_since = time.monotonic()
        self._last_student_spoke = time.monotonic()
        self._last_nudge = 0.0
        self._awaiting_student = False
        self._consec_ai = 0
        self._finished = False
        self._last_turn: Turn | None = None
        self._observing = config.format == "fishbowl"  # fishbowl: the student watches first, then joins
        self._observed_turns = 0

    # ---------- plumbing ----------
    def now(self) -> float:
        return time.monotonic() - self._t0

    def remaining(self) -> float:
        return max(0.0, self.cfg.duration - self.now())

    async def attach(self, send: Send) -> None:
        """Connect (or reconnect) a client and bring it up to date."""
        self._send = send
        self._detached_since = None
        await send({"type": "snapshot", "session_id": self.id, **self.snapshot()})

    def detach(self) -> None:
        self._send = None
        self._detached_since = time.monotonic()

    def snapshot(self) -> dict:
        return {
            "config": asdict(self.cfg),
            "phase": self.phase,
            "observing": self._observing,
            "floor": self.floor,
            "speaker": self.speaker,
            "thinking": self.thinking,
            "remaining": round(self.remaining()),
            "transcript": [asdict(e) for e in self.transcript],
        }

    async def emit(self, msg: dict) -> None:
        if self._send is None:
            return
        try:
            await self._send(msg)
        except Exception:  # noqa: BLE001 - a dead socket must never break the session
            self.detach()

    async def _set_floor(self, floor: str, speaker: str | None = None) -> None:
        if floor == "idle" and self.floor != "idle":
            self._free_since = time.monotonic()
        self.floor, self.speaker = floor, speaker
        await self.emit({"type": "state", "floor": floor, "speaker": speaker, "thinking": self.thinking})

    async def _set_phase(self, phase: str) -> None:
        self.phase = phase
        await self.emit({"type": "phase", "phase": phase})

    def start(self) -> None:
        self._t0 = time.monotonic()
        self._task = asyncio.create_task(self._run(), name=f"session-{self.id}")

    async def stop(self) -> None:
        for t in (self._turn_task, self._task):
            if t and not t.done():
                t.cancel()
        self.phase = "ended"

    # ---------- client events ----------
    async def on_message(self, msg: dict) -> None:
        kind = msg.get("type")
        if kind == "speech_start":
            await self.student_speech_start(msg.get("heard_sentences"))
        elif kind == "speech_end":
            self._speech_ended_at = time.monotonic()
        elif kind == "student_text":
            await self.student_text(msg.get("text", ""), msg.get("final", True), msg.get("complete", True))
        elif kind == "playback_done":
            if msg.get("id") == self._cur_turn_id:
                self._playback_done.set()
        elif kind == "set_patience":
            self.cfg.patience = min(2.5, max(0.4, float(msg.get("seconds", 1.0))))
        elif kind == "end":
            await self.stop()
            await self._finish()

    async def student_speech_start(self, heard_sentences: int | None = None) -> None:
        """Barge-in: the student's voice always wins the floor (except while watching a fishbowl)."""
        if self._observing:
            return
        self._last_student_spoke = time.monotonic()
        self._last_student_event = time.monotonic()
        self._speech_ended_at = None
        if self.floor == "ai_speaking":
            await self._interrupt_ai(heard_sentences)
        elif self._turn_task and not self._turn_task.done():
            self._turn_task.cancel()  # an AI reply that is still being written is discarded
            self.thinking = None
        if self.floor != "student_speaking":
            self._student_t_start = self.now()
            await self._set_floor("student_speaking", "student")

    async def student_text(self, text: str, final: bool = True, complete: bool = True) -> None:
        """Transcript text for the student's utterance.

        complete=True (typed input, test clients): this text is the whole utterance, so speech also ends here.
        complete=False (mic client): more words may follow; the client's speech_end decides when speech ended.

        A key race: the mic client sends speech_end first, then the Whisper transcription arrives via
        student_text.  If NO_TEXT_LIMIT fires in between, the floor returns to idle and _speech_ended_at
        is cleared.  We must re-arm both so _student_done() can fire on the patience window.
        """
        text = text.strip()
        if not text or self._observing:
            return
        floor_was_idle = self.floor != "student_speaking"
        if floor_was_idle:
            # Save _student_t_start before student_speech_start() overwrites it.
            # When late Whisper text arrives after NO_TEXT_LIMIT reset the floor,
            # the original speech started seconds ago; we want that timestamp in the transcript.
            saved_t_start = self._student_t_start
            await self.student_speech_start()
            if saved_t_start > 0:
                self._student_t_start = saved_t_start
        self._last_text_at = time.monotonic()
        self._last_student_event = time.monotonic()
        if final:
            self._student_text.append(text)
            # Re-arm _speech_ended_at whenever we were idle (late Whisper text) OR when the
            # caller says the utterance is complete (typed input / test harness).
            if self._speech_ended_at is None and (floor_was_idle or complete):
                self._speech_ended_at = time.monotonic()
        await self.emit({"type": "caption", "speaker": "student", "text": text, "final": final})

    async def _interrupt_ai(self, heard_sentences: int | None) -> None:
        e = self._cur_entry
        if e is not None:
            if heard_sentences is not None and 0 < heard_sentences < len(self._cur_sentences):
                e.text = " ".join(self._cur_sentences[:heard_sentences])
            e.interrupted = True
            e.t_end = self.now()
            await self.emit({"type": "transcript_update", "entry": asdict(e)})
        self._interrupted.set()
        await self.emit({"type": "interrupted", "id": self._cur_turn_id})

    # ---------- AI turns ----------
    def _history(self) -> list[Line]:
        return [Line(speaker=e.speaker, text=e.text) for e in self.transcript]

    def _add(self, speaker: str, text: str, t_start: float, t_end: float | None = None) -> Entry:
        e = Entry(len(self.transcript), speaker, text, t_start, t_end)
        self.transcript.append(e)
        return e

    async def _ai_turn(self, force: str | None = None, instruction: str | None = None) -> bool:
        """Generate one AI turn and speak it. Returns True if it completed, False if cancelled or interrupted."""
        self._turn_seq += 1
        turn_id = self._turn_seq
        self.thinking = force or "all"
        await self.emit({"type": "state", "floor": self.floor, "speaker": self.speaker, "thinking": self.thinking})
        turn, source = await TE.next_turn(
            self.cfg.topic, self.panel, self._history(), self.cfg.lang, force, instruction
        )
        self.thinking = None
        if self.floor == "student_speaking":  # the student spoke while the model was writing
            return False
        self._last_turn = turn
        return await self._speak(turn, turn_id, source)

    async def _speak(self, turn: Turn, turn_id: int, source: str = "llm") -> bool:
        sentences = split_sentences(turn.text) or [turn.text]
        entry = self._add(turn.speaker, turn.text, self.now())
        self._cur_turn_id, self._cur_entry, self._cur_sentences = turn_id, entry, sentences
        self._playback_done.clear()
        self._interrupted.clear()
        await self._set_floor("ai_speaking", turn.speaker)
        await self.emit({
            "type": "turn", "id": turn_id, "speaker": turn.speaker, "text": turn.text,
            "sentences": sentences, "addresses": turn.addresses, "stance": turn.stance,
            "source": source, "entry": asdict(entry),
        })
        waits = [asyncio.create_task(self._playback_done.wait()), asyncio.create_task(self._interrupted.wait())]
        # If the client never confirms playback, move on rather than freeze the room.
        done, pending = await asyncio.wait(waits, timeout=estimate_seconds(turn.text) * 1.6 + 8, return_when=asyncio.FIRST_COMPLETED)
        for p in pending:
            p.cancel()
        self._cur_entry = None
        if self._interrupted.is_set():
            return False
        entry.t_end = self.now()
        await self.emit({"type": "transcript_update", "entry": asdict(entry)})
        await self._set_floor("idle")
        return True

    async def _run_turn(self, force: str | None = None, instruction: str | None = None) -> bool:
        """Run an AI turn as a cancellable task so barge-in can discard it while it is still being written."""
        self._turn_task = asyncio.create_task(self._ai_turn(force, instruction))
        await asyncio.wait({self._turn_task})
        t = self._turn_task
        self.thinking = None
        return (not t.cancelled()) and t.exception() is None and t.result() is True

    # ---------- main loop ----------
    async def _run(self) -> None:
        ticker = asyncio.create_task(self._ticker())
        try:
            await self._set_phase("opening")
            await self._run_turn(
                "moderator",
                "Open the discussion in 2 or 3 short sentences: state the topic, say everyone should build on "
                "each other, mention there is a closing round with a final statement from each person, then "
                "invite the first speaker."
                + (" Also say this is a fishbowl: the student will watch the first few exchanges and then be invited to join." if self._observing else ""),
            )
            await self.emit({"type": "observing", "value": self._observing})
            await self._set_phase("discussion")
            self._last_student_spoke = time.monotonic()
            await self._discussion()
            await self._closing()
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            log.exception("session crashed")
            await self.emit({"type": "error", "message": "The session hit a problem and ended."})
        finally:
            ticker.cancel()
            await self._finish()

    async def _discussion(self) -> None:
        while self.remaining() > self.cfg.closing:
            await asyncio.sleep(0.1)
            now = time.monotonic()
            if self.floor == "ai_speaking" or self.thinking:
                continue
            if self.floor == "student_speaking":
                if await self._student_done(now):
                    self._awaiting_student = False
                    self._consec_ai = 1
                    await self._run_turn()
                continue

            # The floor is idle and the student is quiet: the AIs may talk to each other.
            quiet_for = now - self._free_since
            if self._observing:
                if quiet_for >= AI_GAP:
                    if self._observed_turns >= FISHBOWL_TURNS:
                        await self._run_turn("moderator", "Invite the student to join the discussion now, referring to one point just made. Two sentences at most.")
                        self._observing = False
                        self._awaiting_student = True
                        await self.emit({"type": "observing", "value": False})
                    else:
                        self._observed_turns += 1
                        await self._run_turn(instruction="The student is only watching for now and cannot speak. Never address or ask the student anything; the AI participants debate among themselves, and the moderator only steers.")
                continue
            if self._awaiting_student:
                if quiet_for >= STUDENT_WAIT * 2:
                    self._awaiting_student = False
                    self._consec_ai = 0
                continue
            if self._consec_ai >= MAX_AI_IN_ROW:
                if quiet_for >= AI_GAP:
                    await self._run_turn(
                        "moderator",
                        "Bring the student in: ask them a short, pointed question about what was just said.",
                    )
                    self._awaiting_student = True
                continue
            if quiet_for >= AI_GAP:
                self._consec_ai += 1
                self._last_turn = None
                await self._run_turn()
                # A moderator question to the student hands them the floor; do not pile on another one.
                t = self._last_turn
                if t and t.speaker == "moderator" and t.addresses == "student":
                    self._awaiting_student = True

    async def _student_done(self, now: float) -> bool:
        """True once the student has finished and the patience window has passed with no new speech."""
        if self._speech_ended_at is None:
            if now - self._last_student_event < STUCK_LIMIT:
                return False
            # Watchdog: no speech_end and no words for a while. Stop waiting instead of freezing the room.
            log.warning("student turn stuck for %.0fs, forcing it to end", now - self._last_student_event)
            if not self._student_text:
                await self._set_floor("idle")
                return False
            self._speech_ended_at = now - self.cfg.patience  # words exist: commit them now
        if not self._student_text:
            if now - self._speech_ended_at > NO_TEXT_LIMIT:  # noise, no words arrived
                await self._set_floor("idle")
                self._speech_ended_at = None
            return False
        last = max(self._speech_ended_at, self._last_text_at or 0.0)
        if now - last < self.cfg.patience:
            return False
        text = " ".join(self._student_text)
        self._student_text, self._speech_ended_at = [], None
        entry = self._add("student", text, self._student_t_start, self.now())
        self._last_student_spoke = now
        await self.emit({"type": "transcript_update", "entry": asdict(entry)})
        await self._set_floor("idle")
        self._student_committed.set()
        return True

    async def _ticker(self) -> None:
        """Runs beside the main loop so the timer keeps moving while an AI is speaking."""
        while True:
            await asyncio.sleep(1.0)
            await self._tick()
            if self._detached_since and time.monotonic() - self._detached_since > DETACHED_LIMIT and self._task:
                self._task.cancel()

    async def _tick(self) -> None:
        await self.emit({"type": "timer", "remaining": round(self.remaining()), "phase": self.phase})
        silent = time.monotonic() - self._last_student_spoke
        if silent > self.cfg.nudge_after and time.monotonic() - self._last_nudge > self.cfg.nudge_after:
            self._last_nudge = time.monotonic()
            await self.emit({"type": "nudge", "text": f"You haven't spoken for {int(silent // 60)} minutes. Jump in when you're ready."})

    # ---------- closing ----------
    async def _closing(self) -> None:
        await self._set_phase("closing")
        await self._wait_for_floor()
        await self._run_turn(
            "moderator",
            "Announce the one-minute closing round: everyone gives a one-sentence final statement, "
            "AI participants first, then the student. Keep it to two sentences.",
        )
        for p in self.panel:
            await self._wait_for_floor()
            await self._run_turn(p.id, "This is your final statement: one sentence that sums up your position.")
        await self._wait_for_floor()
        await self._run_turn("moderator", "Invite the student to give their final statement now. One sentence.")
        # The student's closing window: ends on their statement or when time runs out.
        self._student_committed.clear()
        deadline = time.monotonic() + max(5.0, min(25.0, self.remaining()))
        while time.monotonic() < deadline:
            await asyncio.sleep(0.1)
            if self.floor == "student_speaking" and await self._student_done(time.monotonic()):
                break
            if self.floor == "idle" and self._student_committed.is_set():
                break
        await self._wait_for_floor()
        await self._run_turn("moderator", "Thank everyone and close the discussion in one or two sentences.")

    async def _wait_for_floor(self, limit: float = 15.0) -> None:
        """Let a student who is mid-sentence finish before the next AI turn starts."""
        end = time.monotonic() + limit
        while self.floor == "student_speaking" and time.monotonic() < end:
            if await self._student_done(time.monotonic()):
                break
            await asyncio.sleep(0.1)

    async def _finish(self) -> None:
        if self._finished:
            return
        self._finished = True
        self.phase = "ended"
        await self._set_floor("idle")
        await self.emit({"type": "ended", "transcript": [asdict(e) for e in self.transcript]})
