# Avsarathi.ai — SIH26092

**AI-Driven Scheme Matching for NSFDC Credit Schemes**  
Smart India Hackathon 2026 · PS26092 · Ministry of Social Justice & Empowerment

WhatsApp-first assistant that helps SC beneficiaries find NSFDC loan/education schemes they qualify for, estimates their EMI, and locates the nearest eligible Channel Partner.

## Quick Start

```bash
# 1. Clone and enter
git clone https://github.com/BEAST04289/Avsarathi.ai.git
cd Avsarathi.ai

# 2. Create venv and install
python -m venv .venv
.venv\Scripts\activate       # Windows
# source .venv/bin/activate  # Linux/Mac
pip install -e ".[dev]"

# 3. Configure
cp .env.example .env
# Edit .env with your Twilio credentials

# 4. Run
uvicorn src.main:app --reload --port 8000

# 5. Test
pytest
```

## Run the web portal locally

```bash
pip install -e ".[dev]"
uvicorn src.main:app --reload --port 8000
# open http://localhost:8000
```

Three tabs:
- **Find a scheme** — the beneficiary flow: eligibility, why you don't qualify for
  the rest, what the loan really costs against a moneylender, and which partner
  can actually disburse.
- **Channel partners** — every agency with the figure each prudential rule is
  assessed against, and whether that figure is published or representative.
- **Scheme corpus** — all five NSFDC schemes with their provenance.

No API keys needed for the portal — the whole path is deterministic, with no LLM
call. WhatsApp needs Twilio credentials in `.env`; the portal does not.

## Architecture

Three-tier recommendation pipeline:
1. **Tier 1 — Deterministic rules engine** (income, project cost, category thresholds)
2. **Tier 2 — Light semantic extraction** (free text → structured fields via Gemini)
3. **Tier 3 — Prudential/geo routing** (partner eligibility + Haversine distance)

See `docs/architecture.md` for the full spec.

## Project Structure

```
src/
├── main.py        # FastAPI app, lifecycle management
├── config.py      # All settings + scheme parameters from rules.md
├── database.py    # Async SQLite (WAL mode)
├── webhook.py     # Twilio webhook — verify, idempotency, enqueue, 200
├── worker.py      # Async message queue + LangGraph processing
├── graph.py       # LangGraph conversation state machine
└── whatsapp.py    # Outbound message sender (Twilio)
```

## Current Phase

**Phase 0** — Webhook → queue → worker skeleton with idempotency + LangGraph state persistence.

## License

MIT