"""Voice map: one fixed Kokoro voice and Edge voices per persona. Genders match the names.

Moderator Ms. Rao (f), Arjun (m), Meera (f), Kavya (f), Rohan (m), Sana (f).
Kokoro prefixes: af_ American female, am_ American male, bf_ British female, bm_ British male.
Hindi has only two Edge voices (Swara female, Madhur male), so the female personas share Swara there.
"""

# persona id -> {"kokoro": voice, "edge_en": voice, "edge_hi": voice}
VOICES = {
    "moderator": {"kokoro": "bf_emma", "edge_en": "en-IN-NeerjaNeural", "edge_hi": "hi-IN-SwaraNeural"},
    "dominator": {"kokoro": "am_adam", "edge_en": "en-IN-PrabhatNeural", "edge_hi": "hi-IN-MadhurNeural"},
    "data": {"kokoro": "af_heart", "edge_en": "en-US-AriaNeural", "edge_hi": "hi-IN-SwaraNeural"},
    "quiet": {"kokoro": "af_nicole", "edge_en": "en-US-JennyNeural", "edge_hi": "hi-IN-SwaraNeural"},
    "drifter": {"kokoro": "am_liam", "edge_en": "en-GB-RyanNeural", "edge_hi": "hi-IN-MadhurNeural"},
    "diplomat": {"kokoro": "bf_isabella", "edge_en": "en-GB-SoniaNeural", "edge_hi": "hi-IN-SwaraNeural"},
}

DEFAULT = VOICES["moderator"]


def voice_for(persona: str) -> dict:
    return VOICES.get(persona, DEFAULT)
