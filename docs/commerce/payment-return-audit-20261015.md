# Payment-return audit, 2026-10-15

Checkout preparation and payment completion are separate evidence states. All 15 offer preparations passed, but source inspection found two return-path defects: original Raven offers returned to a plain buy page without verification; added native offers used fabric-prefixed order keys rejected by the shared buyer callback's buyer/qa UUID guard.

Changes: native callbacks now refetch the exact order/session through central Evercraft Payments, require a matching canonical receipt before showing paid, and show a no-second-payment pending/invalid page without a purchase CTA. New direct checkouts use a stable buyer UUID derived from offer plus form idempotency, matching the already-approved shared callback format. No settlement guard is weakened. Existing open QA sessions with old fabric-prefixed IDs are not retroactively rewritten.

Validation: 10 targeted tests pass, covering accepted/invalid/unpaid/unavailable/mismatched returns, native HTTP return behavior and direct order format stability. Five local Fabric runtime tests also pass. No real payment was submitted, no provider success was fabricated, no fulfillment was marked delivered.

Inspected live central source: verify_checkout refetches the provider session, validates order, offer, product, amount, currency, mode and complete/paid state, then creates a canonical receipt and queues fulfillment. A webhook path independently validates events and creates receipt plus queued jobs. evercraftFulfillmentOps is admin-only and requires a paid order plus receipt before state transitions. Queue admission is not actual execution or delivered output. Worker wiring, real settlement and actual delivery remain unverified.
