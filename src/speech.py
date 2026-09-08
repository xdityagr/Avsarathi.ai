"""
Turning speech into text, so people can talk instead of type.

This matters more here than it looks. Typing Devanagari, Tamil or Odia on a
phone keyboard is slow enough that people give up and type romanised English,
or give up entirely — and the person this product is for may not read
comfortably in any script. Speaking is the natural input, and it is the same
input on WhatsApp (a voice note) and on the website (hold to talk).

Deepgram's nova-3 does the transcription. Verified against the account rather
than assumed: it handles eleven of our thirteen languages directly, and
`language=multi` for anything else.

TWO REAL GAPS, stated rather than papered over: Malayalam and Odia are not in
nova-3's language list. They fall back to the multilingual model, which will
often produce something usable and sometimes will not. Voice in those two
languages should be treated as unproven until it is tested with real speakers.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

import httpx

from src.config import get_settings

logger = logging.getLogger(__name__)

DEEPGRAM_URL = "https://api.deepgram.com/v1/listen"

MODEL = "nova-3"

# Confirmed by probing the account, not read off a docs page.
SUPPORTED_LANGUAGES = {
    "en", "hi", "bn", "mr", "te", "ta", "gu", "kn", "pa", "as", "ur",
}

# Malayalam and Odia are absent above. `multi` is the honest fallback: it may
# transcribe them and may not, so callers should treat a low-confidence result
# in those languages as "please type it instead" rather than as the answer.
MULTILINGUAL = "multi"

# Voice notes are short. A minute of audio that takes longer than this to come
# back is a failure, not a slow success.
TIMEOUT = httpx.Timeout(45.0, connect=10.0)

# Below this, we would rather ask someone to repeat themselves than act on a
# guess — acting on a misheard income figure is worse than asking again.
MIN_CONFIDENCE = 0.45


@dataclass
class Transcript:
    text: str = ""
    confidence: float = 0.0
    language: str = ""
    """False when the audio could not be transcribed at all."""
    ok: bool = False
    """True when we heard something but not clearly enough to act on."""
    unclear: bool = False


def is_available() -> bool:
    return bool(get_settings().deepgram_api_key)


def language_is_supported(language: Optional[str]) -> bool:
    return bool(language) and language in SUPPORTED_LANGUAGES


async def transcribe(
    audio: bytes,
    content_type: str = "audio/ogg",
    language: Optional[str] = None,
) -> Transcript:
    """Audio in, words out.

    `language` is the one the interface is already using. Naming it explicitly
    beats letting the model guess: a Tamil speaker saying a scheme name that is
    half English is much better served by "this is Tamil" than by detection.
    """
    settings = get_settings()
    if not settings.deepgram_api_key:
        return Transcript()

    chosen = language if language_is_supported(language) else MULTILINGUAL
    params = {
        "model": MODEL,
        "language": chosen,
        # Punctuation makes a transcript readable when it is echoed back; the
        # engine does not care either way.
        "punctuate": "true",
        "smart_format": "true",
    }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.post(
                DEEPGRAM_URL,
                params=params,
                headers={
                    "Authorization": f"Token {settings.deepgram_api_key}",
                    "Content-Type": content_type or "audio/ogg",
                },
                content=audio,
            )
            response.raise_for_status()
            payload = response.json()
    except Exception as exc:                                  # noqa: BLE001
        logger.warning("Transcription failed (%s, %s): %s", chosen, content_type, exc)
        return Transcript()

    alternatives = (
        payload.get("results", {})
        .get("channels", [{}])[0]
        .get("alternatives", [{}])
    )
    best = alternatives[0] if alternatives else {}
    text = (best.get("transcript") or "").strip()
    confidence = float(best.get("confidence") or 0.0)

    if not text:
        return Transcript(language=chosen)

    return Transcript(
        text=text,
        confidence=confidence,
        language=chosen,
        ok=True,
        unclear=confidence < MIN_CONFIDENCE,
    )
