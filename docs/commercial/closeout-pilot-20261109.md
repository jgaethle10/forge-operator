# Evercraft Closeout: paid-pilot engineering brief

Opened: 2026-11-09.
Status: first browser-local product builder committed on an isolated GitHub branch; checkout, deployment, and revenue are NOT verified.
Canonical source: public/closeout/index.html.
Proposed route after reviewed merge and deployment: /closeout/.
Brand: Evercraft Closeout. It is its own customer-facing product within Evercraft OS.

## The problem and buyer
A contractor finishes physical work, but the customer receives scattered texts, unexplained photos, and no professional handoff. Initial buyers: independent trades, maintenance crews, cleaning and property-service operators. EPS can be an internal design partner with synthetic or appropriately authorized data, but that is not proof of external demand.

## What is coded
A mobile-friendly static page creates a printable packet containing contractor and customer details, job reference, completed work, a job-completion checklist, remaining items, warranty/care text, and up to four job photos. It offers an explicitly synthetic sample and browser print/save-PDF.

The page uses no remote scripts, server-side upload, third-party checkout, customer account, claimed electronic signature, certified inspection, or customer acceptance. Data is not persisted. A browser print dialog requires user action. A contractor must review accuracy and store the exported file themselves.

## Proposed pilot offer
Price experiment: $49 USD one time for one job. A human-reviewed PDF handoff, up to four authorized photos, one round of factual corrections. Confirm scope, capacity, security, and delivery terms before accepting a payment. Additional work separately quoted.

The public page currently presents an inquiry email with subject only. That is NOT a checkout, payment authorization, guaranteed service slot, or automated fulfillment.

## Commerce architecture
Customer/product -> Evercraft Payments order -> Raven Nexus provider boundary -> connected settlement adapter (Stripe).

Do not embed a Stripe-first checkout or infer payment from a page visit, an email, a redirect, a screenshot, or a price displayed on a page. Paid status requires authoritative Evercraft order and settlement receipt verification.

## Definition of done for a paid launch
- [x] Standalone builder coded in feature branch
- [x] Node test file added
- [ ] CI tests executed and passing
- [ ] Reviewed and merged, deployed route independently checked on mobile and desktop
- [ ] Real synthetic-job print-to-PDF quality review
- [ ] At least one genuinely interested external buyer validates pilot scope and willingness to pay
- [ ] Closeout product identity and price registered with Evercraft Payments
- [ ] Product-specific order -> Raven Nexus -> payment settlement -> receipt -> entitlement verified
- [ ] Secure, authorized customer data and photo intake selected
- [ ] Human-reviewed fulfillment steps, timing, delivery confirmation, and corrections documented
- [ ] First external paid pilot transaction and actual deliverable verified before revenue is reported

## Non-negotiable evidence
Never say a customer accepted work based on a contractor-entered checkbox. Never push private client images, addresses, signatures, or credentials to public GitHub. Do not say revenue exists without verified payment receipts. Maintain product-specific branding, scope, quality, and fulfillment evidence.

## Next actions
1. Verify browser print quality and phone responsiveness.
2. Wire an actual Closeout offer to Evercraft Payments; do not bypass Raven Nexus.
3. Contact one target buyer with a synthetic example and a clear $49 pilot scope.
4. Apply the same buyer -> proof -> payment -> delivery protocol to the other proposed new products only after avoiding overlap with existing Evercraft product capabilities.
