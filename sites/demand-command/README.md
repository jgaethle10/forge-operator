# Evercraft Demand Command | owned-only revenue intelligence

Status: **working single-file local prototype assembled and syntax-checked; production deployment not yet performed**.

Purpose: turn source-backed demand into a qualified business and named buyer, documented pain, appropriate Evercraft offer, tailored outreach, interaction ledger, follow-up and measurable outcome.

Views: all open, qualified, unqualified with known problem, direct paid work, product offers, closed/lost, follow-ups due. Fields: business, buyer, contact channel, website, problem, evidence class (verified / assumption / unverified signal), immutable source reference and source text, category, status, matched capability, value estimate, tailored offer, outreach draft, sent details, reply, objection, follow-up, outcome and activity history.

Offer catalog: Evercraft Payments, Work Saban, Research, ForensiScope, Commercial Studio / Fallen Studios, EV site planning/reports, qualified-lead systems, Website Audit, Boardroom, custom owned implementation. Pull current commercial readiness from Evercraft Fabric discovery; never extrapolate prices or claim unverified fulfillment.

Nonnegotiables:
- Never use Base44, Wix or third-party app runtime. GitHub canonical; Systemia orchestration; Evercraft-operated site/API/database.
- Keep source observations, guesses and unverified signals in separate labeled fields and states. Promotion to verified requires a citation and verification receipt.
- Saban may propose messages, but no generic mass-send, no forged familiarity and no autonomous outbound without explicit authorized policy, identity resolution, channel permission, duplicate checks, and real delivery receipts.
- Log buyer reply, objections, last send, next follow-up and won/lost outcomes. No synthetic leads or invented revenue.
- Production implementation: private authenticated CRUD API + encrypted store + append-only evidence/interaction audit trail, intake and heartbeat bridge, approved offer registry, safe outbound adapters, deduplication and retention.
- Local prototype uses browser localStorage and JSON backups. It is NOT a shared or secure production CRM. Never put actual confidential buyer records into a publicly reachable static site.

**Source promotion completed (November 19, 2026):** the exact runnable local UI is now committed as `index.html`. The separate private API canary, tests and service example are in `backend/`; read `backend/README.md` and `RELEASE_NOTES.md`. Local tests passed (3 tests). The UI still uses browser localStorage and is **not connected to the API**. The PR is draft and **nothing has been deployed to NextGen, Penguin or a private owned URL**. Do not mistake a committed file or healthy local canary for a production service.
