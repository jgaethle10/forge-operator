# Home Participation Economy v0.1 (owned, simulation only)

**Purpose:** make Home valuable to people who create, discover, distribute, or strengthen good content. This package is the **economic allocation planner**, not a public social product, wallet, payments system, or live creator program.

Evercraft Home in `systemia/evercraft-home` remains the private operating front door. The future **public Home social experience** must have its own identity, moderation, privacy, and safety boundaries. Do not expose operator routes to general social users.

## Working code

- `engine.mjs` computes a deterministic allocation projection in integer USD cents, with no external dependencies.
- `engine.test.mjs` exercises settlement holds, duplicates, self-referrals, minors, fraud holds, missing fields, remainder handling, and conservation.
- `pilot.mjs` runs a synthetic sponsor campaign through the engine.
- The engine cannot create earnings, payables, transfer instructions, cash balances, escrow, custody, a provider-verified receipt, or a public offer.

```bash
node --test systemia/participation-economy/engine.test.mjs
node systemia/participation-economy/pilot.mjs
```

## Pilot hypothesis

Sponsor-funded original content can bring users to Home *before* Home operates a profitable ad network. Start with a narrow, prepaid pilot: 20 creators, 100 participants, a handful of independently paying sponsors. Sell genuine campaign deliverables, **not promised Home impressions** or guaranteed creator income.

A practical acquisition loop:

1. Creator uploads an original work with proof of rights.
2. A sponsor funds a specific campaign with disclosed deliverables, or fans purchase through an approved payment route.
3. Qualified community members can contribute by verifiable, opt-in curation and attributed sales/distribution **with creator consent**, never by buying shares in another person's content.
4. Evercraft Payments independently verifies source receipts, actual fees, and refunds, then a dedicated trusted adapter would pass those facts into this planning engine.
5. Creator, contributor, and Evercraft allocations are shown with explicit **simulated / pending / verified / settled** labels. Actual transfer workflows are separate and require policy, identity, age, tax, money-movement, and legal approvals.
6. Measure sponsor renewal, time-to-first-value, fraud rate, and actual contribution margin. Build feed ranking for user satisfaction, not payment maximization.

## v0.1 example policy (not an offer)

After confirmed collections minus refunds, processing fees and direct delivery costs:

| Bucket | Allocated share |
| --- | ---: |
| Creator | 60% |
| Verified distribution | 10% |
| Reviewed community work | 5% |
| Evercraft Home | 25% |

These are **illustrative basis point settings** for testing. Unclaimed creator or contributor portions remain **unallocated in the model**, not automatically transferred to Evercraft. No share is a claim to a creator's work, future income, equity, or guaranteed returns.

The model takes input `gross_collected_cents`, `refunds_cents`, `processing_fees_cents`, and `direct_delivery_costs_cents` **explicitly**. A missing number is an error, not zero. Missing or disputed receipts hold the entire plan. Fees include only actual verified direct costs; do not bury undisclosed general overhead in the deductions. The remaining Evercraft share must still cover overhead, support, fraud, reserves, taxes and profit.

## Anti-abuse policy

- Only a **verified attributed conversion** counts for distribution. Passive viewing, watch-time, clicks, likes, follower counts, raw referrals or simple invitations cannot mint a money claim.
- Distribution requires a direct, consented, policy-approved relationship to the event. No multi-level payout chains or perpetual claims.
- Curation/community work is reviewed and backed by a reference, not open-ended points.
- Self-referrals, duplicate event IDs (all copies), fraud holds, minors, absent consent, absent proof, and unsupported roles earn nothing in the simulation.
- Each event is currently weighted 1–100 by a trusted upstream review process. A social client cannot authorize its own weight or verification.
- Content rights, takedown, complaints, sponsorship disclosure, and account appeals require product policy and human review before public launch.
- Prioritize content quality and user retention; a feed optimized to maximize payout would invite manipulation.

## Integration contract / blockers

**Not built in this slice:** public identity, immutable append-only ledger, signed Payments receipt verifier, permissioned sponsor intake, fraud-review service, qualified attribution proof, advertiser settlement, tax/KYC/onboarding, disbursement provider, contribution appeal workflow, regulated-money legal review, user wallet, real social feed, publishing, or production deployment.

Payment truth follows existing Evercraft doctrine: checkout-start is not paid, expected receivable is not observed cash, and a modeled allocation is not a payout. A caller can forge the `settlement_evidence` object, so this pure function MUST NOT be wired directly to internet requests or used as financial authority. A future trusted adapter must independently verify receipts and recheck reversals before any payable creation.

The module emits `input_evidence_state: caller_asserted_not_independently_verified_by_planner`, `payouts_enabled:false`, `financial_authority_granted:false`, `custody_state:no_evercraft_custody_claim` and `simulated_not_payable` allocations on purpose.

**Next engineering slice:** append-only receipts and reversals; authority-bound contribution ingest; replay-safe/idempotent allocation plan IDs; proof-backed settlement adapter; public Home social UI (separate from operator Home), with pending-versus-available earnings semantics and parental safety design.

**Launch gates:** compliance counsel, sponsor contracts, FTC endorsements review, privacy, age assurance, payment service provider/merchant underwriting, tax reporting and payout verification. No public revenue-share promises while these gates are open.
