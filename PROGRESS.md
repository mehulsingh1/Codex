# Progress

- [x] Phase 0: Scaffold
- [x] Phase 1: Voice services (Kokoro on GPU warm 0.37-0.61 s/sentence, first call 1.1 s; Edge 1.5-19 s variable; Whisper ~3.6 s)
- [x] Phase 2: Personas and turn engine
- [x] Phase 3: Room and realtime loop
- [x] Phase 4a: Voice client
- [x] Phase 4b: 3D table scene and glass UI (screenshots in docs/screens; 60+ fps; wired to the live backend)
- [x] Phase 5: Report (quotes verified against the transcript in code; unit tested and checked live)
- [x] Phase 6: Hardening
- [x] Phase 7: Extras
- [x] Phase 8: Polish and demo

## Decisions / notes
- Machine GPU is an RTX 4060 Laptop (prompt said 4050); same plan applies.
- Python 3.13 is installed; Kokoro/PyTorch may need Python 3.10-3.12. Backend uses a 3.12 venv if available, and TTS falls back to Edge TTS otherwise.
- espeak-ng was not found on PATH (needed by Kokoro).
- Frontend dev server proxies `/api/*` and `/ws` to the backend on :8000.
- UI built before backend: `useRoomSim.ts` produces the same `RoomState` the WebSocket client will. Swap it for the real client in `ui/Room.tsx`.
- Real audio levels go into `audio/levelBus.ts` (`speaker`, `mic`, 0..1); the 3D scene and 2D fallback both read it.
- Name pills are plain DOM positioned by projecting seat positions each frame (drei `<Html>` dropped a pill intermittently). StrictMode is off for that reason too.
- Kokoro venv: `backend/.venv312` (conda, Python 3.12, CUDA torch). Python 3.13 only gets Kokoro 0.7.x. espeak-ng comes via the `espeakng-loader` pip package, not a system install.
- Measured with Edge on the RTX 4060 (vsync off): 3D scene runs far above 60 fps at 1366x768 and 1920x1080.
- Groq no longer serves llama-3.3-70b / llama-3.1-8b. Defaults are `openai/gpt-oss-120b` (turns) and `openai/gpt-oss-20b` (fast/rate-limit fallback), overridable via `GROQ_MAIN_MODEL` / `GROQ_FAST_MODEL`. Turns take ~0.6-1.2 s; one 9 s outlier seen, so each LLM call now has a 6 s timeout.
- WebSocket protocol (backend/app/session.py, route /ws): client sends start/resume, speech_start (barge-in, optional heard_sentences), speech_end, student_text, playback_done, set_patience, end. Server sends snapshot, phase, state, turn (with sentences for TTS), transcript_update, interrupted, caption, timer, nudge, ended.
- Phase 3 check run with `scripts_ws_sim.py` against a live server: full session (opening, discussion, barge-in marked interrupted, closing round, end).
- Phase 4a verified in real Edge with a fake mic (speech file) against the live backend: opening turn spoken via Kokoro, VAD detected speech, barge-in cancelled audio and marked the moderator line interrupted, Whisper fallback transcribed the speech verbatim and an AI replied to it. Still needs a human check with a real mic + Chrome (Web Speech live captions could not be exercised headless).
- Reply latency after the student stops: ~1.8 s recogniser wait (first miss only) + patience + LLM ~1 s; Whisper upload took ~5.6 s from this network, so Chrome Web Speech is the fast path.
- Gotcha: stopping the servers by port can leave an old uvicorn worker (it holds the socket). Use `taskkill /T /F` on the process tree.
- `?sim=1` runs the scripted simulator instead of the backend.
- Phase 6: 30 pytest tests (turn engine, report validation, session floor/barge-in/resume) pass offline with a fake Groq client; `scripts` of failure simulation in a real browser: mic denied, dropped WebSocket + resume, TTS 500, STT 500 all recovered (14/14 checks). Test hook: `?test=1` exposes `window.__gd.drop()`.
- Phase 7 done: Hinglish (Hindi Edge voices; Roman-script Hinglish verified through Whisper), fishbowl (student observes, mic locked, moderator invites them in), progress over sessions (localStorage), CC toggle + 3 text sizes persisted.
- Phase 8 done: loading states (connect pill, report skeletons, caption placeholder, lazy 3D), phone layout checked, README with Windows setup, DEMO.md.
- Final live check (real Edge + backend + Groq): setup -> room -> typed answers -> End session -> real report; 7/7 quote chips verbatim; summary saved. 31 backend tests pass; production build passes.
- Not verified by a human: real microphone in Chrome with Web Speech live captions (only a fake mic file + Whisper path was exercised headless).
- Landing page + new topic page (Phase 9, user request): hero/section videos from the provided clips (compressed to frontend/public/media), glass nav, FAQ with structured data, three topic suggestions + Surprise-me wand. Fixed a CSS class clash (.start) that broke the first version of the topic page.
- STT latency fix: Whisper uploads on speech end in parallel with Chrome's recogniser; first result wins. Backend died once silently; it now logs to backend/server.log and backend/server.err.log when started by hand (see README troubleshooting).
