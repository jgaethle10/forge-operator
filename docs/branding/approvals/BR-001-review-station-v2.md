# BR-001 / Founder decision capture station v2
**Product:** Social Media Management · Weekly · USD $100  
**Identity stage:** Proposal under founder review, **not founder-approved**  
**Previous evidence:** BR-001-weekly-signal-v1.md; BR-001-name-exploration-v1.md and .json  
**Station:** https://jgaethle10.github.io/forge-operator/mesh/checkout-ready/social-media-weekly/brand-review/decision/  
**Date prepared:** November 15, 2026 (America/Los_Angeles)  
**Review stage version:** BR-001.R2

## Why the station exists

The founder requested brand-by-brand approval with extensive documentation. Three name concepts were prepared under BR-001, but none was approved. A complete identity decision must distinguish approval of a *name* from approval of the *purpose*, *narrative*, *voice*, *color system*, *emblem*, *commercial buyer clarity* and *Evercraft OS relationship*.

The station offers a non-submitting, local-only review worksheet. It **does not call GitHub, Systemia, Evercraft Payments, Stripe or any other service**; no payment or request is made. It neither records a formal decision nor marks an identity approved. Users must deliberately copy or save the draft report and communicate it for review. The review page has `noindex,nofollow,noarchive` metadata, but **is not an authenticated private page**; avoid typing secrets, customer information or private account credentials.

## What is recorded in a draft

- Exact product ID `evercraft.commerce.social-media-weekly`, original `Social Media Management · Weekly` SKU and one-time price USD $100.
- One selected *working direction* (Weekkin, Cadencekeep or Weekmorrow) or null if undecided.
- Exact unedited founder free-text remarks on the name and general changes.
- One decision per dimension: `not_assessed`, `keep`, `revise`, `reject`.
- A requested disposition: `continue_exploration`, `revise`, `hold`, `reject_shortlist` or `request_approval_review`.
- A `generated_at` timestamp for the **draft**, explicitly not an approval date.
- Evidence links to previous proposals and the canonical approval ledger.
- Explicit `founder_approved:false`, `submitted_to_evercraft:false`, `legally_cleared:false`.

No localStorage, cookies, fetch requests or external analytics are added. The report is generated in browser memory, and the founder may deliberately copy or download it. If clipboard permission is unavailable, the text is selected for manual copying. The dedicated page does not expose any Stripe checkout button.

## Formal decision promotion gate

A copied or downloaded report is evidence of preferences only until the founder explicitly communicates the decision (for example in this conversation), with the proposed identity/version identified and the scope of approval unmistakable.

Upon receiving such an instruction:
1. Preserve the exact founder message and the draft report (if provided), with provenance, date and source reference.
2. Reconcile ambiguous or contradictory parts and request clarification rather than inventing an approval.
3. Record the disposition in a new, versioned decision report based on `DECISION-RESULT-TEMPLATE.md`.
4. Add one append-only founder decision event to `events.json`. Update `ledger.json` and per-product metadata atomically through a reviewable Git commit/PR when feasible. This station itself can never do those steps.
5. For `approved_direction`, identify **precisely which version and dimensions** were approved. Do not infer trademark clearance, OS automated fulfillment, media-publishing authority, paid customer acquisition or next-product approval.
6. Preserve unsuccessful candidates and source materials. Advance to product 02 only when the review protocol permits it.

## Engineering and release evidence checklist

- [x] Existing first commercial product exact SKU/price remains untouched in this change.
- [x] Client-side report includes stable product, version, and structured dimensions.
- [x] The reviewer has explicit controls for selection, revision, rejection, hold and approval-review request.
- [x] The public comparison page links the review station.
- [ ] Independent rendered-browser mobile/desktop review for BR-001.R2.
- [ ] Founder feedback and any approval.
- [ ] Trademark/name availability verification.
- [ ] New approved visual mark, if founder selects one.
- [ ] Any external channel/marketing publication receipt.
- [ ] Provider-paid customer checkout/ledger reconciliation.
- [ ] Product delivery acceptance record.

**Review principle:** do not optimize records into a wall of green checkmarks. Document indecision, poor names, weak concepts, accessibility problems, buyer confusion and failed tests with equal care.
