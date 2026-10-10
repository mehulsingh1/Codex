"""TTS chain: Kokoro (local GPU) -> Edge TTS -> None (client uses browser speechSynthesis)."""
import asyncio
import io
import logging

from .voices import voice_for

log = logging.getLogger("tts")

_kokoro = None
_kokoro_error: str | None = None


def load_kokoro() -> None:
    """Load Kokoro once at startup. Failure is recorded, not raised."""
    global _kokoro, _kokoro_error
    try:
        import torch
        from kokoro import KPipeline

        device = "cuda" if torch.cuda.is_available() else "cpu"
        _kokoro = KPipeline(lang_code="a", device=device)
        # Warm every persona voice now so the first real turn doesn't pay the download/load cost.
        from .voices import VOICES
        for pid, v in VOICES.items():
            try:
                _kokoro_wav("Ready.", v["kokoro"])
            except Exception as e:  # noqa: BLE001 - one bad voice must not disable Kokoro for everyone
                log.warning("Kokoro voice %s (%s) failed to load: %s", v["kokoro"], pid, e)
        _kokoro_error = None
        log.info("Kokoro loaded on %s", device)
    except Exception as e:  # noqa: BLE001 - any import/runtime failure means fallback
        _kokoro = None
        _kokoro_error = f"{type(e).__name__}: {e}"
        log.warning("Kokoro unavailable: %s", _kokoro_error)


def status() -> dict:
    return {"kokoro": _kokoro is not None, "kokoro_error": _kokoro_error}


def _kokoro_wav(text: str, voice: str) -> bytes:
    import numpy as np
    import soundfile as sf

    chunks = [audio.cpu().numpy() if hasattr(audio, "cpu") else audio
              for _, _, audio in _kokoro(text, voice=voice)]
    if not chunks:
        raise RuntimeError("kokoro produced no audio")
    buf = io.BytesIO()
    sf.write(buf, np.concatenate(chunks), 24000, format="WAV")
    return buf.getvalue()


async def _edge_mp3(text: str, voice: str) -> bytes:
    import edge_tts

    out = bytearray()
    async for chunk in edge_tts.Communicate(text, voice).stream():
        if chunk["type"] == "audio":
            out.extend(chunk["data"])
    if not out:
        raise RuntimeError("edge-tts produced no audio")
    return bytes(out)


async def synthesize(text: str, persona: str, lang: str = "en") -> tuple[bytes, str, str] | None:
    """Return (audio_bytes, mime, engine) or None when the client should use browser TTS."""
    v = voice_for(persona)
    # Kokoro has no Hindi voices, so Hinglish goes straight to Edge.
    if _kokoro is not None and lang == "en":
        try:
            audio = await asyncio.to_thread(_kokoro_wav, text, v["kokoro"])
            return audio, "audio/wav", "kokoro"
        except Exception as e:  # noqa: BLE001
            log.warning("kokoro failed: %s", e)
    edge_voice = v["edge_hi"] if lang == "hi" else v["edge_en"]
    for attempt in range(2):  # retry once
        try:
            return await _edge_mp3(text, edge_voice), "audio/mpeg", "edge"
        except Exception as e:  # noqa: BLE001
            log.warning("edge-tts failed (attempt %d): %s", attempt + 1, e)
    return None
