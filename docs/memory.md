# memory.md — Project status
Update this at the end of every session, whoever's driving (human or AI agent). Next session reads this first, before architecture.md.

---

## Last updated
2026-08-31, Phase 1 build + verification session (Claude Opus 4.6, Antigravity IDE).

## Current phase
**Phase 1 — COMPLETE.** Tier 1 Rules Engine, EMI Calculator, and Intake Flow all built and verified. 62/62 tests passing.

## Done
- Problem statement selected and locked: SIH26092 (NSFDC scheme matching), extending the existing GrantBot codebase rather than starting fresh.
- Full architecture designed: three-tier pipeline (deterministic rules → light semantic matching for free text → prudential/geo routing), model strategy (Gemini primary, OpenRouter open-source fallback with ZDR privacy settings, IndicTrans2 translation bridge), reliability fix for the prior WhatsApp failure (async webhook + LangGraph checkpointer for state).
- Doc suite written: `prd.md`, `architecture.md`, `rules.md`, `phrases.md`, `prompt.md`, this file.
- Master Build Guide written: live-verified corrections to all planning docs, per-phase implementation specs.
- SIH 2026 judging rubric confirmed: 5 criteria × 20 marks, averaged across judges.
- MUJ SPOC contacted; meeting scheduled Monday. Team nomination quota (45+5) confirmed from prior experience, pending reconfirmation at that meeting.
- **Phase 0 — Webhook → Queue → Worker skeleton:**
  - `pyproject.toml` — project config with all Phase 0 deps
  - `.env.example` — secret template (LANGGRAPH_STRICT_MSGPACK removed — not a real env var)
  - `.gitignore` — updated with project-specific entries
  - `src/__init__.py`, `src/config.py`, `src/database.py`, `src/webhook.py`, `src/worker.py`, `src/graph.py`, `src/whatsapp.py`, `src/main.py` — all built and working
  - `tests/test_phase0.py` — 13 tests, all passing
  - Twilio HMAC-SHA1 verification (not SHA256 — corrected from architecture.md)
  - LangGraph AsyncSqliteSaver checkpointer for state persistence
  - GC-safe asyncio task management
  - Per-user rate limiting (in-memory token bucket)
- **Phase 1 — Tier 1 Rules Engine + EMI Calculator + Intake Flow:**
  - `src/config.py` — removed unverified age fields (min_age, max_age, requires_student, target_category). Added default_tenure_months (84) and default_moratorium_months (6) from NSFDC direct verification. Added explanatory comment about why age is deliberately absent.
  - `src/schemes.py` — UserProfile (Pydantic), SchemeMatch (dataclass), evaluate_eligible_schemes() — pure-function Tier 1 engine. Boundary-correct: income ≤ 500000 matches, 500001 doesn't.
  - `src/calculator.py` — EMI calculator with 3 moratorium treatments (simple interest, capitalized, subvention). Women's 0.5% rebate for Educational Loan. Fixed edge case: zero moratorium months now returns 0 payment.
  - `src/graph.py` — Rewritten with conversational intake flow (project_type → cost → income → gender → results). Kept `process_message()` for Phase 0 test backward compat. Fixed latent bug where `check_consent` didn't clear stale response for already-consented users.
  - `tests/test_schemes.py` — 26 boundary-value eligibility tests (income at exactly ₹5L, cost at ceilings, project type routing, category check, women's rebate)
  - `tests/test_calculator.py` — 23 tests (3 moratorium types, women's rebate, edge cases, financial invariants)
  - **Total: 62/62 tests passing.** Phase 0 did not regress.

## In progress
Nothing — Phase 1 complete, ready for Phase 2.

## Next up (in order)
1. **Phase 2 — WhatsApp Flow for structured intake** (buttons/list messages instead of free text)
2. Phase 3 — Gemini for Tier 2 extraction + generation, caching from day one
3. Phase 4 — Tier 3 partner locator + prudential routing

## Left / not started
- Tier 3 (partner locator + prudential routing) with mocked utilization data.
- OpenRouter fallback chain + IndicTrans2 translation bridge.
- Multilingual button flow.
- Everything frontend/web-dashboard.

## Open / blocked on
- Exact NSFDC scheme numbers — genuinely unresolved. Waiting on SPOC meeting or direct SCA contact.
- MUJ's specific submission rules (AI-narration policy, exact format) — to confirm Monday.

## Session log
*(Newest first)*

- **2026-08-31 — Phase 1 build.** Claude Opus 4.6, Antigravity IDE. Built schemes.py (Tier 1 eligibility engine), calculator.py (EMI with 3 moratorium treatments), rewrote graph.py (intake flow). Removed unverified age fields from config.py. Created test_schemes.py (26 tests) and test_calculator.py (23 tests). Fixed calculator edge case (zero moratorium). Final: 62/62 tests passing, Phase 0 held.
- **2026-08-30 — Phase 0 verification.** Claude Opus 4.6, Antigravity IDE. Ran full test suite: 13/13 passing. Phase 0 verified complete. Phase 1 implementation plan created. Planning docs saved to `docs/` directory.
- **2026-08-30 — Phase 0 build session.** All Phase 0 files created and committed. Initial commit.
- **2026-08-29 — Planning session.** No code. Produced the full doc suite. Handing off to Sunday's build session.

