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

from fastapi import APIRouter
from pydantic import BaseModel, Field

from src.calculator import calculate_emi
from src.config import SCHEMES, get_settings
from src.corpus import load_corpus
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
