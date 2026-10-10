"""Drive a full session over the real WebSocket with a text-only student. Server must be running.
   python scripts_ws_sim.py [ws_url]"""
import asyncio
import json
import sys
import time

import websockets

URL = sys.argv[1] if len(sys.argv) > 1 else "ws://127.0.0.1:8000/ws"
CONFIG = {"topic": "Should India adopt a four-day work week?", "panel": 3, "duration": 60, "closing": 28, "patience": 0.5}
STUDENT = [
    "I would start by defining productivity: output per hour, not hours at a desk.",
    "Building on Meera, a four day week works best where output is measurable, so we should pilot it by sector.",
]


async def main():
    sys.stdout.reconfigure(encoding="utf-8")
    t0 = time.time()
    log = lambda s: print(f"{time.time()-t0:6.1f}s  {s}", flush=True)
    stats = {"turns": 0, "interrupted": 0, "student": 0, "phases": [], "timers": 0}
    async with websockets.connect(URL, max_size=None) as ws:
        await ws.send(json.dumps({"type": "start", "config": CONFIG}))
        spoken = 0
        barged = False
        pending = []
        async def student_say(text, delay):
            await asyncio.sleep(delay)
            log(f"STUDENT says: {text}")
            await ws.send(json.dumps({"type": "student_text", "text": text}))
        async for raw in ws:
            m = json.loads(raw)
            k = m["type"]
            if k == "snapshot": log(f"snapshot phase={m['phase']} session={m['session_id']}")
            elif k == "phase": stats["phases"].append(m["phase"]); log(f"PHASE -> {m['phase']}")
            elif k == "timer": stats["timers"] += 1
            elif k == "state": log(f"floor={m['floor']:16} speaker={m['speaker']} thinking={m['thinking']}")
            elif k == "turn":
                stats["turns"] += 1
                log(f"TURN {m['id']} {m['speaker']} [{m['source']}]: {m['text']}")
                # Barge in on the first AI turn that follows the student's first remark.
                if stats["student"] >= 1 and not barged and m["speaker"] not in ("moderator",):
                    barged = True
                    await asyncio.sleep(0.4)
                    log("STUDENT barges in (speech_start, heard 1 sentence)")
                    await ws.send(json.dumps({"type": "speech_start", "heard_sentences": 1}))
                    asyncio.create_task(student_say(STUDENT[1], 0.8))
                    continue
                await asyncio.sleep(0.4)  # pretend TTS playback
                await ws.send(json.dumps({"type": "playback_done", "id": m["id"]}))
                # After the 2nd AI turn the student speaks (only once, in the discussion phase).
                if stats["turns"] == 3 and spoken == 0:
                    spoken = 1; stats["student"] += 1
                    asyncio.create_task(student_say(STUDENT[0], 0.3))
            elif k == "interrupted": stats["interrupted"] += 1; log("INTERRUPTED (client would stop audio now)")
            elif k == "transcript_update" and m["entry"]["speaker"] == "student": stats["student"] = max(stats["student"], 1)
            elif k == "nudge": log(f"NUDGE {m['text']}")
            elif k == "error": log(f"ERROR {m['message']}")
            elif k == "ended":
                log("ENDED")
                print("\n--- TRANSCRIPT ---")
                for e in m["transcript"]:
                    flag = " [INTERRUPTED]" if e["interrupted"] else ""
                    print(f"{e['t_start']:5.1f}-{(e['t_end'] or 0):5.1f}  {e['speaker']:9}{flag} {e['text']}")
                print("\nstats:", stats)
                return

asyncio.run(main())
