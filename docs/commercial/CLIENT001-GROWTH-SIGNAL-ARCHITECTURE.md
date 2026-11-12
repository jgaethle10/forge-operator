# Evercraft Growth Signal | CLIENT 001 | Systemia plan

## What the first real deployment must prove

1. **Exposure is not sales:** campaign code → page event/QR scan → call or inquiry → owner-confirmed booking → paid fulfilled service. Each transition is a separate evidence class.
2. **Merchant source of truth:** connect Juan's Square *with his consent* via OAuth with narrowly scoped payment read permissions; store tokens only server-side encrypted. Verify Square webhook signatures and re-fetch payment state; dedupe by payment ID, recognize refunds and cancelations. No automatic credential transfer from Evercraft's own payment system.
3. **Cash App caveat:** standalone consumer Cash App does not expose a general self-serve transaction API for third-party revenue dashboards. If Juan takes Cash App payments, reconcile that channel from an authorized payment report or his own minimal confirmation, never estimate.
4. **Business-wide totals:** only compare weeks if all payment channels and cash sales are reconciled. 'Total revenue growth' is not the sum of Evercraft referral events.
5. **Attribution ≠ causation:** campaign-sourced first-paid jobs can be documented, but the net incremental growth claim needs baseline comparability or an experiment. Track both separately.
6. **Profit:** Square sales don't reveal oil/filter expense, driving, shop labor, disposal or depreciation. Show contribution margins only after compatible cost source is connected; no guessed profit.
7. **Privacy:** do not collect name, number, address, license plate, vehicle ID, payment tokens, or raw messages in campaign logs. When linking services and payments, keep any mapping in secure back-end with opaque references only.
8. **Founder/owner access:** private role-scoped portal, owner data controls, revocation, retention rules, Systemia Passport, append-only verified receipts, Radar audit of missing data, Saban sync and re-evaluation.

## Four working pieces in this checkpoint

- Mobile-ready interactive demo, 4 tabs and event simulation (static HTML, no network calls).
- Deterministic metrics and source channel display in JS; actual-mode prevents phantom metrics.
- Local Node reference collector with HMAC-authenticated, deduplicated append-only evidence classes; no automatic merchant integration falsely claimed.
- Browser smoke QA + API integration QA receipts. Preview is private and staged in GitHub, not customer-facing.

## Client consent checkpoint before integrations

One written approval from Juan specifying: On The Go's designated website/domain, consent to share aggregate business analytics with Evercraft, Square read-only OAuth permission, which lead channels to track, which managers may see metrics, and opt-out/revocation process. Then implement integrations on Evercraft-owned runtime.

## Proposed automatic daily operating loop

- Owned landing event counters aggregate daily.
- Square payment adapter reconciles completed/refunded transactions server-side.
- Booking source correlates eligible events with merchant references; ambiguous rows remain pending rather than counted as verified.
- Saban ensures jobs run, Radar flags connection failures and inconsistent receipts, Systemia produces a client-only digital growth digest.
- Juan sees a clean daily status, not a spreadsheet or anything that requires repetitive manual entry.

**Status:** prototype, not a live connected app. No customer messages or promotional posts have been sent as part of Growth Signal.