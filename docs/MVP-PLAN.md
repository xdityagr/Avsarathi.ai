# MVP Plan & Pitch — Avsarathi.ai

**Target: a 4-minute pitch that wins the room, plus Q&A.**
Companion to `PRD-v3.md` (features), `data-sources.md` (corpus), `BUSINESS-PLAN.md` (scale story).

---

## 0. The principle

**Build backwards from the pitch.** Write the demo script first, then build only what it needs. Every feature that isn't on screen in those four minutes is Phase 2 — no matter how good it is.

This is not scope-cutting for its own sake. `PRD-v3.md` §12 sets a fallback ladder for a reason: the failure mode for a six-person team with three surfaces is arriving with three things half-done. A tight, rehearsed, fully-working four minutes beats a broad demo that stalls once.

---

## 1. The pitch — 4:00

### 0:00–0:30 · Open with a person, not a statistic

> **Sunita Devi. Ballia district, Uttar Pradesh.** She wants to start a tailoring unit. It will cost ₹1.2 lakh.
>
> There is a government scheme that will lend her 90% of that at **6.5%** — cheaper than any commercial loan in India. She has never heard of it.
>
> And if she had: she wouldn't know which of **five** products fits her, which of **102** channel partners can process it, or whether that partner is even *allowed* to disburse this month.
>
> So she borrows from a moneylender at **5% a month**.

Do not open with the scheme, the ministry, or the tech. Open with her. Everything after this is in service of that sentence.

### 0:30–2:30 · Live demo

| Time | Beat | What the judge sees |
|---|---|---|
| 0:30 | **Voice note, in Hindi** | She *speaks* — no typing, no language menu. The reply comes back spoken, in Hindi. Say: *"we never asked her what language she speaks — we detected the script"* |
| 0:55 | **Intake, buttons not questions** | Cost, income, education status. Four taps. Fast — don't linger |
| 1:10 | **The Why / Why-Not trail** | *Qualifies* for Micro Finance — here's the arithmetic. Does **not** qualify for Term Loan — **and here's why.** Explaining the rejection is the literacy moment |
| 1:20 | **True Cost + Moneylender Comparison** | *"This loan costs her ₹22,300. The moneylender would cost ₹1,87,500."* **Stop talking for one beat.** This is the emotional peak of the pitch |
| 1:45 | **Map — and an exclusion** | Nearest partners, on a real map. Then show one that is **excluded**, with the reason: *"this agency hasn't utilised its last release — it cannot disburse right now."* Prudential routing, made visible |
| 2:10 | **Cheapest Route** | *"This bank is 4 km away at 15%. That one is 11 km away at 13%. Those 7 km save her ₹—."* Nobody tells beneficiaries this |

### 2:30–3:15 · The three reveals

This is where you separate from every other team. Deliver them as *"and here's what most people miss."*

> **One.** The problem statement names three schemes. **NSFDC runs five.** The PS's own quoted range — 6.5% to 15% — is arithmetically impossible with three products. We found that by reading the source instead of the brief.
>
> **Two.** Everyone assumes fund-utilisation data is internal to NSFDC. **They publish it.** *[show the spreadsheet]* This is the file dated 31 July. Our router runs on real numbers, not mocks.
>
> **Three.** Her eligibility isn't self-declared — it's **verified against UIDAI's own digital signature**, with no licence required. *[badge flips `DECLARED` → `VERIFIED`]*

### 3:15–4:00 · Scale, the other side, and close

> One engine, **six corporations** — SC, ST, OBC, Safai Karamcharis, minorities, disability.
>
> India's flagship credit portal, **JanSamarth, carries 15 schemes and 269 banks — and zero of these.** Not an oversight: it's built for direct bank lending, and these lend through State Channelizing Agencies. **This is the one large government credit channel with no digital front door.**
>
> *[flip to the partner console]* And for the agency on the other side: a queue of pre-verified applications, sorted by completeness — instead of a pile of paper.
>
> Sunita gets the right scheme, at the right price, from a partner who can actually pay her — and she makes **one trip instead of four.**

---

## 2. MVP build sheet

Only what the four minutes needs. Sizes are relative (S ≈ half a day, M ≈ 1–2 days, L ≈ 3+ days) for a team already holding a working Phase 0–3.

| # | Item | Size | Serves | Notes |
|---|---|---|---|---|
| 1 | **Plane A corpus — 5 schemes** | M | reveal 1 | Dual rates, quarterly repayment, rate-by-partner-type. Config, not code |
| 2 | **Tier 1 on 5 schemes** | M | 1:10 | Extend existing engine. Add `education_status`, family-income field |
| 3 | **Why / Why-Not trail** | M | 1:10 | Engine must emit **reasons**, not booleans. Highest-value refactor here |
| 4 | **Calculator — quarterly + monthly + True Cost** | S | 1:20 | Fix the monthly-vs-quarterly bug; add total-cost output |
| 5 | **Moneylender Comparison** | S | 1:20 | Pure template. Cheapest high-impact feature in the whole plan |
| 6 | **Utilisation data ingest** | M | reveal 2 | Download 9 Excel files, parse state-wise utilisation. **Do this early — it de-risks the biggest reveal** |
| 7 | **Routing + exclusion reasons** | M | 1:45 | Prudential filter must return *why* a partner was excluded, as a sentence |
| 8 | **Map → WhatsApp** | M | 1:45 | Static OSM render with pins + native location message |
| 9 | **Cheapest Route** | S | 2:10 | Falls out of #1 + #7 almost free |
| 10 | **Script detection + Hindi copy** | M | 0:30 | Unicode block lookup + Hindi templates. No model needed for detection |
| 11 | **Voice in/out (Hindi)** | L | 0:30 | IndicConformer ASR + Indic Parler-TTS. **Highest technical risk — start it first** |
| 12 | **Partner console — one screen** | M | 3:30 | Read-only queue + prudential status + map. One screen, not an app |
| 13 | **Aadhaar offline XML verify** | M | reveal 3 | Unzip, parse, verify XMLDSig vs UIDAI cert. A 10-second reveal, not a flow |
| 14 | **Demo ops + cache warming** | M | all | See §5. Not optional |

### Explicitly NOT in the MVP

L5 origination · project report (DPR) · packet assembly · DigiLocker L2 · assisted/CSC mode · Ground-Truth Loop · the other five corporations (schema ready, unpopulated) · full Plane B / Ask Anything · telephony IVR · languages beyond Hindi + English.

Every one is in `PRD-v3.md`. **Say them as roadmap, don't build them.** A judge asking "can you do X" and hearing *"yes — here's exactly how, it's phase 2"* costs nothing. A half-built X that breaks on stage costs the round.

One exception worth considering if time allows: **~10 hardcoded FAQ pairs** so an unexpected judge question gets answered instead of hitting a wall. Half a day, disproportionate insurance.

---

## 3. Team split — six people, six lanes

Mapped to layer boundaries so the interfaces are already defined and people don't collide.

| # | Lane | Owns | Items |
|---|---|---|---|
| 1 | **Corpus & scraper** | `data-sources.md` §7 pipeline, Plane A, utilisation ingest | 1, 6 |
| 2 | **Rules & money** | Tier 1, calculator, literacy templates | 2, 3, 4, 5 |
| 3 | **Channel** | WhatsApp, language detection, voice | 10, 11 |
| 4 | **Routing & maps** | Prudential optimiser, geo, exclusion reasons | 7, 8, 9 |
| 5 | **Console** | Partner web surface | 12 |
| 6 | **Verification & demo ops** | Aadhaar verify, cache warming, rehearsal, pitch | 13, 14 |

Lanes 1 and 2 are the critical path — nothing demos without the corpus and the rules. **Lane 3's voice work is the single biggest technical risk; it starts on day one, not when the rest is done.**

The national rule is 6 members with at least 1 female member. Lane 6 doubles as the pitch owner, and per `rules.md` every member must be able to field a question on any component — rehearse cross-lane, not just your own.

---

## 4. Sequencing

**Week 1 — de-risk, don't polish.**
Voice pipeline spiked end-to-end (lane 3) · utilisation Excel downloaded and parsed (lane 1) · corpus to 5 schemes (lane 1) · Why/Why-Not refactor started (lane 2). If voice or the Excel parse is going to fail, find out now while there's still time to cut them.

**Week 2 — the demo path works once, badly.**
Every beat in §1 reachable end to end, ugly but real. Nothing is "nearly done."

**Week 3 — make it true.**
Real numbers, exclusion reasons in plain language, Hindi copy reviewed by a native speaker, map rendering properly on a phone screen. **Deploy to a real host** — not `localhost`, not a dev tunnel.

**Week 4 — stop building.**
`prompt.md`'s rule, and it's right: stop writing new code with real buffer left. Rehearse, break it deliberately, fix what breaks. That time is worth more than one more feature.

---

## 5. Demo ops — the part teams skip and lose on

**Pre-warm every cache on the demo path.** No live LLM call should sit on the critical path. Run the exact demo profile beforehand so every explanation, translation and TTS clip is cached. A cache-warm demo is deterministic; a cold one is a coin flip on somebody's rate limit.

**Three fallback layers, rehearsed in order:**
1. Live WhatsApp on real infrastructure — the goal
2. Local instance on the laptop, phone on hotspot — if venue wifi fails
3. Screen recording of the full flow — if everything fails. *Record it in week 3, not the night before*

**Deliberately break it in rehearsal.** Income of exactly ₹5,00,000 (the boundary a judge will test). A profile that matches nothing → No Dead Ends must fire. Two messages sent back to back. A voice note with background noise. An out-of-category user. If any produces a dead end or a silence, that's a bug, not an edge case.

**Own the mock disclosure — don't get caught by it.** Branch-level utilisation and RRB NPA figures are still mocked (`data-sources.md` §5.1). Say it before a judge asks, in the same breath as reveal 2: *"state-level utilisation is real and published; branch-level isn't published by anyone, so that's representative data, and here's the rule it feeds."* Volunteered, it's rigour. Extracted under questioning, it's a gap.

---

## 6. Q&A prep — the four questions that will come

**"How much of this is real versus mocked?"**
Lead with the split. Scheme data, eligibility rules, partner directory, state-level utilisation: real and sourced. Branch-level utilisation and RRB NPA series: mocked, because no public source publishes them — and that's a finding, not a gap. The *rules* are real in every case.

**"Isn't the government already building this?"**
PM SURAJ exists and we integrate with it rather than compete. JanSamarth exists and covers 15 schemes — none of these. Our defensible position is being the operator they adopt, not the portal they replace.

**"You're charging poor people to access welfare?"**
No. Eligibility, EMI, literacy, the locator and the checklist are free permanently. Only optional assisted filing is ever paid, the free path is shown with equal prominence, and the beneficiary is the **last** payer in the waterfall behind CSR, partner and B2G. Target: beneficiary-paid share trends to zero.

**"Why should we believe your numbers when your own docs say sources disagree?"**
Because we resolved it and can show our work. The rate conflict was a wrong-model problem — three schemes versus five. The income conflict was stale data: ₹5 lakh, rural and urban, effective 7 January 2026. Every field in our corpus carries a source URL and a fetch date. **That the information is this fragmented is the problem statement's own thesis — and it's why a maintained corpus is the product.**

---

## 7. The one-sentence version

> Every other platform tells you which scheme you *might* qualify for. Avsarathi proves you qualify, tells you what the loan actually costs against the moneylender you'd otherwise use, and routes you to a partner that can actually disburse this month — in your language, by voice if you can't read.
