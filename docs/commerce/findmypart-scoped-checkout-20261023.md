# FindMyPart: owned, scope-bound checkout gate

**23 October 2026 | Systemia production candidate | NOT DEPLOYED**

## Customer problem
The current owned Fabric `/offers/findmypart` storefront can collect only the buyer's email before initiating a $19 Quick Hunt. The real fulfillment contract needs actual part identity/equipment information. A successful processor session without an order-bound part brief would be commercially and operationally unsafe.

## Changes in this PR
1. Browser form for Quick, Deep and Rescue hunts requires **part description**, **equipment context** and two separate opt-ins (scope acknowledgment and checkout preparation). Optional part markings and previously searched sources.
2. Server validates fields, normalizes and bounds lengths; rejects incomplete or unconfirmed requests with HTTP 422 before invoking the purchase service.
3. Server computes a deterministic SHA-256 scope digest and submits the customer-authorized intake to the Evercraft-owned payment service using a **non-transactional** `findmypart_prepayment_preflight` action. Includes buyer email, exact offer key, stable order correlation key, structured intake and digest.
4. The payment service must return `schema=raven.findmypart-context-preflight.v1`, `checkout_created=false`, `intake_persisted=true`, the exact digest and an opaque `intake_ref`. No such acknowledgment, no checkout call.
5. Subsequent paid checkout request carries `intake_ref` and digest; response must confirm `context_persisted=true`, the same ref and digest, `fulfillment_release!=true`, correct currency and exact $19/$49/$99 price. Otherwise fail closed. The existing customer-support/assisted-invoice fallback remains.
6. Payment is never declared settled by a prepared checkout. Fulfillment still requires provider-verified receipt and acceptance.

## Required downstream adapter work
**The owned Evercraft Payments ops and purchase-intent runtimes must implement this preflight and checkout binding contract.** This source PR alone is not a turnkey live payment pipeline and must not be deployed as a working checkout until both adapters and the specific hosted public routes are confirmed ready. Endpoints are configured by `EVERCRAFT_PURCHASE_INTENT_OWNED_URL` and `EVERCRAFT_PAYMENT_OPS_OWNED_URL`, never the retired legacy provider.

Actions:
- `findmypart_prepayment_preflight` on both applicable owned endpoints, no payment created. Persist encrypted/private authorized intake with retention limits, generate an opaque reference, store digest and correlate to order+exact price+buyer; return above acknowledgment only after durable storage.
- On `create_checkout` and native purchase-intent operations, require the matching order, intake reference, digest, and approved SKU. Reject reused reference for a different buyer, SKU, or order. Return exact same digest/ref with `context_persisted=true`.
- Reject missing/expired/altered intake, failed storage, wrong amount and unverified payment without beginning paid research. Honor consent/retention/privacy; do not log raw part briefs with emails into public GitHub, CI or analytics.

## Test and release gates
- CI: `node --test tests/findmypart-scoped-checkout.test.mjs` and `tests/fabric-offer-pages.test.mjs`.
- Inspect current live Fabric DNS/TLS, runtime health and deployment SHA independently. This session's external access to Fabric was unavailable; **do not assert it is online**.
- Once owned adapters implement contract, conduct a customer-consented test using **a real, non-sensitive part problem**, checkout with **no card charge first**, confirm provider settlement only after authorization, ensure real order context and receipt survive restart and can be delivered. Reconcile any refunds and webhook idempotency.
- Real mobile browser review: form labels, keyboard, textarea, invalid input, back navigation, checkout/handoff, cancel, return and order status.
- Systemia release approval, production deployment receipt, post-release exact-build canary, preserved rollback and no unsolicited outbound unless separately approved.

Status: **Source candidate only, checkout service adapter confirmation pending.**
