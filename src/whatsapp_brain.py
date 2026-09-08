"""
What WhatsApp says back — the same engine the website uses.

Until now WhatsApp ran its own LangGraph flow that asked "business loan or
education loan?", which is the failure the web chat already had: most of the
4,736 schemes are not loans, and a widow asking about a pension was offered a
choice between two kinds of borrowing. One brain, two channels, or the channel
that reaches the most people stays the worst one.

Two modes, same as the web:

- With a model key, the agent answers open questions using its seven tools.
- Without one, the scripted flow in `chat.py` asks the need-first questions.

The hard part here is not the answer, it is the rendering. WhatsApp has no
cards: everything a person sees is one text message. So the structured results
the engine returns are flattened into plain lines, in WhatsApp's own markup —
which is *single* asterisks for bold, not Markdown's double. Getting that wrong
shows literal asterisks to someone who may already be reading with difficulty.
"""

from __future__ import annotations

import logging
import re
from collections import defaultdict, deque
from typing import Deque

from src.agent import is_available as agent_available, respond as agent_respond
from src.chat import turn as scripted_turn
from src import whatsapp_consent as consent
from src.i18n import detect_language

logger = logging.getLogger(__name__)

# WhatsApp's own limit is 1600 characters; well short of it is kinder anyway.
MAX_MESSAGE_CHARS = 1400

# The last few turns per phone number, so the assistant can follow a thread.
# In memory on purpose: it is small, it is not worth a schema, and losing it on
# restart costs a person one repeated sentence rather than their application.
_HISTORY: dict[str, Deque[dict]] = defaultdict(lambda: deque(maxlen=8))

# What we have learned about each number, so it is not asked twice.
_CONTEXT: dict[str, dict] = defaultdict(dict)


def remember_language(user_id: str, text: str) -> str:
    """Detect and keep the language, so later messages stay in it.

    A person writes in Odia once; every reply after that should be in Odia even
    when they answer a yes/no question with a digit.

    WhatsApp has no language picker, so an undetected script means English —
    stated rather than left to the model, which given an Indian phone number
    will otherwise answer "hello" in Hindi. Writing one message in any of the
    thirteen scripts switches it, and it stays switched.
    """
    detected = detect_language(text)
    if detected:
        _CONTEXT[user_id]["language"] = detected
    return _CONTEXT[user_id].get("language", "en")


def known_language(user_id: str) -> str:
    """The language this number has been writing in, for transcription.

    Telling the transcriber which language to expect beats letting it guess,
    especially for a sentence that mixes a Tamil question with an English
    scheme name.
    """
    return _CONTEXT[user_id].get("language", "en")


def to_whatsapp_markup(text: str) -> str:
    """Markdown as the model writes it, to WhatsApp as it renders it.

    WhatsApp uses *one* asterisk for bold and has no headings or links syntax.
    Left alone, `**Micro Finance Scheme**` arrives with the asterisks visible.
    """
    text = re.sub(r"\*\*(.+?)\*\*", r"*\1*", text, flags=re.S)   # bold
    text = re.sub(r"^#{1,6}\s*", "", text, flags=re.M)           # headings
    text = re.sub(r"^\s*[-*]\s+", "• ", text, flags=re.M)        # bullets
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1: \2", text)   # links
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _clip(text: str) -> str:
    """Trim to one message, on a line break rather than mid-word."""
    if len(text) <= MAX_MESSAGE_CHARS:
        return text
    cut = text[:MAX_MESSAGE_CHARS]
    boundary = max(cut.rfind("\n"), cut.rfind(". "))
    return (cut[:boundary] if boundary > MAX_MESSAGE_CHARS * 0.6 else cut).rstrip() + "…"


def render_cards(cards: list[dict]) -> str:
    """Structured results as lines someone can read on a phone.

    Deliberately terse. This is the same data the website shows as cards, and a
    card's worth of labels becomes noise when it is flattened into a message.
    """
    lines: list[str] = []

    for card in cards:
        kind = card.get("kind")

        if kind == "matches":
            targeted, total = card.get("targeted", 0), card.get("total", 0)
            if targeted:
                lines.append(f"*{targeted}* of *{total}* are meant for someone like you.")
            for item in (card.get("items") or [])[:4]:
                reasons = ", ".join(item.get("matched_on") or [])
                lines.append(f"• {item['name'].strip()}"
                             + (f" — matches on {reasons}" if reasons else ""))

        elif kind == "scheme_list":
            for item in (card.get("items") or [])[:4]:
                lines.append(f"• {item['name'].strip()}")

        elif kind == "eligibility":
            verdict = card.get("verdict")
            head = "✅" if verdict != "NOT_MATCHED" else "❌"
            lines.append(f"{head} *{card.get('name')}*")
            if card.get("unmet"):
                lines.append(f"   Does not match on: {', '.join(card['unmet'])}")
            if card.get("unknown"):
                lines.append(f"   Still to check: {', '.join(card['unknown'])}")

        elif kind == "scheme":
            best = " (cheapest)" if card.get("best") else ""
            lines.append(f"*{card.get('name')}*{best}")
            lines.append(f"   {card.get('loan')} at {card.get('rate')}%")
            lines.append(f"   {card.get('instalment')} × {card.get('instalment_count')}"
                         f" · interest {card.get('interest')}")

        elif kind == "compare":
            lines.append(f"⚠️ {card.get('alt_label')} would take {card.get('alt_amount')}"
                         f" — you keep {card.get('saving')}.")

        elif kind == "partners":
            lines.append("*Where to go*")
            for item in (card.get("items") or [])[:3]:
                distance = item.get("distance_km")
                where = item.get("where", "")
                lines.append(f"• {item['name']} — {where}"
                             + (f", {distance} km" if distance is not None else ""))

        elif kind in ("whynot", "blocked"):
            for item in (card.get("items") or [])[:3]:
                lines.append(f"• {item['name']}: {item['reason']}")

        elif kind == "notice" and card.get("tone") == "warn":
            lines.append(f"⚠️ {card.get('body')}")

    return "\n".join(lines)


async def reply(user_id: str, text: str) -> str:
    """One WhatsApp turn: whatever they said, whatever we say back.

    Returns "" when nothing should be sent — which happens only for someone who
    has opted out, and is the correct amount to say to them.
    """
    # Before anything else. STOP is not a feature to be reached after the
    # interesting code has run.
    gate = consent.check(user_id, text)
    if gate is not None:
        if gate:
            _HISTORY.pop(user_id, None)
            _CONTEXT.pop(user_id, None)
        return gate

    language = remember_language(user_id, text)

    # The notice goes out once, alongside the first real answer rather than
    # instead of it. Making someone say a magic word before being helped is how
    # you lose the person this is for.
    prefix = ""
    if not _CONTEXT[user_id].get("greeted"):
        _CONTEXT[user_id]["greeted"] = True
        prefix = f"{consent.NOTICE}\n\n———\n\n"

    if agent_available():
        answer = await _agent_reply(user_id, text, language)
        if answer:
            return _clip(prefix + answer)
        # The agent stood aside — no key, or every model's quota is spent. The
        # scripted flow still works, and a person mid-question should not be
        # told to come back tomorrow.
        logger.info("Agent unavailable for %s, falling back to the script", user_id[:8])

    return _clip(prefix + await _scripted_reply(user_id, text, language))


# Bookkeeping that belongs to this module, not to the model. Sending it would
# put "last_options" in the prompt as though it were a fact about the person.
_PRIVATE_CONTEXT_KEYS = {"last_options", "language"}


def _agent_context(user_id: str) -> dict:
    return {
        key: value
        for key, value in _CONTEXT[user_id].items()
        if key not in _PRIVATE_CONTEXT_KEYS and value not in (None, "", [])
    }


async def _agent_reply(user_id: str, text: str, language: str | None) -> str:
    history = list(_HISTORY[user_id])
    result = await agent_respond(
        text, history=history, context=_agent_context(user_id), language=language,
    )
    if not result.used_model:
        return ""

    body = to_whatsapp_markup(result.text or "")
    cards = render_cards(result.cards)
    message = "\n\n".join(part for part in (body, cards) if part).strip()
    if not message:
        return ""

    _HISTORY[user_id].append({"role": "user", "text": text})
    _HISTORY[user_id].append({"role": "assistant", "text": result.text or ""})
    return _clip(message)


async def _scripted_reply(user_id: str, text: str, language: str | None) -> str:
    """The guided flow, with the phone number as the conversation thread."""
    result = await scripted_turn(
        user_id, resolve_numbered_choice(user_id, text), language=language,
    )

    parts = [m["text"] for m in result.get("messages", []) if m.get("text")]

    # Options become a numbered list, because WhatsApp has no buttons here and
    # "reply 2" is easier to type than a phrase in a script you dictate with.
    chips = result.get("chips") or []
    if chips:
        parts.append("\n".join(
            f"{index}. {chip['label']}" for index, chip in enumerate(chips, start=1)
        ))

    cards = render_cards(result.get("cards") or [])
    if cards:
        parts.append(cards)

    return _clip("\n\n".join(part for part in parts if part).strip())


def resolve_numbered_choice(user_id: str, text: str) -> str:
    """Turn "2" back into the option it stood for.

    People answer a numbered list with a number. The engine expects the value,
    so this translates before the message reaches it — and leaves anything that
    is not a bare number untouched, since "2 lakh" is an amount, not a choice.
    """
    stripped = text.strip()
    if not stripped.isdigit():
        return text
    options = _CONTEXT[user_id].get("last_options") or []
    index = int(stripped) - 1
    return options[index] if 0 <= index < len(options) else text


def remember_options(user_id: str, chips: list[dict]) -> None:
    _CONTEXT[user_id]["last_options"] = [chip["value"] for chip in chips]
