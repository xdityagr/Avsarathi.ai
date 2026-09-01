"""
Configuration module — loads all settings from environment variables.

Every number from rules.md, every credential, every toggle lives here.
Nothing is hardcoded in logic modules. This is the one file you change
when a verified NSFDC number comes back from the SPOC meeting.
"""

from __future__ import annotations

import os
from pathlib import Path
from functools import lru_cache

from pydantic_settings import BaseSettings
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
        default="gemini-2.5-flash-lite",
        description="Model for Tier 2 extraction (higher free tier limit)"
    )
    gemini_model_generation: str = Field(
        default="gemini-2.5-flash",
        description="Model for generation on cache miss"
    )

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
    }


@lru_cache()
def get_settings() -> Settings:
    """Cached settings singleton. Call this from anywhere."""
    return Settings()


# ---------------------------------------------------------------------------
# Scheme configuration — from rules.md
# CONFIDENCE: PS-stated (authoritative for judging)
# Every number here is a config value, not a hardcoded constant.
# Update THIS dict when verified numbers come back, not the logic code.
#
# NOTE: no age field, deliberately. No age eligibility boundary for any of
# these three schemes has been confirmed against the PS text or nsfdc.nic.in.
# prd.md's illustrative code has age bounds — those are a known-unconfirmed
# leftover, NOT a source to copy from. Don't add age fields without real
# confirmation from Monday's SPOC meeting or a direct NSFDC contact.
# ---------------------------------------------------------------------------

SCHEMES = {
    "MICRO_FINANCE": {
        "name": "Micro Finance Scheme",
        "max_project_cost": 140_000,
        "financing_pct": 0.90,
        "rate_min": 6.5,
        "rate_max": 8.0,
        "moratorium_months_min": 3,
        "moratorium_months_max": 12,
        "max_income": 500_000,
    },
    "TERM_LOAN": {
        "name": "Term Loan",
        "max_project_cost": 5_000_000,
        "financing_pct": 0.90,
        "rate_min": 6.5,
        "rate_max": 15.0,  # PS "Expected Solution" — wider range, tiered by loan size
        "moratorium_months_min": 3,
        "moratorium_months_max": 12,
        "max_income": 500_000,
    },
    "EDUCATIONAL_LOAN": {
        "name": "Educational Loan Scheme",
        "max_project_cost": None,  # PS doesn't state a ceiling; unresolved across sources
        "financing_pct": 0.90,
        "rate_min": 6.5,
        "rate_max": 8.0,
        "moratorium_months_min": 3,
        "moratorium_months_max": 12,
        "max_income": 500_000,
        "women_rebate_pct": 0.5,  # Consistent across every source — solid
    },
}

# ---------------------------------------------------------------------------
# NSFDC direct verification — more specific than PS text.
# Use if you want the tiered-rate story for the pitch, but don't silently
# contradict the PS numbers above without explaining why in the demo.
# CONFIDENCE: verified directly against nsfdc.nic.in
# ---------------------------------------------------------------------------

NSFDC_DIRECT_VERIFICATION = {
    "TERM_LOAN_ALT": {
        "partner_rate": 4.0,
        "beneficiary_rate": 8.0,
        "tenure_years": 7,
        "moratorium_months": 6,
    },
    "UTKARSH_LOAN": {
        "min_project_cost": 1_000_000,
        "max_project_cost": 5_000_000,
        "beneficiary_rate": 9.0,
        "financing_pct": 0.90,
        "tenure_years": 7,
        "moratorium_months": 6,
    },
    "EDUCATIONAL_LOAN_ALT": {
        "partner_rate": 1.5,
        "beneficiary_rate": 4.0,
        "women_rebate_pct": 0.5,
        "tenure_years": 7,
        "moratorium_months": 6,
    },
}

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
