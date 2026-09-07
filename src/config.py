"""
Configuration module — loads all settings from environment variables.

Every number from rules.md, every credential, every toggle lives here.
Nothing is hardcoded in logic modules. This is the one file you change
when a verified NSFDC number comes back from the SPOC meeting.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings

from src.corpus import legacy_schemes_dict
from pydantic import Field


class Settings(BaseSettings):
    """Application settings, loaded from .env file and environment variables."""

    # --- Twilio ---
    twilio_account_sid: str = Field(default="", description="Twilio Account SID")
    twilio_auth_token: str = Field(default="", description="Twilio Auth Token")
    twilio_whatsapp_number: str = Field(
        default="whatsapp:+14155238886",
        description="Twilio WhatsApp sender number (Sandbox default)",
    )

    # --- Webhook ---
    webhook_base_url: str = Field(
        default="http://localhost:8000",
        description="Public base URL for webhook (ngrok/cloudflare tunnel)",
    )
    webhook_verify_signatures: bool = Field(
        default=True,
        description="Verify Twilio HMAC-SHA1 signatures. Disable only for local testing.",
    )

    # --- Database ---
    database_path: str = Field(
        default="data/avsarathi.db",
        description="Path to SQLite database file",
    )

    # --- Rate limiting ---
    max_messages_per_user_per_minute: int = Field(
        default=10,
        description="Per-user message rate limit (protects against message loops)",
    )

    # --- Worker ---
    worker_count: int = Field(
        default=3,
        description="Number of concurrent worker tasks consuming the message queue",
    )

    # --- Loan defaults (from NSFDC direct verification against nsfdc.nic.in) ---
    default_tenure_months: int = Field(
        default=84,
        description="Default loan tenure in months (7 years)",
    )
    default_moratorium_months: int = Field(
        default=6,
        description="Default moratorium period in months",
    )

    # --- Content Templates (Phase 2 — quick-reply buttons) ---
    content_sid_project_type: str = Field(
        default="",
        description="Twilio Content SID for project type buttons (HXxxxx...)",
    )
    content_sid_gender: str = Field(
        default="",
        description="Twilio Content SID for gender buttons (HXxxxx...)",
    )
    use_button_messages: bool = Field(
        default=False,
        description="Send button messages when Content SIDs are configured. False = text-only mode.",
    )

    # --- LLM Settings (Phase 3) ---
    gemini_api_key: str = Field(default="", description="Gemini API Key")
    gemini_model_extraction: str = Field(
        default="gemini-3.5-flash-lite",
        description="Model for Tier 2 extraction (higher free tier limit)"
    )
    gemini_model_generation: str = Field(
        default="gemini-3.8-flash",
        description="Model for generation on cache miss"
    )

    # --- Financial literacy (PS impact goal: "enhance financial literacy") ---
    moneylender_monthly_rate_pct: float = Field(
        default=5.0,
        description=(
            "Informal moneylender rate, % PER MONTH, used for the comparison that "
            "shows what a concessional loan is actually worth. Rates of 3-10%/month "
            "are typical. A config value, not a literal, because the honest answer "
            "to 'where did that number come from' is 'it's an assumption you can change'."
        ),
    )

    model_config = {
        # Both locations are read, project root last so it wins on a clash.
        # `src/.env` sits next to the code and is the one people reach for
        # first; silently ignoring it means a key that looks configured but
        # isn't, which is a miserable thing to debug.
        "env_file": ("src/.env", ".env"),
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
    }


@lru_cache()
def get_settings() -> Settings:
    """Cached settings singleton. Call this from anywhere."""
    return Settings()


# ---------------------------------------------------------------------------
# Scheme configuration — DERIVED FROM THE CORPUS. Do not edit here.
#
# This used to be a literal dict of three schemes. It is now a view over
# corpus/v1/schemes.json, which holds all five schemes NSFDC actually publishes
# along with per-field provenance (source URL, fetch date, confidence).
#
# To change a scheme number, edit the corpus JSON — not this file. That keeps a
# rate change reviewable as a diff, which is the whole point: docs/rules.md
# spent five research passes on numbers that had in fact already converged,
# because there was no single place where a number and its source lived together.
#
# NO AGE FIELD, still — but the reason has been upgraded. It used to be "no age
# boundary has been confirmed". nsfdc.nic.in/eligibility-requirements states no
# age condition at all, so its absence is now CONFIRMED, not merely unverified.
# ---------------------------------------------------------------------------

SCHEMES = legacy_schemes_dict()

# ---------------------------------------------------------------------------
# Prudential norms — Tier 3
# CONFIDENCE: high, corroborated across every source
# ---------------------------------------------------------------------------

PRUDENTIAL_NORMS = {
    "SCA": {
        "min_cumulative_utilization": 1.0,  # must be >= 100%
        "no_active_overdues": True,
    },
    "RRB": {
        "max_net_npa_percentage": 15.0,  # must be < 15%
    },
}
