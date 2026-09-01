"""
LangGraph conversation graph — Phase 0 + Phase 1 + Phase 2.

Phase 0 (proven): check_consent, process_message (echo with state proof)
Phase 1 (proven): process_intake — conversational intake flow for scheme matching
Phase 2 (new): Quick-reply buttons for categorical fields (project type, gender)

Intake flow collects: project_type → project_cost → annual_income → gender
Then runs Tier 1 eligibility (schemes.py) + EMI calculator (calculator.py)
and returns formatted results per phrases.md templates.

Phase 2 additions:
- button_payload in state: carries Twilio ButtonPayload from webhook
- response_content_sid in state: when set, worker sends button message
- Intake steps try ButtonPayload first, fall back to text parsing
- Dual-mode: use_button_messages=false → pure text (Sandbox-safe)

Architecture.md Non-negotiable #2: Uses LangGraph's own checkpointer
for state, keyed by thread_id (= WhatsApp number). NOT a custom table.

Note: check_consent clears the response field explicitly when an already-
consented user sends a regular message. This prevents a stale response from
the previous graph invocation from short-circuiting route_after_consent.
"""

from __future__ import annotations

import logging
import re
from typing import TypedDict, Literal, Optional

from langgraph.graph import StateGraph, END

from src.schemes import UserProfile, SchemeMatch, evaluate_eligible_schemes
from src.calculator import calculate_emi, MoratoriumType
from src.config import get_settings, SCHEMES

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# State schema — Phase 0 fields + Phase 1 intake fields
# ---------------------------------------------------------------------------

class ConversationState(TypedDict):
    """State persisted by LangGraph's checkpointer between messages.

    The checkpointer serializes this to SQLite automatically.
    We never read/write a 'conversation_state' table manually.

    Phase 1 additions: intake_step, project_type, project_cost,
    annual_income, gender — all populated during the intake flow.

    Phase 2 additions: button_payload (input from webhook),
    response_content_sid (output — tells worker to send buttons).
    """
    message: str                     # Current inbound message text
    message_count: int               # Total messages from this user (state proof)
    response: str                    # Outbound response to send
    consent_given: bool              # Has user sent START?
    # Phase 1 — intake flow state
    intake_step: str                 # Current step in intake flow
    project_type: str                # "business" or "education"
    project_cost: float              # In ₹
    annual_income: float             # Family annual income in ₹
    gender: str                      # "male", "female", "other"
    # Phase 2 — button support
    button_payload: str              # Twilio ButtonPayload from webhook (e.g. "project_type:business")
    response_content_sid: str        # If set, worker sends Content Template instead of plain text


# ---------------------------------------------------------------------------
# Consent notice — from phrases.md §1
# ---------------------------------------------------------------------------

CONSENT_NOTICE = (
    "Namaste! I can help you find the right NSFDC loan or education scheme, "
    "estimate your EMI, and point you to your nearest eligible bank/agency.\n\n"
    "To do this, I'll ask for your project details, income, and category — "
    "used only to check scheme eligibility, not stored beyond this purpose.\n\n"
    "Reply *START* to continue."
)

STOP_NOTICE = (
    "Your conversation data has been cleared. "
    "Reply *START* anytime to begin again."
)


# ---------------------------------------------------------------------------
# Intake prompts — from phrases.md §3
# ---------------------------------------------------------------------------

PROMPT_PROJECT_TYPE = (
    "Are you looking for a *business loan* or an *education loan*?\n\n"
    "Reply *business* or *education*."
)

PROMPT_PROJECT_COST = (
    "Roughly how much will your {type_label} cost to set up? (in ₹)\n\n"
    "You can type the amount like: 140000, 1.4 lakh, or 50L"
)

PROMPT_ANNUAL_INCOME = (
    "What's your family's approximate annual income? (in ₹)\n\n"
    "You can type: 300000, 3 lakh, or 5L"
)

PROMPT_GENDER = (
    "What is your gender? Some schemes offer a rebate for women.\n\n"
    "Reply *male*, *female*, or *other*."
)


# ---------------------------------------------------------------------------
# Input parsing helpers
# ---------------------------------------------------------------------------

def _parse_button_payload(payload: str, expected_prefix: str) -> Optional[str]:
    """Parse a structured ButtonPayload value.

    Payloads use the format "prefix:value" (e.g., "project_type:business").
    Returns the value if prefix matches, None otherwise.
    """
    if not payload:
        return None
    payload = payload.strip()
    if ":" not in payload:
        return None
    prefix, _, value = payload.partition(":")
    if prefix.strip() == expected_prefix and value.strip():
        return value.strip()
    return None


def _parse_project_type(text: str) -> Optional[str]:
    """Parse project type from user text.

    Returns "business" or "education", or None if ambiguous.
    """
    text = text.strip().lower()
    # Direct matches
    if text in ("business", "biz", "b", "1"):
        return "business"
    if text in ("education", "edu", "e", "2", "student", "study"):
        return "education"
    # Substring matches
    if "business" in text or "shop" in text or "farm" in text or "work" in text:
        return "business"
    if "education" in text or "study" in text or "course" in text or "college" in text:
        return "education"
    return None


def _parse_currency(text: str) -> Optional[float]:
    """Parse an Indian currency amount from user text.

    Handles: plain numbers, Indian comma format (5,00,000),
    lakh/lac/L suffix, crore/cr suffix, ₹ symbol.
    Returns None if parsing fails.
    """
    text = text.strip().replace("₹", "").replace(",", "").strip()

    # number + lakh/lac/L
    match = re.match(r'^(\d+(?:\.\d+)?)\s*(?:lakh|lac|l)\b', text, re.IGNORECASE)
    if match:
        return float(match.group(1)) * 100_000

    # number + crore/cr
    match = re.match(r'^(\d+(?:\.\d+)?)\s*(?:crore|cr)\b', text, re.IGNORECASE)
    if match:
        return float(match.group(1)) * 10_000_000

    # Plain number (possibly with decimals)
    match = re.match(r'^(\d+(?:\.\d+)?)\s*$', text)
    if match:
        return float(match.group(1))

    return None


def _parse_gender(text: str) -> Optional[str]:
    """Parse gender from user text.

    Returns "male", "female", "other", or None if ambiguous.
    """
    text = text.strip().lower()
    if text in ("male", "man", "m", "1", "purush"):
        return "male"
    if text in ("female", "woman", "f", "w", "2", "mahila", "stri"):
        return "female"
    if text in ("other", "o", "3"):
        return "other"
    return None


# ---------------------------------------------------------------------------
# Graph nodes — Phase 0 (kept for backward compat) + Phase 1
# ---------------------------------------------------------------------------

def check_consent(state: ConversationState) -> ConversationState:
    """Check if user has given consent (replied START).

    If not consented:
      - If they just sent START → grant consent, proceed
      - Otherwise → show consent notice, don't proceed
    If already consented:
      - If they send STOP → revoke consent, reset all state
      - Otherwise → clear response and proceed to intake
    """
    message = state.get("message", "").strip().upper()
    consent_given = state.get("consent_given", False)

    if not consent_given:
        if message == "START":
            return {
                **state,
                "consent_given": True,
                "message_count": 0,
                "response": "",
                "response_content_sid": "",
                # Reset intake state on fresh start
                "intake_step": "",
                "project_type": "",
                "project_cost": 0.0,
                "annual_income": 0.0,
                "gender": "",
                "button_payload": "",
            }
        else:
            return {
                **state,
                "consent_given": False,
                "response": CONSENT_NOTICE,
            }
    else:
        if message == "STOP":
            return {
                **state,
                "consent_given": False,
                "message_count": 0,
                "response": STOP_NOTICE,
                "response_content_sid": "",
                # Clear intake state
                "intake_step": "",
                "project_type": "",
                "project_cost": 0.0,
                "annual_income": 0.0,
                "gender": "",
                "button_payload": "",
            }
        # Already consented — clear previous response so we proceed to intake
        return {**state, "response": "", "response_content_sid": ""}


def route_after_consent(state: ConversationState) -> Literal["process_intake", "__end__"]:
    """Route based on consent status: if we have a response already (consent
    notice or stop notice), go to END. Otherwise proceed to process_intake."""
    if state.get("response"):
        return END
    return "process_intake"


def process_message(state: ConversationState) -> ConversationState:
    """Process message with state proof.

    Phase 0: Echo the message with count to prove state persistence.
    KEPT for backward compatibility with Phase 0 tests — no longer used
    in the graph, which routes to process_intake instead.
    """
    message = state.get("message", "")
    count = state.get("message_count", 0) + 1

    # Phase 0: echo with state proof
    response = (
        f"✅ Message #{count} received: \"{message}\"\n\n"
        f"(State is working — I've tracked {count} message{'s' if count != 1 else ''} "
        f"from you across this conversation.)\n\n"
        f"Reply *STOP* anytime to end and clear your data."
    )

    return {
        **state,
        "message_count": count,
        "response": response,
    }


def process_intake(state: ConversationState) -> ConversationState:
    """Handle the conversational intake flow for scheme matching.

    Routes based on intake_step to collect data sequentially:
    1. "" (empty/first time) → ask project type (buttons if enabled)
    2. "awaiting_project_type" → parse ButtonPayload or text, ask cost
    3. "awaiting_cost" → parse text, ask income
    4. "awaiting_income" → parse text, ask gender (buttons if enabled)
    5. "awaiting_gender" → parse ButtonPayload or text, run eligibility
    6. "done" → offer to start a new search

    Phase 2: tries ButtonPayload first for categorical fields,
    falls back to text parsing. Always works in text-only mode too.
    """
    message = state.get("message", "").strip()
    button_payload = state.get("button_payload", "")
    intake_step = state.get("intake_step", "")
    count = state.get("message_count", 0) + 1
    settings = get_settings()

    # Handle "start over" / "new" / "reset" at any intake step
    if message.upper() in ("START OVER", "NEW", "RESET", "RESTART"):
        content_sid = settings.content_sid_project_type if settings.use_button_messages else ""
        return {
            **state,
            "message_count": count,
            "intake_step": "",
            "project_type": "",
            "project_cost": 0.0,
            "annual_income": 0.0,
            "gender": "",
            "button_payload": "",
            "response": "Starting over!\n\n" + PROMPT_PROJECT_TYPE,
            "response_content_sid": content_sid,
        }

    # Step 1: First message after consent — ask project type
    if not intake_step:
        content_sid = settings.content_sid_project_type if settings.use_button_messages else ""
        return {
            **state,
            "message_count": count,
            "intake_step": "awaiting_project_type",
            "response": PROMPT_PROJECT_TYPE,
            "response_content_sid": content_sid,
            "button_payload": "",
        }

    # Step 2: Parse project type → ask cost
    # Phase 2: try ButtonPayload first, then text
    if intake_step == "awaiting_project_type":
        project_type = _parse_button_payload(button_payload, "project_type")
        if project_type is None:
            project_type = _parse_project_type(message)
        if project_type is None:
            content_sid = settings.content_sid_project_type if settings.use_button_messages else ""
            return {
                **state,
                "message_count": count,
                "button_payload": "",
                "response": (
                    "Sorry, I didn't catch that. "
                    "Please reply *business* or *education*."
                ),
                "response_content_sid": content_sid,
            }
        type_label = "project" if project_type == "business" else "course/education"
        return {
            **state,
            "message_count": count,
            "project_type": project_type,
            "intake_step": "awaiting_cost",
            "button_payload": "",
            "response": PROMPT_PROJECT_COST.format(type_label=type_label),
            "response_content_sid": "",  # Cost is always text
        }

    # Step 3: Parse project cost → ask income
    if intake_step == "awaiting_cost":
        cost = _parse_currency(message)
        if cost is None or cost < 0:
            return {
                **state,
                "message_count": count,
                "response": (
                    "Sorry, I couldn't read that as an amount. "
                    "Please enter the cost in ₹ — like 140000, 1.4 lakh, or 50L."
                ),
            }
        return {
            **state,
            "message_count": count,
            "project_cost": cost,
            "intake_step": "awaiting_income",
            "response": PROMPT_ANNUAL_INCOME,
        }

    # Step 4: Parse income → ask gender (buttons if enabled)
    if intake_step == "awaiting_income":
        income = _parse_currency(message)
        if income is None or income < 0:
            return {
                **state,
                "message_count": count,
                "response": (
                    "Sorry, I couldn't read that as an amount. "
                    "Please enter your family's annual income in ₹ — "
                    "like 300000, 3 lakh, or 5L."
                ),
                "response_content_sid": "",
            }
        content_sid = settings.content_sid_gender if settings.use_button_messages else ""
        return {
            **state,
            "message_count": count,
            "annual_income": income,
            "intake_step": "awaiting_gender",
            "response": PROMPT_GENDER,
            "response_content_sid": content_sid,
            "button_payload": "",
        }

    # Step 5: Parse gender → run eligibility + calculator → show results
    # Phase 2: try ButtonPayload first, then text
    if intake_step == "awaiting_gender":
        gender = _parse_button_payload(button_payload, "gender")
        if gender is None:
            gender = _parse_gender(message)
        if gender is None:
            content_sid = settings.content_sid_gender if settings.use_button_messages else ""
            return {
                **state,
                "message_count": count,
                "button_payload": "",
                "response": (
                    "Sorry, I didn't catch that. "
                    "Please reply *male*, *female*, or *other*."
                ),
                "response_content_sid": content_sid,
            }

        # Build profile and run Tier 1 eligibility
        profile = UserProfile(
            project_type=state.get("project_type", "business"),
            project_cost=state.get("project_cost", 0.0),
            annual_income=state.get("annual_income", 0.0),
            gender=gender,
        )
        matches = evaluate_eligible_schemes(profile)

        # Format results
        response = _format_results(profile, matches, gender)

        return {
            **state,
            "message_count": count,
            "gender": gender,
            "intake_step": "done",
            "button_payload": "",
            "response": response,
            "response_content_sid": "",
        }

    # Step 6: After results — offer to start over
    if intake_step == "done":
        return {
            **state,
            "message_count": count,
            "response": (
                "Would you like to check eligibility for a different project?\n\n"
                "Reply *START OVER* to begin a new search, or *STOP* to end."
            ),
        }

    # Fallback — shouldn't reach here, but don't go silent
    logger.warning(f"Unknown intake_step: {intake_step}")
    return {
        **state,
        "message_count": count,
        "intake_step": "",
        "response": (
            "I seem to have lost track — let's start fresh.\n\n"
            + PROMPT_PROJECT_TYPE
        ),
    }


# ---------------------------------------------------------------------------
# Result formatting — per phrases.md templates
# ---------------------------------------------------------------------------

def _format_results(profile: UserProfile, matches: list[SchemeMatch], gender: str) -> str:
    """Format eligibility results with EMI estimates per phrases.md."""
    settings = get_settings()

    if not matches:
        # No-match path — per phrases.md §4, never go silent
        return (
            "Based on what you shared, I couldn't find an exact match "
            "among the schemes I currently cover.\n\n"
            "This doesn't necessarily mean you're not eligible for something else — "
            "would you like me to share what I do cover?\n\n"
            "Reply *START OVER* to try with different details, or *STOP* to end."
        )

    parts: list[str] = []
    parts.append(f"✅ *{len(matches)} scheme{'s' if len(matches) > 1 else ''} matched!*\n")

    for i, match in enumerate(matches, 1):
        # Calculate EMI using scheme's rate_min (most favorable to beneficiary)
        emi_result = calculate_emi(
            project_cost=profile.project_cost,
            financing_pct=match.financing_pct,
            rate_annual=match.rate_min,
            tenure_months=settings.default_tenure_months,
            moratorium_months=settings.default_moratorium_months,
            moratorium_type=MoratoriumType.SIMPLE_INTEREST,
            women_rebate_pct=match.women_rebate_pct,
            is_female=(gender == "female"),
        )

        # Format scheme result
        parts.append(f"*{i}. {match.name}*")

        if match.max_project_cost is not None:
            parts.append(f"For projects up to ₹{match.max_project_cost:,.0f}")
        parts.append(
            f"NSFDC can finance up to {int(match.financing_pct * 100)}% "
            f"of your ₹{profile.project_cost:,.0f} project."
        )

        # Rate info
        rate_str = f"{emi_result.rate_annual}%"
        if match.rate_min != match.rate_max:
            rate_str += f" (range: {match.rate_min}–{match.rate_max}%)"
        parts.append(f"Estimated rate: {rate_str} per year")

        # EMI info
        parts.append(
            f"📊 Loan amount: ₹{emi_result.loan_amount:,.0f}\n"
            f"EMI after {emi_result.moratorium_months}-month grace period: "
            f"₹{emi_result.emi_after_moratorium:,.0f}/month"
        )
        if emi_result.moratorium_monthly_payment > 0:
            parts.append(
                f"During grace period: ₹{emi_result.moratorium_monthly_payment:,.0f}/month (interest only)"
            )
        parts.append(
            f"Total repayment: ₹{emi_result.total_payable:,.0f} "
            f"over {emi_result.repayment_months} months"
        )
        parts.append("")  # Blank line between schemes

    parts.append(
        "*(These are estimates — final terms are set by your Channel Partner.)*\n\n"
        "Reply *START OVER* to try with different details, or *STOP* to end."
    )

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Build the graph
# ---------------------------------------------------------------------------

def build_graph() -> StateGraph:
    """Build and compile the LangGraph conversation graph.

    Returns an uncompiled graph — the caller (worker.py) compiles it
    with the checkpointer attached.
    """
    graph = StateGraph(ConversationState)

    # Add nodes
    graph.add_node("check_consent", check_consent)
    graph.add_node("process_intake", process_intake)

    # Set entry point
    graph.set_entry_point("check_consent")

    # Conditional edge: after consent check, either show notice or proceed
    graph.add_conditional_edges(
        "check_consent",
        route_after_consent,
        {
            "process_intake": "process_intake",
            END: END,
        },
    )

    # process_intake always ends the turn
    graph.add_edge("process_intake", END)

    return graph
