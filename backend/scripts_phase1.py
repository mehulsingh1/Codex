import asyncio, os, sys, time
sys.path.insert(0, ".")
from dotenv import load_dotenv; load_dotenv()
from app import tts, stt
from app.voices import VOICES

async def main():
    tts.load_kokoro()
    print("status:", tts.status())
    text = "I think we should look at this from a practical angle first."
    rows = []
    for p in ["moderator", "dominator", "data", "quiet", "drifter"]:
        t = time.perf_counter()
        r = await tts.synthesize(text, p, "en")
        dt = time.perf_counter() - t
        rows.append((p, r[2] if r else "browser", len(r[0]) if r else 0, dt))
    for p in ["diplomat"]:
        t = time.perf_counter()
        r = await tts.synthesize("Chaliye, is topic par baat karte hain.", p, "hi")
        rows.append((p + "(hi)", r[2] if r else "browser", len(r[0]) if r else 0, time.perf_counter() - t))
    print(f"{'voice':14}{'engine':8}{'bytes':>9}{'latency_s':>11}")
    for p, e, n, dt in rows: print(f"{p:14}{e:8}{n:9}{dt:11.2f}")
    # STT round trip on Edge audio
    r = await tts.synthesize(text, "moderator", "en")
    open("t.mp3", "wb").write(r[0])
    t = time.perf_counter()
    out = await stt.transcribe(r[0], "t.mp3", "en")
    print(f"STT ({time.perf_counter()-t:.2f}s): {out!r}")
asyncio.run(main())
