"""Report check: python scripts_report_test.py  (calls Groq). Verifies every quote exists verbatim in the transcript."""
import asyncio, json, sys
from dotenv import load_dotenv
load_dotenv(".env")
sys.path.insert(0, ".")
sys.stdout.reconfigure(encoding="utf-8")
from app import report as R

T = [
 (0, "moderator", "Welcome everyone. Our topic is whether India should adopt a four-day work week. Arjun, you may start.", 0, 6, False),
 (1, "dominator", "Four days will cripple productivity; companies will lose about 20% output, and India can't afford that lag.", 7, 13, False),
 (2, "data", "Actually, trials in similar economies showed only a small dip in output initially, which recovered within months as firms restructured tasks.", 14, 22, False),
 (3, "student", "I would start by defining productivity: output per hour, not hours at a desk. Um, so I think the four day week can work.", 24, 33, False),
 (4, "moderator", "Student, could you elaborate on how you would measure output per hour in Indian firms?", 34, 40, False),
 (5, "dominator", "Student, even if you measure output per hour, cutting a day forces longer shifts and fatigue.", 41, 45, True),
 (6, "student", "Building on Meera, a four day week works best where output is measurable, so we should pilot it by sector.", 45.5, 52, False),
 (7, "quiet", "If we only look at sector pilots, we miss the hidden cost of coordinating supply chains that rely on a five-day rhythm.", 53, 60, False),
 (8, "moderator", "We now begin the closing round. Please give a one sentence final statement.", 61, 66, False),
 (9, "student", "To conclude, a sector by sector pilot is the responsible path.", 68, 72, False),
]
entries = [dict(id=i, speaker=s, text=t, t_start=a, t_end=b, interrupted=x) for i, s, t, a, b, x in T]

async def main():
    # 1. grounding unit checks (no network)
    es = [R.Entry(**e) for e in entries]
    assert R.ground_quote("output per hour, not hours at a desk", 3, es)[0] == "output per hour, not hours at a desk"
    assert R.ground_quote("OUTPUT per hour not hours at a DESK", 3, es)[0] == "output per hour, not hours at a desk"   # case/punctuation tolerant, returns original text
    assert R.ground_quote("output per hour, not hours at a desk", 99, es)[1].id == 3                                      # wrong line id repaired
    assert R.ground_quote("output per hour not hours in an office", 3, es) is None                                          # paraphrase dropped
    assert R.ground_quote("automation will definitely create millions of jobs", 3, es) is None                              # invented dropped
    print("grounding checks passed")
    # 2. real report
    rep = await R.build_report("Should India adopt a four-day work week?", entries)
    d = rep.model_dump()
    print("overall", d["overall"], "| dropped", d["dropped"], "| error", d["error"])
    print("shares", [(s["name"], round(s["share"] * 100)) for s in d["shares"]])
    bad = 0
    texts = {e["id"]: e["text"] for e in entries}
    for c in d["categories"]:
        print(f"\n{c['label']}: {c['score']}  {c['summary']}")
        for p in c["points"]:
            ok = p["quote"] in texts[p["line_id"]]
            bad += not ok
            print(f"  - {p['text']}\n    “{p['quote']}” @ {p['t']:.0f}s line {p['line_id']} {'OK' if ok else 'NOT VERBATIM'}")
    print("\nMissed openings:")
    for m in d["missed"]:
        ok = (not m["quote"]) or m["quote"] in texts[m["line_id"]]
        bad += not ok
        print(f"  - {m['suggestion']}\n    at “{m['quote']}” line {m['line_id']} {'OK' if ok else 'NOT VERBATIM'}")
    print("\nnon-verbatim quotes:", bad)
    # 3. empty transcript
    empty = await R.build_report("x", [e for e in entries if e["speaker"] != "student"])
    print("empty case:", empty.empty, "|", empty.summary[:60], "| generic tips:", len(empty.missed))

asyncio.run(main())
