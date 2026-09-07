"""
The assistant that can be asked anything, and answers with facts it looked up.

The model here is a router and a writer. It is emphatically NOT a decider: it
cannot judge eligibility, cannot invent a rupee figure, and cannot name an
office. Everything it says about who qualifies, what a loan costs and where to
go comes back from the deterministic functions in `discovery`, `schemes`,
`calculator` and `routing` — the same code paths the wizard and WhatsApp use.

That split is the whole design. A language model asked "can I get this loan?"
will happily answer, fluently and wrongly, and the person on the other end has
no way to tell. So the model is given tools and denied opinions: it decides
*which question is being asked*, the tools decide *what is true*, and the reply
is assembled from what they returned.

Every tool call is reported back to the interface, so a person can see that the
answer came from a lookup over 4,736 schemes rather than from a guess.

With no API key configured this module stands aside entirely and the scripted
conversation in `chat.py` takes over — a demo must never depend on a key.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Optional

from src.calculator import calculate_emi
from src.catalog import get_scheme, search_schemes
from src.config import SCHEMES, get_settings
from src.discovery import Facets, discover_with_credit
from src.routing import haversine_km, utilisation_note
from src.schemes import UserProfile, evaluate_eligibility, format_rupees
from src.seed import partners_near

logger = logging.getLogger(__name__)

MAX_TOOL_ROUNDS = 4

SYSTEM_PROMPT = """\
You are Avsarathi, an assistant that helps people in India — especially \
Scheduled Caste, Scheduled Tribe, OBC and other marginalised households — find \
government schemes they are entitled to, understand what a loan really costs, \
and reach an office that can actually process it.

HOW YOU WORK
- You never judge eligibility yourself. Call `find_schemes` and report what it
  returns. If you have not called a tool, you do not know the answer.
- You never state a rupee figure that a tool did not return. Not an interest
  total, not an instalment, not a ceiling. No arithmetic of your own.
- You never name an office, branch or agency that `find_offices` did not return.
- If a tool returns nothing, say so plainly and suggest what would change it
  (usually: their state, their community, or their household income).

HOW YOU SPEAK
- Reply in the language the person wrote in. If they wrote in Hindi, reply in
  Hindi. Never announce that you are switching language.
- Short sentences. No jargon. Assume the reader may be reading with difficulty,
  and may be reading this aloud to someone else.
- Never promise approval. Schemes have conditions in prose we have not read, so
  the honest word is "likely", never "you will get it".
- Money is life-changing here and fraud is common. If someone mentions paying a
  fee or an agent to get a government loan, tell them plainly that no fee is
  required.

Be brief. Two or three sentences, then the facts."""


@dataclass
class ToolCall:
    """One lookup, shown to the person so the answer is traceable."""
    name: str
    label: str                                  # human-readable, for the UI
    arguments: dict = field(default_factory=dict)
    summary: str = ""


@dataclass
class AgentReply:
    text: str = ""
    cards: list[dict] = field(default_factory=list)
    trace: list[ToolCall] = field(default_factory=list)
    used_model: bool = False


def is_available() -> bool:
    """Whether an agentic reply is possible at all."""
    return bool(get_settings().gemini_api_key)


# ---------------------------------------------------------------------------
# Tools
#
# Each returns (payload_for_the_model, cards_for_the_interface, summary). The
# model sees compact JSON; the person sees rendered cards built from the same
# call, so the two can never disagree.
# ---------------------------------------------------------------------------

def _tool_find_schemes(
    caste: Optional[str] = None,
    state: Optional[str] = None,
    gender: Optional[str] = None,
    age: Optional[int] = None,
    family_income: Optional[float] = None,
    occupation: Optional[str] = None,
    is_bpl: Optional[bool] = None,
    disability: Optional[bool] = None,
    is_student: Optional[bool] = None,
    categories: Optional[list[str]] = None,
) -> tuple[dict, list[dict], str]:
    """Deterministic match against the whole corpus."""
    facets = Facets(
        caste=caste, state=state, gender=gender, age=age,
        family_income=family_income, occupation=occupation, is_bpl=is_bpl,
        disability=disability, is_student=is_student,
        categories=categories or [],
    )
    result = discover_with_credit(facets, profile=None, limit=6)

    top = [
        {
            "name": m.name.strip(),
            "slug": m.slug,
            "state": m.state,
            "strength": m.strength.value,
            "matched_on": m.matched_on,
            "unknown": m.unknown,
        }
        for m in result.matches[:6]
    ]
    payload = {
        "total_matched": result.total_matched,
        "aimed_at_this_person": result.total_targeted,
        "considered": result.total_considered,
        "top_matches": top,
    }
    cards = [{
        "kind": "matches",
        "total": result.total_matched,
        "targeted": result.total_targeted,
        "items": top,
    }]
    summary = (
        f"{result.total_targeted} aimed at this person, "
        f"{result.total_matched} possible, of {result.total_considered}"
    )
    return payload, cards, summary


def _tool_price_loan(
    project_cost: float,
    annual_income: float,
    project_type: str = "business",
    category: str = "SC",
    gender: str = "male",
) -> tuple[dict, list[dict], str]:
    """Which NSFDC schemes fit, and what each actually costs."""
    try:
        profile = UserProfile(
            project_type=project_type, project_cost=project_cost,
            annual_income=annual_income, category=category.upper(), gender=gender,
        )
    except ValueError as exc:
        return {"error": str(exc)}, [], "invalid profile"

    result = evaluate_eligibility(profile)
    if not result.matches:
        payload = {
            "eligible": False,
            "reasons": [r.reason for r in result.rejections],
            "referral": result.referral_note,
        }
        return payload, [], "no NSFDC scheme fits"

    priced = []
    cards = []
    for index, match in enumerate(result.matches):
        scheme = SCHEMES[match.scheme_id]
        quote = calculate_emi(
            project_cost=profile.project_cost,
            financing_pct=scheme["financing_pct"],
            rate_annual=match.rate_min,
            tenure_months=scheme["tenure_months"],
            moratorium_months=scheme["moratorium_months"],
            women_rebate_pct=match.women_rebate_pct,
            is_female=profile.gender == "female",
            periods_per_year=scheme["periods_per_year"],
        )
        priced.append({
            "name": match.name,
            "rate_percent": quote.rate_annual,
            "loan": format_rupees(quote.loan_amount),
            "each_instalment": format_rupees(quote.instalment_amount),
            "instalments": quote.instalment_count,
            "total_interest": format_rupees(quote.total_interest),
            "why": match.why_eligible,
        })
        cards.append({
            "kind": "scheme",
            "best": index == 0,
            "name": match.name,
            "rate": quote.rate_annual,
            "loan": format_rupees(quote.loan_amount),
            "instalment": format_rupees(quote.instalment_amount),
            "instalment_count": quote.instalment_count,
            "interest": format_rupees(quote.total_interest),
            "total": format_rupees(quote.total_payable),
            "years": scheme["tenure_months"] // 12,
            "grace_months": scheme["moratorium_months"],
            "why": match.why_eligible,
        })

    payload = {"eligible": True, "schemes": priced,
               "not_offered": [r.reason for r in result.rejections]}
    return payload, cards, f"{len(priced)} scheme(s) priced"


def _tool_find_offices(
    state: str,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
) -> tuple[dict, list[dict], str]:
    """Offices that can actually disburse, nearest first.

    No interest rate is returned here. Rates are per-scheme and per-partner-type,
    so quoting one without knowing the scheme would be a made-up number attached
    to a real office — exactly the kind of confident wrongness this design exists
    to prevent. `price_loan` is where rates come from.
    """
    partners = partners_near(latitude, longitude, radius_km=250)

    # A state agency lends within its own state only, so one from elsewhere is
    # not a lead, it is a wasted journey.
    def serves(partner) -> bool:
        if partner.partner_type != "SCA":
            return True
        return (partner.state or "").strip().lower() == state.strip().lower()

    candidates = [p for p in partners if serves(p)]
    if latitude is not None and longitude is not None:
        candidates.sort(key=lambda p: haversine_km(
            latitude, longitude, p.latitude, p.longitude,
        ) if p.latitude and p.longitude else 1e9)

    items = []
    for partner in candidates[:4]:
        distance = (
            round(haversine_km(latitude, longitude, partner.latitude, partner.longitude), 1)
            if latitude is not None and longitude is not None
            and partner.latitude and partner.longitude
            else None
        )
        items.append({
            "name": partner.name,
            "where": ", ".join(x for x in (partner.district, partner.state) if x),
            "distance_km": distance,
            "type": partner.partner_type,
            "note": utilisation_note(partner) or "",
            "official": partner.partner_type == "SCA",
        })

    if not items:
        return {"offices": []}, [], "no office found"
    return ({"offices": items},
            [{"kind": "partners", "items": items}],
            f"{len(items)} office(s) in {state}")


def _tool_lookup_scheme(query: str) -> tuple[dict, list[dict], str]:
    """Find a scheme by name and return what it actually says."""
    page = search_schemes(q=query, page_size=3)
    if not page.items:
        return {"found": []}, [], "nothing found"

    first = get_scheme(page.items[0].slug)
    payload = {
        "found": [{"name": i.name.strip(), "slug": i.slug, "state": i.state}
                  for i in page.items],
        "detail": None,
    }
    cards: list[dict] = []
    if first:
        payload["detail"] = {
            "name": first["name"].strip(),
            "benefits": (first.get("benefits_md") or "")[:900],
            "eligibility": (first.get("eligibility_md") or "")[:900],
            "how_to_apply": (first.get("application_md") or "")[:900],
        }
        cards.append({
            "kind": "scheme_link",
            "name": first["name"].strip(),
            "slug": first["slug"],
            "brief": first.get("brief") or "",
            "state": first.get("state"),
        })
    return payload, cards, f"{len(page.items)} match(es)"


TOOL_IMPLEMENTATIONS = {
    "find_schemes": _tool_find_schemes,
    "price_loan": _tool_price_loan,
    "find_offices": _tool_find_offices,
    "lookup_scheme": _tool_lookup_scheme,
}

TOOL_LABELS = {
    "find_schemes": "Matched against every scheme in the corpus",
    "price_loan": "Calculated the repayment",
    "find_offices": "Looked up offices that can disburse",
    "lookup_scheme": "Read the scheme's published text",
}

# Declared for the model. Descriptions matter more than names here — they are
# how it decides which question it is being asked.
TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "name": "find_schemes",
        "description": (
            "Find government welfare and credit schemes a person may be entitled "
            "to. Use for any question about what someone can get, apply for, or "
            "is eligible for. Pass only what the person has actually said — every "
            "argument is optional and omitting one never hides schemes."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "caste": {"type": "string", "description": "sc, st, obc, pvtg, dnt or general"},
                "state": {"type": "string", "description": "Full state name, e.g. 'Uttar Pradesh'"},
                "gender": {"type": "string", "description": "female, male or transgender"},
                "age": {"type": "integer"},
                "family_income": {"type": "number", "description": "Whole household, per year, in rupees"},
                "occupation": {"type": "string", "description": "e.g. 'Farmer', 'Safai Karamchari', 'Construction Worker'"},
                "is_bpl": {"type": "boolean"},
                "disability": {"type": "boolean"},
                "is_student": {"type": "boolean"},
                "categories": {
                    "type": "array", "items": {"type": "string"},
                    "description": "Areas of need, e.g. 'Education & Learning', 'Housing & Shelter'",
                },
            },
        },
    },
    {
        "name": "price_loan",
        "description": (
            "Work out which NSFDC credit schemes fit a project and exactly what "
            "each costs — instalment, total interest, total repaid. Use whenever "
            "money, a loan, interest or repayment is discussed. Requires the "
            "project cost and the household's annual income."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "project_cost": {"type": "number", "description": "Cost of the business or course, in rupees"},
                "annual_income": {"type": "number", "description": "Whole household, per year, in rupees"},
                "project_type": {"type": "string", "description": "'business' or 'education'"},
                "category": {"type": "string", "description": "SC, ST, OBC or GENERAL"},
                "gender": {"type": "string", "description": "female, male or other"},
            },
            "required": ["project_cost", "annual_income"],
        },
    },
    {
        "name": "find_offices",
        "description": (
            "Find the offices, banks or state agencies that can actually process "
            "and disburse an NSFDC loan near someone. Use for 'where do I go' or "
            "'who gives this money' questions."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "state": {"type": "string"},
                "latitude": {"type": "number"},
                "longitude": {"type": "number"},
            },
            "required": ["state"],
        },
    },
    {
        "name": "lookup_scheme",
        "description": (
            "Look up one named scheme and read its published benefits, eligibility "
            "and application process. Use when the person names a scheme."
        ),
        "parameters": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
    },
]


# ---------------------------------------------------------------------------
# The loop
# ---------------------------------------------------------------------------

async def respond(
    message: str,
    history: Optional[list[dict]] = None,
    context: Optional[dict] = None,
) -> AgentReply:
    """One turn: think, look things up, answer.

    `context` carries what the interface already knows (state, caste, income),
    so the person is not asked again for something they typed into the wizard
    five seconds ago.
    """
    settings = get_settings()
    if not settings.gemini_api_key:
        return AgentReply(text="", used_model=False)

    from langchain_core.messages import (
        AIMessage, HumanMessage, SystemMessage, ToolMessage,
    )
    from langchain_google_genai import ChatGoogleGenerativeAI

    system = SYSTEM_PROMPT
    if context:
        known = {k: v for k, v in context.items() if v not in (None, "", [])}
        if known:
            system += (
                "\n\nWhat you already know about this person, from what they "
                f"filled in earlier — use it, do not ask again: {json.dumps(known)}"
            )

    messages: list[Any] = [SystemMessage(content=system)]
    for turn in history or []:
        role = turn.get("role")
        text = turn.get("text") or ""
        if not text:
            continue
        messages.append(HumanMessage(content=text) if role == "user"
                        else AIMessage(content=text))
    messages.append(HumanMessage(content=message))

    llm = ChatGoogleGenerativeAI(
        model=settings.gemini_model_generation,
        google_api_key=settings.gemini_api_key,
        temperature=0.2,
    ).bind_tools([{"function_declarations": TOOL_SCHEMAS}])

    reply = AgentReply(used_model=True)

    for _ in range(MAX_TOOL_ROUNDS):
        try:
            response = await llm.ainvoke(messages)
        except Exception as exc:                      # noqa: BLE001
            # Any model failure falls back to the scripted flow rather than
            # showing a person a stack trace about quota.
            logger.warning("Agent call failed: %s", exc)
            return AgentReply(text="", used_model=False)

        calls = getattr(response, "tool_calls", None) or []
        if not calls:
            reply.text = _text_of(response)
            return reply

        messages.append(response)
        for call in calls:
            name = call.get("name")
            args = call.get("args") or {}
            implementation = TOOL_IMPLEMENTATIONS.get(name)
            if implementation is None:
                payload, cards, summary = {"error": "unknown tool"}, [], "unknown"
            else:
                try:
                    payload, cards, summary = implementation(**args)
                except Exception as exc:              # noqa: BLE001
                    logger.warning("Tool %s failed: %s", name, exc)
                    payload, cards, summary = {"error": str(exc)}, [], "failed"

            reply.cards.extend(cards)
            reply.trace.append(ToolCall(
                name=name or "",
                label=TOOL_LABELS.get(name or "", "Looked something up"),
                arguments=args,
                summary=summary,
            ))
            messages.append(ToolMessage(
                content=json.dumps(payload, ensure_ascii=False, default=str),
                tool_call_id=call.get("id") or name or "tool",
            ))

    # Out of rounds: answer with what we have rather than looping forever.
    reply.text = _text_of(messages[-1]) if messages else ""
    return reply


def _text_of(response: Any) -> str:
    content = getattr(response, "content", "")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = [
            part.get("text", "") if isinstance(part, dict) else str(part)
            for part in content
        ]
        return "".join(parts).strip()
    return str(content).strip()
