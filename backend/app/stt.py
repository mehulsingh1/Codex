"""Speech-to-text via Groq Whisper."""
import asyncio
import os

_client = None


def _get_client():
    global _client
    if _client is None:
        from groq import Groq

        key = os.getenv("GROQ_API_KEY")
        if not key:
            raise RuntimeError("GROQ_API_KEY not set")
        _client = Groq(api_key=key)
    return _client


# Whisper invents these when it is given noise or near-silence.
HALLUCINATIONS = {
    "thank you", "thanks", "thank you for watching", "thanks for watching", "you", "bye", "bye bye",
    "okay", "ok", "the end", "so", "yeah", "uh", "um", "mm", "hmm",
}
MIN_WORDS_FOR_SHORT_CLIP = 2
SHORT_CLIP_BYTES = 20_000  # about 5 s of 32 kbps opus


def clean_transcript(text: str, no_speech_probs: list[float], clip_bytes: int) -> str:
    """Drop likely hallucinations: low speech confidence, or a stock phrase from a very short clip."""
    text = text.strip()
    if not text:
        return ""
    if no_speech_probs and min(no_speech_probs) > 0.6:  # Whisper itself says there was no speech
        return ""
    norm = "".join(ch for ch in text.lower() if ch.isalnum() or ch.isspace()).strip()
    if clip_bytes < SHORT_CLIP_BYTES and (norm in HALLUCINATIONS or len(norm.split()) < MIN_WORDS_FOR_SHORT_CLIP):
        return ""
    return text


def _transcribe(data: bytes, filename: str, language: str | None) -> str:
    kwargs = {"file": (filename, data), "model": "whisper-large-v3-turbo", "response_format": "verbose_json"}
    if language:
        kwargs["language"] = language
    r = _get_client().audio.transcriptions.create(**kwargs)
    probs = [float(getattr(seg, "no_speech_prob", None) if not isinstance(seg, dict) else seg.get("no_speech_prob", 0.0) or 0.0)
             for seg in (getattr(r, "segments", None) or [])]
    return clean_transcript(r.text, probs, len(data))


async def transcribe(data: bytes, filename: str = "audio.webm", language: str | None = None) -> str:
    last = None
    for attempt in range(2):  # retry once
        try:
            return await asyncio.to_thread(_transcribe, data, filename, language)
        except Exception as e:  # noqa: BLE001
            last = e
            await asyncio.sleep(0.5 * (attempt + 1))
    raise last


async def warm() -> None:
    """Open the connection to Groq at startup so the first transcription is not slow. Never raises."""
    try:
        await asyncio.wait_for(asyncio.to_thread(lambda: _get_client().models.list()), timeout=15)
    except Exception:  # noqa: BLE001
        pass
