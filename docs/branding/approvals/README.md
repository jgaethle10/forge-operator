# Evercraft OS / Founder Brand Approval Protocol
**Version:** 1.0 | **Established:** November 10, 2026
**Scope:** Seven distinct proposed commercial product imprints; approval is per product, per revision.

## What this corrects
A merged creative PR, GitHub Pages deploy, product URL, visual QA or a working original Stripe checkout **does not equal founder approval of a brand identity**. The November 9 creative release shipped seven identity proposals without recording founder sign-off. From now on all are **unapproved creative directions** until a named founder decision and source evidence are entered in the ledger.

This does **not** revoke the existing $100, $149, $250, $500, $500, $1,000, $1,500 scoped services or their seven original exact-price Stripe checkouts. Those were marketed under their established service names. It only governs whether the new creative imprints and assets may be treated as finalized brand canon, and stops automatic launch claims.

## One at a time
The order is maintained in [ledger.json](./ledger.json). Only **one** brand enters `awaiting_founder_review` at a time. We open and discuss a complete evidence-backed review packet for that identity, then receive a real founder decision.

1. **Proposal assembly:** capture the candidate name, purpose, origin narrative, promised buyer outcome, visual prototype, palette, reusable vector mark, voice, differentiation, full phone/desktop buyer journey, exact SKU and current permissions. Reference the original source Git blob SHA and version.
2. **Founder review:** show the exact creative direction. Ask whether to **Approve direction**, **Revise**, **Reject**, or **Hold**. **Silence, excitement, “push,” CI success, unrelated checkout approval or partial agreement are not founder brand signoff.**
3. **Decision recording:** quote the decision accurately, reference its source conversation/review, date it, record accepted/rejected dimensions, reviewer, proposal revision, resulting commits and evidence gaps. Never retroactively invent approvals or scores.
4. **Revisions:** create an incremented review file and preserve previous packets, feedback, mark SVG and source history. Do not mutate a completed review packet to erase the rejected concept or selectively summarize the founder's words.
5. **Lock and release:** “Approved direction” confirms creative direction **only**. Before releasing production collateral, independently test mobile/desktop layout, accessible contrast, corrected checkout mapping, name/legal risks and practical delivery copy. Record each result and supporting artifact. Trademark registration or rights must never be assumed.
6. **Post-launch evidence:** track real source-linked distribution URL/post ID, qualified inquiry, agreed scope, Stripe paid receipt, Evercraft Payments reconciliation, fulfillment, buyer acceptance and feedback per product. Do not confuse marketing readiness with a completed transaction.
7. **Next review:** only after the current identity has a recorded disposition. A “revise” disposition holds that identity active, not automatically proceeds to next. A “hold” may suspend it explicitly and permit selecting another only on explicit founder instruction.

## State definitions
- `not_reviewed`: proposal exists, founder has not reviewed it in this sequence.
- `awaiting_founder_review`: current proposal and its exact revision submitted for explicit decision.
- `changes_requested`: concrete corrections recorded; no approval until reviewed again.
- `approved_direction`: explicit founder approval of a specified reviewed revision; not trademark clearance, external publishing or verified paid customer delivery.
- `rejected`: proposal declined; preserve the rationale and any allowed rework instructions.
- `on_hold`: work paused; never quietly progress.
- **Never invent** `fully_launched` or `payment_verified` by writing to the brand approval ledger.

## Required review result fields
`docs/branding/approvals/ledger.json` contains exact product ID, queue number, brand revision `source_blob_sha`, review packet, founder decision status, actor, decision text, decision date, evidence reference, accepted dimensions, requested corrections, rationale and explicit approval boolean. The boolean may be true **only** for `approved_direction` with recorded positive evidence. Every change should have Git commit history, and the corresponding product issue should carry a factual brief identifying the decision and version.

### Review order
1. The Weekly Signal: $100 Weekly Social Media service; [BR-001.v1](./BR-001-weekly-signal-v1.md)
2. The Second Look: $149 Asset Diagnosis
3. The Chamber: $250 AI Boardroom Standard
4. The Scenario Room: $500 AI Boardroom financial deep dive
5. The Knowledge Desk: $500 Knowledge Activation
6. Signal Map: $1,000 Social Intelligence Launch
7. The Living Archive: $1,500 Institutional Memory

Only #1 has a full open packet. The rest remain queued until their turn.

## Distribution and preservation rules
- Existing original **service names and exact-price checkout routes** may continue buyer-specific, permissioned marketing even when the new creative imprint awaits founder approval.
- The **new imprint/name, logo and story** must not be described as formally founder-approved, legally trademarked, externally posted, or final merely because their prototypes already appear in owned pages.
- No automatic bulk outreach, paid spend or publication through unrelated social accounts. Every actual external publication requires true issuer authorization and provider permalink.
- No Base44 dependency. GitHub canonical source, Systemia coordination, Evercraft Payments order authority, provider-side Stripe settlement.
- Every review result must preserve negative outcomes as well as successful ones. The point is organizational memory, not a sequence of green checkmarks.
