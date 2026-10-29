# Evercraft AI Boardroom: customer launch and operational acceptance
**Date:** 2026-10-28
**Owner:** Evercraft LLC
**Product URL:** https://jgaethle10.github.io/forge-operator/mesh/ai-boardroom/
**Commercial status:** source-ready refreshed public landing page; public deployment, live provider checkout, purchaser order ingestion, actual independent multi-model sessions, paid fulfillment and attribution are **not established by this source change**.

## Product in one sentence
**One question. Different perspectives. A better decision.**

A customer should see one clear next move, not a control panel of engines and agents.

## Recovered, reused assets
- Existing canonical AI Boardroom landing at `public/mesh/ai-boardroom/index.html`; updated in place rather than creating a second product.
- Free, **deterministic client-side** text comparison: `public/mesh/ai-boardroom/compare/index.html` and `engine.mjs`. Handles 2-3 user-pasted AI answers; no model calls, browser upload or independent fact checking.
- Exact scoped human-reviewed service pages: `public/mesh/checkout-ready/ai-boardroom-standard/` ($250) and `ai-boardroom-financial-modeling/` ($500); hosted Stripe links already specified in those pages. Scope confirmation comes before buyer checkout.
- Read-only discovery records: `public/mesh/ai-boardroom/ai-discovery.json`, `llms.txt`; machine discoverability is not actual AI-provider referral.
- Existing separate pending PR #1713 only adds read-only Fabric discovery; pending PR #1342 is an isolated evidence gate, not working autonomous model execution. Do not report either as shipped.

## Product design
- Brand: **AI Boardroom by Evercraft**, near-white paper `#faf9f7`, ink `#161c26`, decision blue `#2544b8`, midnight `#172b78`, restrained gold `#e8bd78`.
- Distinct from Work Saban's crimson-forward identity.
- Voice: calm, useful, accountable. Never imply named providers participated unless an authenticated receipt exists.
- Mobile-first, high contrast, no third-party fonts/scripts/tracking on the homepage.
- Main action: **Compare AI answers free**; secondary action: **Explore decision reviews**.
- Human-reviewed tiers remain explicit. No unauthorized low-price payment link or self-serve paid entitlement.

## Commercial ladder and positioning
1. **Free Compare ($0):** usable without account, preexisting answers only; wording/stance and unanswered-evidence map, copied or downloaded locally.
2. **Standard Review ($250, existing):** scope one consequential business question and return a human-reviewed written decision assessment. Timing and source package agreed before payment.
3. **Financial Deep Dive ($500, existing):** one scoped decision plus explicitly labeled scenario modeling.
4. **Proposed instant Decision Map ($9 hypothesis):** **not live / do not charge**. Release only after independent model/QA, cost caps, a matching approved price and Evercraft Payments order-to-delivery reconciliation are actually verified.

Competitive baseline, official public pages viewed Oct 2026: LLM Board publishes approximately $0.40-$3.50 session estimates; ModelCouncil advertises $49/month Pro; Multi advertises from $19/month or one-time $399. These are reference prices, not verified customer willingness to pay. Boardroom's defensible difference must be **decision rigor and accountable next steps**, not merely more chat windows.

## Minimum complete assisted-service buyer loop
1. Customer sees clear scope and price, initiates written scope confirmation without a phone call.
2. Evercraft confirms decision, alternatives, authorized source material, turnaround and expected written deliverable.
3. Customer explicitly accepts exact offer and reaches the matching Stripe-hosted form.
4. **Never provision on checkout creation or success-page arrival alone.** Evercraft Payments accepts an authoritative verified provider event/receipt, reconciles correct SKU, amount, transaction and customer, and avoids duplicate fulfillment.
5. Create a private, access-controlled customer job record only after paid verification.
6. Deliver reviewed PDF or downloadable written report over an authenticated or otherwise agreed secure route. Record source lineage, assumptions, version, reviewer and completion status.
7. Invite a follow-up review. Capture feedback only with consent.

No account-specific Stripe read/write was possible in this session. Existing URLs are historical references, **not independently reverified live links**.

## Customer deliverable quality rubric
The finished decision brief must have:
- Decision question and business context
- Alternatives and constraints
- Evidence table: source + observed time + confidence + scope
- Claims and counterclaims with reasons
- Where participants agree, disagree or rely on the same assumptions
- Base/downside/upside scenarios only when modeled and labeled
- Risks and what would invalidate the recommendation
- Reversible next experiment with owner, timeframe and success criteria
- Decision recommendation **or** explicit insufficient-evidence conclusion
- Provenance, reviewers and revision date

**Never** invent model identities, source citations, expert authority, payments, approval or completed work.

## Autonomous software release gate (future)
- Live authenticated provider adapter call per seat, distinct provider/model/request identity, independent replies, traceable token/cost receipt, rate limiting and retries.
- Real adversarial critique and synthesis with source provenance. Consensus is not accuracy.
- Saban/Systemia orchestrates server-side only. No provider secret in browser.
- Bounded tenant isolation, content retention controls, privacy terms, abuse defense, cost ceiling and job idempotency.
- Model and failure states exposed honestly (partial, failed, held, completed).
- No order accepted before payment confirmation webhook signature, replay protection and exact price validation.
- QA tests verify correct output versus unknowns, mocked-versus-real provider execution, network failure, and customer-visible delivery.
- Only after those pass, enable independent self-service checkout and marketing of real multi-model live deliberation.

## Distribution
- **Discoverability:** maintain accurate JSON-LD, `llms.txt`, AI discovery JSON, canonical, sitemap and stable public link; verify actual provider citations externally rather than assuming pickup.
- **Demonstration:** offer a hypothetical scenario in the free tool; disclose that it is a sample. A real free product is more convincing than an unsupported agent-count claim.
- **Marketing:** answer intent such as 'ChatGPT and Claude disagree', 'compare AI answers', 'second opinion on business decision'. Publish a practical decision comparison example rather than generic AI hype.
- **Paid conversion:** use existing exact-price service pages only after scope and capacity check. Do not bypass Evercraft's gate.
- **Analytics:** establish privacy-respecting event instrumentation for page view, free compare start/export, service CTA, scoped inquiry, verified checkout, verified paid order, fulfilled delivery and repeat purchase. Do not report events before instrumented evidence exists.
- **Revenue reporting:** only count verified provider-paid orders; separate visits, leads, checkouts started, paid receipts, fulfilled reports and repeat purchases.

## Release acceptance and blockers
| Gate | Status | Required proof |
| --- | --- | --- |
| Existing code and offer recovery | Done | GitHub content inspection |
| Customer homepage refresh | Staged branch | source diff and mobile render |
| Free Compare color match | Staged branch | source diff |
| Structured-data and product-truth test | Staged branch | Node regression suite + CI result |
| Public deployment | Unverified | merged release + external URL/browser receipt |
| Matching live Stripe form | Unverified this run | fresh external provider checkout view, without a charge |
| Scope and delivery capacity | Human required | accepted scope/timeframe |
| Paid order reconciliation | Blocked | signed provider-paid webhook/receipt and persisted job ID |
| Independent multi-model live run | Blocked | same-session distinct real provider responses and validation |
| Automatic report fulfillment | Blocked | secured delivery receipt |
| Third-party distribution and sales | Not claimed | actual public listing/referral and attributable order |

**Do not merge other product PRs as a side effect of this launch.** Existing draft Boardroom work requires independent review. Never use Base44.
