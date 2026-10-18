# Evercraft | Emotion → trust → proof → conversion
**Systemia decision packet · 2026-10-17 · SOURCE CANDIDATE, not deployed**
**Admission lineage:** existing commercialization and checkout gates #1159, #1224, #1303; implementation is stacked on draft checkout rollout #1374. Human buyer page UX remains subject to #1352 and scoped Systemia release review.
**Founder direction:** turn existing Evercraft capabilities into revenue; no spam, fake proof, disconnected checkout platform, unauthorized charge, new Base44 dependency or unverified production claim. No public post without review.

## Diagnosis
Evercraft currently exposes extensive capabilities, technical evidence and a fixed-price checkout catalog, but the technical language can ask a new buyer to understand the architecture before they understand why a purchase matters. Existing conversion work already simplifies CTA and input order. The additional gap is *buyer relevance*: demonstrate the moment of pain, the stakes, the bounded relief and the verifiable handoff in the first screen.

The founder observed the live purchase continuation to Stripe. That is valuable checkout-entry evidence, not provider-settled payment, delivery, every SKU, or current deploy parity. Oct 17 independent canaries remain a release gate. Never regress a working buyer handoff for a new marketing design.

## Research and application
1. **Category entry points:** Ehrenberg-Bass identifies recurring buying situations as retrieval cues for brand choice. For every Evercraft offer, write the scene when a customer first feels the problem, not a vague persona label. Source: https://ebims.emdev.au/category-entry-points-in-a-business-to-business-b2b-world/
2. **Emotion + rational activation:** Binet and Field's B2B research separates long-term emotional brand growth from short-term rational decision needs. Tell a human story first; make price, evidence and next action understandable immediately. Source: https://business.linkedin.com/advertise/resources/b2b-institute/b2b-research/marketing-as-growth
3. **Trust design:** Nielsen Norman Group links credible professional presentation, clear company details and appropriate product information to willingness to take risks online. Put evidence and scope at the decision, label boundaries, never mimic customer praise or generate unearned authority. Source: https://www.nngroup.com/reports/ecommerce-ux-trust-and-credibility/
4. **Checkout friction:** Baymard's research emphasizes full costs, visible guest continuation, minimized fields and clear errors. Use existing #1352 work for one CTA, conspicuous website field where needed, accessible mobile layout, clear price and no surprise account gate. Avoid treating aggregated ecommerce numbers as Evercraft's measured conversion rate. Source: https://baymard.com/blog/reduce-cart-abandonment
5. **Brand recall / B2B timing:** LinkedIn's B2B Institute 95-5 framework is a heuristic about variable buying windows, not an estimate of Evercraft's measured lead distribution. Build a long-lived discoverable proof library in parallel with specific high-intent buyer journeys. Source: https://business.linkedin.com/advertise/resources/b2b-institute/b2b-research/trends/95-5-rule

## Positioning architecture
**Brand idea:** Evercraft helps people see what is breaking, understand what matters and bring a verifiable workflow into operation. Claim only the product-specific portion actually demonstrated.
**Distinctive visual signature:** recognizable Evercraft-owned dark/glass/electric treatment; human-scale first scene, real product interaction next, verified evidence last. No retro grid; avoid interchangeable generic AI imagery.
**Brand narrative:** "A customer tried to pay. The system did something. Did the business get paid, and does the right work happen next?" Human anxiety → agency → concrete authorized flow → receipt boundaries. Do not assert prevented losses, added income or flawless operations without evidence.
**Copy syntax:** "[Recognizable moment of friction]. [What we examine or implement]. [What buyer gets]. [What we cannot promise]. [One price / one next action]."
**Proof ladder:** hypothetical concept → source implementation → local passing test → externally observed live step → verified settled transaction → fulfilled customer result → independently approved customer testimony. Never collapse rungs.

## Applied buyer moments and offer priorities
| Buying moment | Existing approved offer | Headline/emotional promise | Trust boundary | Buying action |
|---|---|---|---|---|
| Seller cannot distinguish checkout from paid order | Evercraft Payments Founding Integration, $750 | Know when a customer paid. Know what happens next. | One existing processor-backed offer; verification and launch subject to access/acceptance | Existing human offer/checkout, only when external canary green |
| A repeated browser task breaks when someone is absent | Browser Workflow Diagnosis, $149 | When one browser task breaks, the whole day can get stuck. | Diagnosis only, no unattended production automation | Existing exact offer |
| Old workflow prevents confident modernization | Legacy Software X-Ray, $250 | Your old system still runs the business. Know the risks before changing it. | One bounded assessment; no production migration | Existing exact offer |
| IT leader faces IBM i 7.4 upgrade | IBM i 7.4 Upgrade X-Ray, $250 | An IBM i upgrade shouldn't introduce surprises to the workday. | Specific workload; no upgrade/certification guarantee | Existing exact offer |
| Signers need clear consent and custody | Evercraft Sign Founding Pilot, $250 | Make the signing journey clear to everyone involved. | Pilot only, with identity and legal-review requirements | Existing exact offer |
| Important decision depends on conflicting claims | TOWI Rapid Evidence Scan, $750 | Make the next decision with the evidence in view. | Bounded research; uncertainty preserved | Existing exact offer |

These six headlines and their evidence-conscious ledes are changed in `systemia/mcp/portfolio-offer-copy.mjs` on the stacked branch and rendered by the existing `renderOfferPage` function. Tests assert actual page output and approved offer/price immutability.

## Cash lanes (do not confuse reach with revenue)
**Lane 1, immediate qualified demand:** prioritize already-authorized paid human offers that pass independent buyer/processor canaries. A short buyer proof page must answer: Who is it for? What breaks? What's included? What exactly costs how much? What happens next? What does the proof *not* establish?
**Lane 2, high-value partner distribution:** demonstrate verifiable Evercraft Fabric capabilities to authorized tool builders, integration partners and software operators. Partner page should show one working invocation, boundaries, deployment requirements and an appropriate human handoff, not an invented enterprise price or logo. Enterprise licensing requires individually approved commercial terms; don't repurpose a $750 checkout as a $30k contract.
**Lane 3, compounding owned media:** Evercraft Journal, LinkedIn, FB/IG and the authentic graphics department tell one story per verified capability. Each asset has a permanent owned evidence page and a distinct tagged CTA if and only if the buyer path is working. Never blast contacts or imply published until platform receipt exists.

## Creative system: one hero proof film and three fragments
**Film concept (45–60 seconds): "The question after checkout."** Storyboard must use actual owned graphics and genuine screens or explicitly labeled simulations. Creative is a planned asset, not produced by this commit:
- 0–10 sec: a small business owner sees an order appear but can't tell whether it settled. Sound leaves room for uncertainty; no invented real customer or panic footage.
- 10–24 sec: the language "Checkout opened is not paid" appears beside a test-labeled buyer path.
- 24–42 sec: show permitted, real source-derived checkpoints: buyer approves → existing processor checkout → authoritative settlement boundary → governed fulfillment, visually synchronized with music rather than fighting it.
- 42–55 sec: headline "Know when a customer paid. Know what happens next." Then the exact bounded $750 offer, scope and human approval link only after canary verification.
- 55–60 sec: Evercraft mark plus one clear next step. Avoid artificial timers, manufactured scarcity and fake testimonials.
Fragments: 9:16 pain hook, square proof moment, 4:5 scoped buyer explanation. Each needs independent factual 10/10 editorial preflight, rights-clean audio, actual publication receipt.

## Three controlled experiments
A. **Message relevance:** Existing technical title vs the buyer-problem-first copy on approved offers. Primary metric: eligible real human qualified checkout starts / qualified offer visitors. Guardrails: bounce reason, device, traffic source, no increase in mistaken expectations.
B. **Confidence:** At the same checkout-ready page, test an inline two-sentence deliverable/scope block vs a collapsed detail *only after #1352 visual parity*. Primary: valid authorized checkout sessions per consented form start, not clicks alone.
C. **Proof before ask:** In one approved distribution channel, technical feature-first creative vs authentic human problem + test-labeled evidence. Primary: qualified inbound or verified offer-view intent; provider-confirmed revenue and shipping as lagging outcomes.

Randomize or assign deliberately, timestamp cohorts, deduplicate visitors, exclude bots, preserve consent. Pre-register primary metric; do not declare a winner from a few anecdotes or compare unequal audiences. No automatic variant rotation on a production payment page without approved experiment gate.

## Instrumentation: observed stages and non-fabricated denominators
`source_seen` (human/crawler/unknown) → `qualified_offer_view` → `form_started` → `consent_confirmed` → `checkout_session_created` → `provider_paid_verified` → `entitlement_issued` → `shipment_delivered` → `refund/dispute`.
For each, store stable campaign, offer_key, URL/version, cohort/device, occurred_at, evidentiary source and consent/identity boundaries. No raw payment instruments, email leakage or unauthorized cross-app joins. Distinguish missing measurement from zero. Reconcile provider-paid/refunds against source records and record unknown attribution as unknown. Compute funnel conversion only when numerator/denominator have compatible scope and event coverage.

## Systemia boardroom / specialist review packet
**Request, not fake execution:** have Marketing/Brand, Behavioral Research, Sales, UX/Accessibility, Pricing/Finance, Editorial/Graphics, Payments/Raven, Security/Legal, Attribution, and skeptical independent QA challenge this candidate. This commit does **not** report actual multi-agent boardroom deliberation or AI model votes; existing Boardroom transport/worker canaries must prove that before claiming participation.
**Challenge questions:** Does the first sentence identify a real buying moment? Does it misuse emotion or pressure? Is any promised result unverified? Is the offer appropriate for this channel? Can the mobile buyer find the price/form/button? Does the product-specific rail open reliably? Is settlement still guarded? Who owns support and delivery?
**Release gates:** (1) preserve current seller routes; (2) source test + CI; (3) independent 390px mobile screenshot/usability; (4) authorization/Systemia admission and dedup; (5) production deploy receipt and exact route canary; (6) no-charge provider checkout verification; (7) only separate user-authorized paid test establishes payment and shipping truth; (8) post only after editorial signoff and actual platform receipt.
**Decision needed:** prioritize $750 Payments founding pilot creative and exact canary if its permissioned fulfillment is ready, otherwise publish verified evidence/discovery content with clearly non-transactional next step while checkout remains held.

## Honest outcome statement
This branch changes human-facing words and adds tests. It does not deploy, invoke a live AI Boardroom, create a checkout, collect money, run ads, contact prospects or establish a real buyer's conversion. Those require recorded Systemia and external receipts.

## Live Fabric discovery smoke check (read-only connector, October 17)
These are observed capability-matching results, not sales or production-page tests.
- Buyer phrasing: "I need to connect an existing business checkout to verified paid order status and fulfillment controls for one offer." Top ranked Legacy Rescue Lab ($299), then Raven Nexus Business Setup ($500), then Evercraft Network; Payments Founding Integration did **not** appear in the returned top 10. This is a **discovery/positioning gap** even though the separate human $750 offer exists in source. Do not silently route a customer to a different product.
- Buyer phrasing: "Website audit for $49: my website looks fine but customers are not converting and I need a bounded analysis." Systemia Website Audit ranked first with $49, `start_url_state=owned_offer_page_available` in returned catalog. Provider checkout and deliverable still require independent canaries.
- Buyer phrasing: "I need to install an agent tool into my software platform with proof of safety and bounded permissions." Governed Agent Action Layer and AI Capability Installation Package ranked first and second, but both are marked verification_required / discovery_only. Do not machine-quote or advertise these as already buyable.

**Next marketing+distribution engineering acceptance:** create a *scoped, human-reviewed* pain-phrase mapping for the exact Payments founding SKU, then read-only test the canonical matcher and authorized human offer URL. Do not infer exact offer match from semantically similar capabilities or bypass the public sell-state gate. Capture each test's intent, observed ranked candidates, offer identity, state, connector/deploy SHA and timestamp; fail if the rank points buyers at an unrelated SKU. Make no catalog changes until review with checkout #1303 and parity canary.

**CI follow-up:** Initial draft code contained an unescaped apostrophe in the IBM i headline, causing a syntax failure. Corrected in subsequent commit. Fabric Portfolio Checkout Rollout workflow #39092628956 passed and Fabric Payments Mobile Creative Review #39092628937 passed on corrected head; Forge general CI remained in progress at time of this record. No deployment.
