"""Text-only simulation of a discussion: python scripts_sim.py ["topic"]"""
import asyncio
import sys
import time

from dotenv import load_dotenv

load_dotenv()
sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, ".")
from app import personas as P  # noqa: E402
from app.turn_engine import Line, next_turn  # noqa: E402

TOPIC = sys.argv[1] if len(sys.argv) > 1 else "AI will replace more jobs than it creates"
STUDENT_LINES = {
    3: "I think we are mixing two things: jobs lost versus jobs changed. Reskilling is the real question.",
}


async def main():
    panel = P.roster(4)
    history: list[Line] = []
    print(f"TOPIC: {TOPIC}\nPANEL: {', '.join(p.name + ' (' + p.role + ')' for p in panel)}\n")
    t = time.perf_counter()
    turn, src = await next_turn(TOPIC, panel, history, force_speaker="moderator",
                                instruction="Open the discussion: state the topic, the rules, and invite the first speaker.")
    for n in range(1, 8):
        if turn is None:
            turn, src = await next_turn(TOPIC, panel, history)
        who = P.get(turn.speaker).name
        print(f"[{n}] {who:8} ({turn.stance:8} -> {turn.addresses:9}) [{src}, {time.perf_counter()-t:.1f}s]\n    {turn.text}\n")
        history.append(Line(speaker=turn.speaker, text=turn.text))
        t = time.perf_counter()
        turn = None
        if n in STUDENT_LINES:
            history.append(Line(speaker="student", text=STUDENT_LINES[n]))
            print(f"    >> STUDENT: {STUDENT_LINES[n]}\n")

asyncio.run(main())
