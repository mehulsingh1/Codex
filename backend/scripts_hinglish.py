"""Check Hinglish end to end: LLM text + Edge Hindi voice + Whisper round trip."""
import asyncio, sys, time
sys.path.insert(0, ".")
sys.stdout.reconfigure(encoding="utf-8")
from dotenv import load_dotenv; load_dotenv(".env")
from app import personas as P, stt, tts
from app.turn_engine import Line, next_turn

async def main():
    panel = P.roster(3)
    hist = [Line(speaker="student", text="Mera maanna hai ki four day work week se productivity badh sakti hai.")]
    for force in ("dominator", "data"):
        turn, src = await next_turn("Should India adopt a four-day work week?", panel, hist, "hi", force)
        print(f"[{src}] {turn.speaker}: {turn.text}")
        t = time.perf_counter()
        r = await tts.synthesize(turn.text, turn.speaker, "hi")
        print(f"   TTS engine={r[2] if r else None} {time.perf_counter()-t:.1f}s bytes={len(r[0]) if r else 0}")
        if r:
            back = await stt.transcribe(r[0], "x.mp3", "hi")
            print(f"   whisper(hi) heard: {back}")
asyncio.run(main())
