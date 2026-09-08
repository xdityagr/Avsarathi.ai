"""
Opt-out, and the notice that comes before anything else.

This lived inside the old LangGraph flow and was very nearly lost when WhatsApp
moved to the shared brain — which would have been the worst kind of regression,
because STOP is not a feature. On a channel that reaches someone's personal
phone, the ability to make it stop is the difference between a service and a
nuisance, and honouring it is required by both WhatsApp's policy and Twilio's.

What changed deliberately: START is no longer a gate. Joining the Twilio
sandbox is itself an opt-in, and demanding a second magic word before answering
a question turns a person away at the door for a formality. So the first
message gets the notice *and* an answer. STOP still stops everything, at any
point, in any of the supported languages.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

# Opted-out numbers. In memory, which is honest for a demo and wrong for
# production: a restart forgets that someone asked to be left alone, and that
# is the one thing this file exists to remember. Moving it into the database is
# the first thing to do before this handles real traffic.
_OPTED_OUT: set[str] = set()

# Written in each script rather than transliterated, because someone who wants
# this to stop should not have to type in English to make it happen.
STOP_WORDS = {
    "stop", "unsubscribe", "cancel", "end", "quit",
    "बंद", "रोको", "बंद करो",                     # Hindi
    "থামো", "বন্ধ",                                # Bengali
    "थांबा",                                       # Marathi
    "ఆపు", "ఆపండి",                                # Telugu
    "நிறுத்து",                                    # Tamil
    "બંધ",                                         # Gujarati
    "ನಿಲ್ಲಿಸಿ",                                     # Kannada
    "നിർത്തുക",                                    # Malayalam
    "ਬੰਦ",                                         # Punjabi
    "ବନ୍ଦ",                                        # Odia
    "বন্ধ কৰক",                                    # Assamese
    "بند",                                         # Urdu
}

START_WORDS = {"start", "शुरू", "शुरु", "চালু", "தொடங்கு", "प्रारंभ", "resume"}

NOTICE = (
    "Namaste. I can find the government schemes you are entitled to — housing, "
    "pension, scholarship, medical help, a business loan — check what you "
    "qualify for, and point you to an office that can process it.\n\n"
    "What you tell me is used to match schemes and nothing else. I never ask "
    "for your Aadhaar number, your bank password, or any fee.\n\n"
    "Reply *STOP* at any time and I will not message you again."
)

STOPPED = (
    "Stopped. I will not message you again.\n\n"
    "Your answers have been cleared. Reply *START* whenever you want to begin "
    "again — there is no charge and no penalty for stopping."
)

RESUMED = "Welcome back. What do you need help with?"


def _normalise(text: str) -> str:
    return text.strip().strip(".!।").casefold()


def is_stop(text: str) -> bool:
    return _normalise(text) in {word.casefold() for word in STOP_WORDS}


def is_start(text: str) -> bool:
    return _normalise(text) in {word.casefold() for word in START_WORDS}


def has_opted_out(user_id: str) -> bool:
    return user_id in _OPTED_OUT


def opt_out(user_id: str) -> None:
    _OPTED_OUT.add(user_id)
    logger.info("Opted out: %s", user_id[:10] + "…")


def opt_in(user_id: str) -> None:
    _OPTED_OUT.discard(user_id)


def check(user_id: str, text: str) -> str | None:
    """The reply consent requires, or None to let the message through.

    Order matters: STOP is honoured before anything else, including before an
    opted-out check, so that sending it twice is harmless rather than ignored.
    """
    if is_stop(text):
        opt_out(user_id)
        return STOPPED

    if has_opted_out(user_id):
        if is_start(text):
            opt_in(user_id)
            return RESUMED
        # Silence, deliberately. Someone who asked not to be messaged should
        # not get a reply explaining that they will not get replies.
        return ""

    return None
