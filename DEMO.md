# 60-second demo

**Before you start:** servers running (`.\dev.ps1`), Chrome open at http://localhost:5173, headphones on, microphone allowed, `/health` shows `kokoro: true`. Do one dry run so the 3D scene and voices are warm.

| Time | Do | Say (or point out) |
|---|---|---|
| 0:00 | Setup screen. Pick **"AI will replace more jobs than it creates"**. Leave panel at 4, Standard, English. | "GD Arena lets you practise a placement group discussion out loud. Note the banner: every other participant is an AI." |
| 0:08 | Click **Enter the room**. | "A round table, you at the bottom, a moderator and four AI personas: a dominator, a data person, a quiet sharp one, a drifter." |
| 0:12 | The moderator opens. Watch the spotlight. | "The light follows whoever is speaking, and pulses with their real voice." |
| 0:22 | Start talking: **"I'd like to define what we mean by jobs created versus jobs changed."** Keep going until an AI is mid-sentence if you can. | "Live captions on the left. Now I'll cut in on the AI..." (speak over them) "...and it stops instantly. The cut-off line is marked *interrupted* in the transcript." |
| 0:35 | Stop talking for a beat. | "After a short pause the panel answers me, and then each other, not just me. Patience is adjustable." |
| 0:42 | Click **Type**, enter one short answer, press Enter. | "No mic, or in a quiet room? Typing works the same." |
| 0:48 | Click **End session**. | "Now the honest part." |
| 0:52 | Report loads. Show the **ring chart**, then click a **quote chip**. | "Who spoke how much, then scored feedback. Every point has a verbatim quote with a timestamp. Click it and it jumps to that exact line. Quotes the model invented are caught and dropped in code." |
| 0:58 | Scroll to **What you could have said**. | "And three moments you could have jumped in, with what to say." |

## If something goes wrong on stage

- **No sound:** the toast says voice fell back to browser speech; keep going, the captions and transcript still work.
- **Mic denied:** the typed bar appears automatically. Say "this is the fallback".
- **Slow report:** the skeleton cards are the loading state; the transcript is already on screen.
- **No network at all:** open `/?sim=1` for the scripted room, and `/?demo=report` for a sample report.

## Extras to mention if there is time

- **Fishbowl:** you watch the AIs debate first, then the moderator invites you in.
- **Hinglish:** switch language on setup for mixed Hindi-English panel and Hindi voices.
- **Progress:** the setup screen shows your last sessions: score trend, strengths, filler-word and talk-share habits.
- **Resilience:** pull the network cable mid-session and it reconnects and resumes.
