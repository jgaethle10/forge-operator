# Evercraft commercial loop: proof-first cross-wing order read model

Status: source-level reconciliation only. No live provider side effects, service activation, customer media access, payments, or delivery.

## Existing connected contracts

- Wing Courier receiving and Passport intake: systemia/wing-courier/intake-bridge.mjs
- Fallen independently reviewed quality gate: systemia/media-studio/customer-commercial-gate.mjs
- Harbor’s existing exact-file preview guard: systemia/distribution/harbor/commercial-preview-send-guard.mjs
- External provider readbacks: Meta Messenger, Evercraft Payments/Stripe, and Shipping. These are explicitly NOT implemented by this module.

The new projectCommercialLoop() consumes separately obtained and verified receipt inputs, uses the Courier candidate and preview-send guard functions from canonical modules, then returns a receipt-bound current stage, next permitted internal step, and missing evidence. It never invokes Messenger, checkout, media rendering or Shipping. It does NOT authenticate the caller, and a generated/self-attested receipt may not be treated as genuine. The future owner-side adapter must retrieve signed/original receipts and provider records directly. Proposed assignment, customer feedback, payment-readback and shipping-readback types are *adapter boundaries*, NOT assertions those live adapters already exist.

## Lifecycle milestones

Private Harbor files -> verified NextGen Courier custody -> Passport inert intake -> approved Systemia job + named Fallen producer -> independent Fallen render/QC -> founder-reviewed Harbor preview send -> actual Meta provider readback -> customer approval or revision -> explicit payment request -> authenticated Stripe paid readback -> finished master shipping readback -> customer acceptance/support.

The first customer remains on preview-recovery HOLD. Never bypass founder exact-file approval or automatically retry the rejected preview. The source-to-source loop must coexist with the other thread activating the real encrypted broker and resident. Do not provision duplicate services, alter Saban on port 8791, or run Penguin's destructive Fabric updater before backing up dirty Journal files.

A successful Courier transport is NOT production admission. A good Fallen QC report is NOT Meta send authority. A successful Messenger submit is NOT customer approval. A checkout session or active $50 Stripe link is NOT payment. A paid receipt is NOT proof of finished delivery.

## Test

node --test systemia/commercial-loop/*.test.mjs systemia/distribution/harbor/commercial-preview-send-guard.test.mjs systemia/wing-courier/intake-bridge.test.mjs

Tests cover 12 synthetic stage scenarios including wrong package/asset count, missing admission, assignment conflicts, changed previews, producer self-review, wrong customer Page/thread, duplicate Messenger send on replay, revision holds, unpaid or wrong-amount checkout, and unverified final delivery.

## Security and integration rules

- Keep original customer names, sender tokens, private keys, media filenames, producer notes, Messenger thread contents and raw source files in owner-private stores, not GitHub or public reports.
- Inputs must come from authorized owned Courier, Passport, Fallen, Meta, Stripe and Shipping adapters, not user-supplied JSON or generative text.
- The model intentionally returns action suggestions only; every external send or charge remains guarded and independently authorized by its actual provider adapter.
- Reconcile the actual live Penguin/NextGen/Harbor machine evidence before claiming a real order changed state.
- Next build the trusted owner-private adapter that reads existing evidence without changing independent authority, then prove one complete synthetic case across actual machines before processing the customer's 12 files.

Tracking: https://github.com/jgaethle10/forge-operator/issues/2280
Deployment: https://github.com/jgaethle10/forge-operator/issues/2294
Preview incident: https://github.com/jgaethle10/forge-operator/issues/2284
