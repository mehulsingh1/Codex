import asyncio
import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

load_dotenv()

from . import stt, tts, turn_engine  # noqa: E402  (after load_dotenv so env is ready)
from . import report  # noqa: E402
from .session import Config, Session  # noqa: E402

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Load models once at startup, off the event loop.
    await asyncio.gather(asyncio.to_thread(tts.load_kokoro), turn_engine.warm(), stt.warm())
    yield


app = FastAPI(title="GD Arena", lifespan=lifespan)
_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://mehulsingh1-codex.pages.dev",  # Cloudflare Pages default URL
]
# Allow extra origins set via env (comma-separated), e.g. custom domain
_extra = os.getenv("CORS_ORIGINS", "")
if _extra:
    _CORS_ORIGINS.extend([o.strip() for o in _extra.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-TTS-Engine"],
)


@app.get("/health")
def health():
    return {"status": "ok", "groq_key_set": bool(os.getenv("GROQ_API_KEY")), **tts.status()}


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
    voice: str = "moderator"  # persona id
    lang: str = "en"  # "en" or "hi"


@app.post("/tts")
async def tts_endpoint(req: TTSRequest):
    result = await tts.synthesize(req.text, req.voice, req.lang)
    if result is None:
        # Tells the client to use browser speechSynthesis.
        return JSONResponse({"fallback": "browser"}, status_code=503, headers={"X-TTS-Engine": "browser"})
    audio, mime, engine = result
    return Response(audio, media_type=mime, headers={"X-TTS-Engine": engine})


@app.post("/stt")
async def stt_endpoint(audio: UploadFile = File(...), language: str | None = Form(None)):
    data = await audio.read()
    if not data:
        raise HTTPException(400, "empty audio")
    try:
        text = await stt.transcribe(data, audio.filename or "audio.webm", language)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"transcription failed: {type(e).__name__}") from e
    return {"text": text}


# ---------- realtime room ----------
SESSIONS: dict[str, Session] = {}


def _config_from(raw: dict) -> Config:
    allowed = {"topic", "panel", "format", "lang", "duration", "closing", "patience", "nudge_after"}
    cfg = Config(**{k: v for k, v in raw.items() if k in allowed})
    cfg.panel = max(3, min(5, int(cfg.panel)))
    cfg.duration = max(30.0, float(cfg.duration))
    cfg.closing = min(float(cfg.closing), cfg.duration / 2)
    return cfg


@app.websocket("/ws")
async def room_ws(ws: WebSocket):
    """First message: {"type":"start","config":{...}} or {"type":"resume","session_id":"..."}."""
    await ws.accept()
    session: Session | None = None
    try:
        first = await ws.receive_json()
        if first.get("type") == "resume" and first.get("session_id") in SESSIONS:
            session = SESSIONS[first["session_id"]]
        elif first.get("type") == "start":
            session = Session(_config_from(first.get("config", {})))
            SESSIONS[session.id] = session
        else:
            await ws.send_json({"type": "error", "message": "unknown session, please start a new one", "fatal": True})
            return
        await session.attach(ws.send_json)
        if first.get("type") == "start":
            session.start()
        while True:
            await session.on_message(await ws.receive_json())
    except WebSocketDisconnect:
        pass
    finally:
        if session is not None:
            session.detach()
            if session.phase == "ended":
                SESSIONS.pop(session.id, None)


class ReportRequest(BaseModel):
    topic: str
    transcript: list[dict]


@app.post("/report")
async def report_endpoint(req: ReportRequest):
    try:
        return (await report.build_report(req.topic, req.transcript)).model_dump()
    except Exception as e:  # noqa: BLE001 - malformed transcript etc.
        raise HTTPException(422, f"could not build report: {type(e).__name__}") from e
