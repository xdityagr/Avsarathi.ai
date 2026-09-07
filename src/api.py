"""
JSON API behind the web portal.

One shared service layer sits behind both the web portal and WhatsApp — the
architecture doc's rule, and the reason the two channels cannot quietly
disagree about who is eligible for what. Everything here composes the same
modules the conversation flow uses: schemes -> calculator -> literacy -> routing.

No LLM on this path. Every figure is deterministic and reproducible.
"""

from __future__ import annotations

import base64
import logging
from pathlib import Path
from typing import Optional

from dataclasses import asdict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.agent import is_available as agent_is_available, respond as agent_respond
from src.calculator import calculate_emi
from src.catalog import catalog_meta, get_scheme, search_schemes
from src.config import SCHEMES, get_settings
from src.corpus import load_corpus
from src.discovery import Facets, discover_with_credit
from src.geo import lookup_pin, reverse_geocode
from src.literacy import (
    format_fraud_shield,
    format_instalment,
    format_moneylender_comparison,
    format_moratorium_strip,
    format_priority_note,
    format_scheme_comparison,
    format_true_cost,
    format_why_not,
)
from src.maps import MapPin, render_map
from src.routing import (
    format_cheapest_route,
    route_partners,
    utilisation_note,
)
from src.schemes import UserProfile, evaluate_eligibility, notable_rejections
from src.chat import turn as chat_turn
from src.i18n import LANGUAGES, ui_strings
from src.seed import partners_near
from src.verification import (
    ProofGrade,
    VerificationError,
    describe as describe_verification,
    verify_offline_ekyc,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["portal"])

MEDIA_DIR = Path("data/maps")
TILE_CACHE_DIR = Path("data/tiles")


class ChatRequest(BaseModel):
    session_id: Optional[str] = None
    message: str = ""
    language: Optional[str] = None
    restart: bool = False


class VerifyRequest(BaseModel):
    """A UIDAI offline e-KYC archive, base64-encoded, plus its share code.

    Base64 in JSON rather than multipart so the portal needs no extra
    dependency. Neither the archive nor the share code is persisted — the share
    code is the resident's own secret and the archive is theirs, not ours.
    """
    file_base64: str
    share_code: str


class RecommendRequest(BaseModel):
    project_type: str = "business"
    project_cost: float = Field(ge=0)
    annual_income: float = Field(ge=0)
    category: str = "SC"
    gender: str = "male"
    education_status: str = "unknown"
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    state: Optional[str] = None
    radius_km: float = 150.0


def _price(match, project_cost: float, is_female: bool):
    """Price one scheme using its own published tenure, cadence and moratorium."""
    scheme = SCHEMES[match.scheme_id]
    return calculate_emi(
        project_cost=project_cost,
        financing_pct=scheme["financing_pct"],
        rate_annual=match.rate_min,
        tenure_months=scheme["tenure_months"],
        moratorium_months=scheme["moratorium_months"],
        women_rebate_pct=match.women_rebate_pct,
        is_female=is_female,
        periods_per_year=scheme["periods_per_year"],
    )


@router.get("/schemes")
async def list_schemes() -> dict:
    """The corpus, with its provenance — this powers the 'five not three' reveal."""
    corpus = load_corpus()
    return {
        "corpus_version": corpus.corpus_version,
        "provenance": corpus.provenance.model_dump(),
        "income_ceiling": corpus.shared_eligibility.max_family_income,
        "income_effective_date": corpus.shared_eligibility.income_effective_date,
        "schemes": [
            {
                "code": s.scheme_code,
                "name": s.name,
                "project_types": s.project_types,
                "min_project_cost": s.finance.min_project_cost,
                "max_project_cost": s.finance.max_project_cost,
                "rates": s.finance.beneficiary_rate_by_partner_type,
                "intermediary_rate": s.finance.intermediary_rate,
                "tenure_months": s.finance.tenure_months,
                "repayment_frequency": s.finance.repayment_frequency,
                "moratorium_months": s.finance.moratorium_months,
                "has_rate_spread": s.finance.has_partner_rate_spread,
            }
            for s in corpus.schemes
        ],
    }


@router.get("/partners")
async def list_partners() -> dict:
    """Every seeded partner, with the confidence of each prudential input."""
    partners = partners_near(None, None)
    return {
        "partners": [
            {
                "partner_id": p.partner_id,
                "name": p.name,
                "agency_type": p.agency_type,
                "partner_type": p.partner_type,
                "state": p.state,
                "district": p.district,
                "latitude": p.latitude,
                "longitude": p.longitude,
                "cumulative_utilization": p.cumulative_utilization,
                "deployable_headroom_lakh": p.deployable_headroom_lakh,
                "net_npa_percentage": p.net_npa_percentage,
                "utilisation_confidence": p.utilisation_confidence,
                "note": utilisation_note(p),
            }
            for p in partners
        ]
    }


@router.post("/recommend")
async def recommend(request: RecommendRequest) -> dict:
    """The whole beneficiary flow in one call."""
    profile = UserProfile(
        project_type=request.project_type,
        project_cost=request.project_cost,
        annual_income=request.annual_income,
        category=request.category,
        gender=request.gender,
        education_status=request.education_status,
    )
    eligibility = evaluate_eligibility(profile)
    is_female = profile.gender == "female"

    priced = [(m, _price(m, profile.project_cost, is_female)) for m in eligibility.matches]
    priced.sort(key=lambda pair: pair[1].total_interest)

    schemes_out = []
    for match, emi in priced:
        scheme_cfg = SCHEMES[match.scheme_id]
        schemes_out.append({
            "scheme_id": match.scheme_id,
            "name": match.name,
            "rate": emi.rate_annual,
            "why_eligible": match.why_eligible,
            "loan_amount": emi.loan_amount,
            "instalment_amount": emi.instalment_amount,
            "instalment_frequency": emi.instalment_frequency,
            "instalment_count": emi.instalment_count,
            "monthly_equivalent": emi.monthly_equivalent,
            "total_payable": emi.total_payable,
            "total_interest": emi.total_interest,
            "moratorium_months": emi.moratorium_months,
            "max_loan": scheme_cfg.get("max_loan"),
            "blocks": {
                "true_cost": format_true_cost(emi),
                "instalment": format_instalment(emi),
                "moratorium": format_moratorium_strip(emi),
                "moneylender": format_moneylender_comparison(emi),
                "priority": format_priority_note(
                    {"women": 0.40} if match.scheme_id in ("TERM_LOAN", "MICRO_FINANCE") else None,
                    profile.gender,
                ),
            },
        })

    response: dict = {
        "eligible": bool(eligibility.matches),
        "category_note": eligibility.category_note,
        "schemes": schemes_out,
        "rejections": [
            {"scheme_id": r.scheme_id, "name": r.name, "rule": r.rule, "reason": r.reason}
            for r in notable_rejections(eligibility, limit=4)
        ],
        "why_not": format_why_not(eligibility),
        "scheme_comparison": format_scheme_comparison(priced),
        "fraud_shield": format_fraud_shield(),
        "partners": [],
        "excluded_partners": [],
        "cheapest_route": "",
        "routing_disclosure": "",
        "map_url": None,
    }

    if not priced:
        return response

    best_match, best_emi = priced[0]
    candidates = partners_near(request.latitude, request.longitude, request.radius_km)
    routing = route_partners(
        best_match, request.latitude, request.longitude, candidates,
        radius_km=request.radius_km, user_state=request.state,
    )

    response["partners"] = [
        {
            "partner_id": r.partner.partner_id,
            "name": r.partner.name,
            "agency_type": r.partner.agency_type,
            "partner_type": r.partner.partner_type,
            "district": r.partner.district,
            "state": r.partner.state,
            "latitude": r.partner.latitude,
            "longitude": r.partner.longitude,
            "distance_km": r.distance_km,
            "rate": r.beneficiary_rate,
            "score": r.score,
            "reasons": r.reasons,
            "note": utilisation_note(r.partner),
            "confidence": r.partner.utilisation_confidence,
        }
        for r in routing.viable[:6]
    ]
    response["excluded_partners"] = [
        {"name": e.name, "rule": e.rule, "reason": e.reason}
        for e in routing.excluded
        if e.rule not in ("OUT_OF_RADIUS", "NO_LOCATION")
    ][:4]
    response["routing_disclosure"] = routing.disclosure
    response["cheapest_route"] = format_cheapest_route(
        routing, best_match, best_emi.loan_amount, best_match.tenure_months,
    )

    # Render a map of the top partners. Never let a tile failure break the call —
    # the partner list underneath is the actual answer.
    top = routing.viable[:4]
    if top:
        try:
            pins = [MapPin(r.partner.latitude, r.partner.longitude, str(i + 1))
                    for i, r in enumerate(top)]
            if request.latitude is not None and request.longitude is not None:
                pins.insert(0, MapPin(request.latitude, request.longitude, "You"))
            path = await render_map(pins, MEDIA_DIR, cache_dir=TILE_CACHE_DIR)
            response["map_url"] = f"/media/{path.name}"
        except Exception as exc:
            logger.warning("Map render failed (continuing without it): %s", exc)

    return response


@router.post("/verify")
async def verify_identity(request: VerifyRequest) -> dict:
    """Verify an Aadhaar Paperless Offline e-KYC file.

    Proves name, date of birth, gender and address against UIDAI's own
    signature. It does NOT prove caste or income — those are separate
    certificates needing DigiLocker Requester onboarding — so this never gates a
    recommendation. An unverified user gets the same answer, graded DECLARED.
    """
    try:
        payload = base64.b64decode(request.file_base64, validate=True)
    except Exception:
        return {"grade": ProofGrade.DECLARED.value, "ok": False,
                "message": "That file didn't arrive intact. Try uploading it again.",
                "checks": []}

    try:
        result = verify_offline_ekyc(payload, request.share_code)
    except VerificationError as exc:
        return {"grade": ProofGrade.DECLARED.value, "ok": False,
                "message": str(exc), "checks": []}

    kyc = result.kyc
    return {
        "grade": result.grade.value,
        "ok": result.ok,
        "message": describe_verification(result),
        "checks": result.checks,
        # Demographics only. There is no Aadhaar number in the file, and none here.
        "name": kyc.name if kyc else "",
        "date_of_birth": kyc.date_of_birth if kyc else "",
        "gender": kyc.normalised_gender if kyc else "",
        "district": kyc.district if kyc else "",
        "state": kyc.state if kyc else "",
        "aadhaar_last4": kyc.aadhaar_last4 if kyc else "",
    }


@router.post("/chat")
async def chat(request: ChatRequest) -> dict:
    """One conversational turn.

    Same engine as WhatsApp, different presentation: this returns structured
    cards the browser can render as components, instead of the formatted text
    block WhatsApp is limited to.
    """
    return await chat_turn(
        session_id=request.session_id,
        message=request.message,
        language=request.language,
        restart=request.restart,
    )


@router.get("/i18n/{lang}")
async def translations(lang: str) -> dict:
    """The full string catalogue in one language, plus the language list."""
    if lang not in LANGUAGES:
        lang = "en"
    return {"language": lang, "languages": LANGUAGES, "strings": ui_strings(lang)}


# ---------------------------------------------------------------------------
# The national corpus — discovery, browse, detail
#
# `/api/schemes` above is the five NSFDC credit products we model completely.
# Everything below is the ~4,700-scheme welfare corpus: broader, shallower, and
# deliberately kept on separate routes so the two are never confused.
# ---------------------------------------------------------------------------


class DiscoverRequest(BaseModel):
    """Every field optional, on purpose.

    A person answers what they are comfortable answering, and each answer only
    ever *adds* precision. Nothing here is required, because a required field
    would be a wall in front of someone who came to us for help.
    """
    caste: Optional[str] = None
    gender: Optional[str] = None
    age: Optional[int] = Field(default=None, ge=0, le=120)
    state: Optional[str] = None
    residence: Optional[str] = None
    family_income: Optional[float] = Field(default=None, ge=0)
    is_bpl: Optional[bool] = None
    disability: Optional[bool] = None
    minority: Optional[bool] = None
    is_student: Optional[bool] = None
    occupation: Optional[str] = None
    employment_status: Optional[str] = None
    categories: list[str] = Field(default_factory=list)
    limit: int = Field(default=40, ge=1, le=200)
    # Credit needs a project to price, so it is only evaluated when asked for.
    include_credit: bool = False
    project_type: Optional[str] = None
    project_cost: Optional[float] = Field(default=None, ge=0)


def _match_json(match) -> dict:
    return {
        "scheme_uid": match.scheme_uid,
        "slug": match.slug,
        "name": match.name,
        "strength": match.strength.value,
        "level": match.level,
        "state": match.state,
        "categories": match.categories,
        "brief": match.brief,
        "source_url": match.source_url,
        "depth": match.depth,
        "matched_on": match.matched_on,
        "unknown": match.unknown,
        "unmet": match.unmet,
        "relevance": match.relevance,
    }


@router.post("/discover")
async def discover_schemes(request: DiscoverRequest) -> dict:
    """Every scheme this person plausibly qualifies for, ranked, with reasons.

    The verdict vocabulary is deliberately honest: ELIGIBLE only for the five
    NSFDC products whose every published rule we evaluate, LIKELY when the
    structured criteria pass but the scheme's prose may add more, and CHECK when
    the scheme names a criterion the person has not told us about.
    """
    facets = Facets(
        caste=request.caste,
        gender=request.gender,
        age=request.age,
        state=request.state,
        residence=request.residence,
        family_income=request.family_income,
        is_bpl=request.is_bpl,
        disability=request.disability,
        minority=request.minority,
        is_student=request.is_student,
        occupation=request.occupation,
        employment_status=request.employment_status,
        categories=request.categories,
    )

    profile = None
    if (request.include_credit and request.project_type
            and request.project_cost is not None
            and request.family_income is not None):
        try:
            profile = UserProfile(
                project_type=request.project_type,
                project_cost=request.project_cost,
                annual_income=request.family_income,
                category=(request.caste or "SC").upper(),
                gender=request.gender or "male",
            )
        except ValueError as exc:
            # An unusable project type must not cost the person their welfare
            # results — drop the credit tier and answer the rest.
            logger.warning("Credit tier skipped: %s", exc)

    result = discover_with_credit(facets, profile=profile, limit=request.limit)

    return {
        "matches": [_match_json(m) for m in result.matches],
        "not_matched": [_match_json(m) for m in result.not_matched],
        "total_considered": result.total_considered,
        "total_matched": result.total_matched,
        "total_not_matched": result.total_not_matched,
        "total_targeted": result.total_targeted,
        "corpus_available": result.corpus_available,
        "counts": {
            "eligible": result.strength_counts.get("ELIGIBLE", 0),
            "likely": result.strength_counts.get("LIKELY", 0),
            "check": result.strength_counts.get("CHECK", 0),
        },
    }


@router.get("/catalog")
async def browse_catalog(
    q: str = "",
    state: Optional[str] = None,
    category: Optional[str] = None,
    level: Optional[str] = None,
    page: int = 1,
    page_size: int = 24,
) -> dict:
    """Browse the whole corpus without answering a single personal question."""
    result = search_schemes(q=q, state=state, category=category, level=level,
                            page=page, page_size=min(page_size, 100))
    return {
        "items": [asdict(item) for item in result.items],
        "total": result.total,
        "page": result.page,
        "page_size": result.page_size,
        "corpus_available": result.corpus_available,
    }


@router.get("/catalog/meta")
async def catalog_filters() -> dict:
    """The filter vocabulary, read from the corpus so it can never drift."""
    return catalog_meta()


@router.get("/catalog/{slug}")
async def scheme_detail(slug: str, lang: str = "en") -> dict:
    """One scheme in full — benefits, eligibility, documents, FAQs, how to apply."""
    scheme = get_scheme(slug, lang=lang)
    if scheme is None:
        raise HTTPException(status_code=404, detail=f"No scheme with slug '{slug}'")
    return scheme


# ---------------------------------------------------------------------------
# Location
# ---------------------------------------------------------------------------

@router.get("/geo/reverse")
async def geo_reverse(lat: float, lon: float) -> dict:
    """Where is this? Coordinates in, state and district out.

    Routed through us rather than called from the browser so the lookup carries
    our identifying User-Agent, shares one cache across users, and does not put
    every visitor's IP in front of a third party.
    """
    place = await reverse_geocode(lat, lon)
    return place.as_dict()


@router.get("/geo/pin/{pin}")
async def geo_pin(pin: str) -> dict:
    """Six digits people know by heart, for when location is denied or absent."""
    place = await lookup_pin(pin)
    return place.as_dict()


# ---------------------------------------------------------------------------
# The assistant
# ---------------------------------------------------------------------------

class AgentRequest(BaseModel):
    """A free-form question, plus whatever the interface already knows."""
    message: str
    history: list[dict] = Field(default_factory=list)
    context: dict = Field(default_factory=dict)


@router.get("/agent/status")
async def agent_status() -> dict:
    """Whether the assistant can reason, or only follow the script.

    Exposed so the interface can say which mode it is in instead of quietly
    degrading — a person deserves to know whether they are talking to something
    that can answer a question they thought of themselves.
    """
    return {"available": agent_is_available()}


@router.post("/agent")
async def ask_agent(request: AgentRequest) -> dict:
    """Answer a question by looking things up, and show what was looked up."""
    reply = await agent_respond(
        request.message, history=request.history, context=request.context,
    )
    return {
        "text": reply.text,
        "cards": reply.cards,
        "trace": [
            {"name": call.name, "label": call.label, "summary": call.summary,
             "arguments": call.arguments}
            for call in reply.trace
        ],
        "used_model": reply.used_model,
        "model": reply.model,
        "quota_exhausted": reply.quota_exhausted,
    }
