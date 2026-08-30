# memory.md — Project status
Update this at the end of every session, whoever's driving (human or AI agent). Next session reads this first, before architecture.md.

---

## Last updated
2026-08-30, Phase 0 build + verification session (Claude Opus 4.6, Antigravity IDE).

## Current phase
**Phase 0 — COMPLETE.** All verification criteria met.

## Done
- Problem statement selected and locked: SIH26092 (NSFDC scheme matching), extending the existing GrantBot codebase rather than starting fresh.
- Full architecture designed: three-tier pipeline (deterministic rules → light semantic matching for free text → prudential/geo routing), model strategy (Gemini primary, OpenRouter open-source fallback with ZDR privacy settings, IndicTrans2 translation bridge), reliability fix for the prior WhatsApp failure (async webhook + LangGraph checkpointer for state).
- Doc suite written: `prd.md`, `architecture.md`, `rules.md`, `phrases.md`, `prompt.md`, this file.
- Master Build Guide written: live-verified corrections to all planning docs, per-phase implementation specs.
- SIH 2026 judging rubric confirmed: 5 criteria × 20 marks, averaged across judges.
- MUJ SPOC contacted; meeting scheduled Monday. Team nomination quota (45+5) confirmed from prior experience, pending reconfirmation at that meeting.
- **Phase 0 — Webhook → Queue → Worker skeleton:**
  - `pyproject.toml` — project config with all Phase 0 deps
  - `.env.example` — secret template
  - `.gitignore` — updated with project-specific entries
  - `src/__init__.py`, `src/config.py`, `src/database.py`, `src/webhook.py`, `src/worker.py`, `src/graph.py`, `src/whatsapp.py`, `src/main.py` — all built and working
  - `tests/test_phase0.py` — 13 tests, all passing:
    - RateLimiter: 4/4 ✅ (under-limit, over-limit, per-user isolation, window expiry)
    - Idempotency: 3/3 ✅ (new message, processed detection, cross-message isolation)
    - GraphState: 6/6 ✅ (consent notice, START grants, STOP revokes, count increments, count in response, case-insensitive START)
  - Twilio HMAC-SHA1 verification (not SHA256 — corrected from architecture.md)
  - LangGraph AsyncSqliteSaver checkpointer for state persistence
  - GC-safe asyncio task management
  - Per-user rate limiting (in-memory token bucket)

## In progress
Nothing — Phase 0 complete, Phase 1 plan created, awaiting approval.

## Next up (in order)
1. **Phase 1 — Tier 1 Rules Engine + EMI Calculator:**
   - `src/schemes.py` — UserProfile model, SchemeMatch, evaluate_eligible_schemes()
   - `src/calculator.py` — EMI calculator with 3 moratorium treatments
   - `src/graph.py` — intake flow nodes (project type → cost → income → age → gender → results)
   - `tests/test_schemes.py` — boundary-value eligibility tests
   - `tests/test_calculator.py` — EMI calculation correctness
   - `tests/test_intake_flow.py` — conversation flow end-to-end
2. Phase 2 — WhatsApp Flow for structured intake
3. Phase 3 — Gemini for Tier 2 extraction + generation, caching from day one
4. Phase 4 — Tier 3 partner locator + prudential routing

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

- **2026-08-30 — Phase 0 verification.** Claude Opus 4.6, Antigravity IDE. Ran full test suite: 13/13 passing. Phase 0 verified complete. Phase 1 implementation plan created. Planning docs saved to `docs/` directory.
- **2026-08-30 — Phase 0 build session.** All Phase 0 files created and committed. Initial commit.
- **2026-08-29 — Planning session.** No code. Produced the full doc suite. Handing off to Sunday's build session.
