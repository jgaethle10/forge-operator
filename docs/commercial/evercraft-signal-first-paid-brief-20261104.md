# Evercraft Signal | Founding paid pilot

**Date:** November 4, 2026
**Owner:** Evercraft LLC
**Canonical entry:** https://jgaethle10.github.io/forge-operator/signal/#request
**State:** CUSTOMER SCOPE REQUEST ONLY. No approved paid checkout or first sale is claimed.

## One offer, one decision

**$250 proposed one-time Incident Evidence Brief**. Customer supplies one publicly documented incident or facility, one decision question, location if relevant, and an optional official source link. Additional public sources (up to six total) may be considered within a bounded scope.

**Work product after paid scope acceptance:** A human-reviewed written brief with a dated source ledger, concise timeline, clearly labeled confirmed/reported/disputed/unknown claims, key evidence gaps and questions to investigate next. Written delivery format, due date, corrections and final price must be confirmed in writing first.

The $250 price applies only if the one-incident bounded pilot is accepted. Expanded sources, continuous monitoring, legal/technical specialist testimony or investigative field sampling require a separate quote. Do not imply real-time hazard detection, radiation exposure conclusions, emergency guidance or guaranteed safety.

## Conversion flow

1. Customer opens the free Savannah River evidence example and sees exactly how Signal attributes claims.
2. Customer enters incident, a concrete decision question and optional context on the same page.
3. Browser locally validates the inputs. The button opens an email app with a prefilled request; a copy fallback exists. **No data is uploaded, email sent, order created or payment charged by the page.**
4. Evercraft checks feasibility and legal/public data access, identifies the proposed actual deliverable, confirms capacity, due date and exact price.
5. Only after acceptance, Evercraft presents a checkout for the exact Signal SKU with verified merchant and amount. The historical seven Stripe links are other SKUs and must never be substituted.
6. Verify an authoritative provider-paid receipt and preserve the matching order/refund identity, then produce and deliver the report with a receipt and stated corrections channel.

## First buyer outreach

Focus on professional buyers with a concrete decision deadline, not on distressed residents. Useful buyer categories: EHS/industrial-risk teams, facilities and insurers tracking a specific event; independent newsrooms; local business operators needing to decide whether a disruption affects them; environmental consultancies doing preliminary desk research. Do not present this as an official government service.

**Buyer-facing note:**

> Subject: A clearer evidence brief for an incident you're tracking
>
> If your team is trying to reconstruct an industrial or infrastructure incident from scattered public notices, Evercraft Signal can produce a one-time, source-linked Incident Evidence Brief. It separates confirmed statements, disputed reporting, missing documents and a dated timeline. A bounded founding pilot is proposed at $250, subject to accepting the exact scope and delivery date. Our free Savannah River example shows the method: https://jgaethle10.github.io/forge-operator/signal/ . If you have one incident and one question, the page prepares a request in under a minute. No subscription or call needed.

Do not claim an email was sent, a buyer responded, a payment settled, or a brief delivered without the corresponding source receipt.

## Operating scorecard

Count only externally verifiable stages: page loaded (HTTPS receipt), inquiry actually received, qualified scope accepted, exact-SKU checkout issued, provider-paid receipt, brief delivered and customer acceptance. A browser email draft or a "Copy request" click is **not** a received inquiry. Without analytics or inbound records, the conversion rate is unknown.

## Next technical gates

- Verify the new scope module, offer manifest and rendered page via the existing HTTPS deployment probe.
- Confirm at least one completed scoped buyer workflow with matching payment and fulfillment evidence before advertising self-serve billing.
- Only then test recurring monitoring subscriptions, source freshness SLAs, corrections, opt-in delivery and cancellation.

## Evercraft Payments canonical product route (November 4)

Signal's proposed $250 USD one-time founding evidence brief is registered as the exact owned offer key `signal.incident_evidence_brief_250.v1` under `systemia/mcp/public-payment-offers.mjs` (slug `signal-brief`, amount 25,000 cents). Product route: Signal → **Evercraft Payments** (order and entitlement truth) → Raven Nexus (provider boundary) → settlement adapter. A processor link must not appear as a separate product checkout or be borrowed from a same-price unrelated service.

The owned offer-page route is `/offers/signal-brief` on Fabric, but **source registration does not prove the public runtime is updated or that checkout works**. Until an accepted scope, exact SKU provider acceptance, and a real independent checkout canary are available, `native_order_enabled=false`; the runtime returns HTTP 409 and does not invoke payment operations. The customer sees scope preparation instead of a fake purchase. The main Signal site continues to collect only a draft email request, not payment or an order.

**Reopen only after:** live owned HTTP offer verification; explicit bounded scope and delivery capacity; authorized native ops allowlist for exact key/price/currency; idempotent checkout request; real provider-paid/refund verification and matching Systemia fulfillment receipt. The same-price Workflow X-Ray or other Stripe SKU must never be substituted. A green unit test or rendered form isn't a collected payment.
