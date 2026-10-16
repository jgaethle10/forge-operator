# Wheel Lab RC01 | Rockies demand-to-proof experiment

**Status:** Nonproduction prototype, gated. This directory is a source-level proof, **not** a published product or an authorized sales workflow.

**Systemia mission:** `rockies-yakima-wheel-visualizer-demand-20261014`
**Intake:** Systemia Core `FounderDirectiveDraft`, state `awaiting_canonical_admission` at last verification on 2026-10-16. A private draft is not canonical admission, team dispatch, or production release.

## Evidence and proposition

A founder-supplied October 2026 screenshot of a public Yakima community discussion describes nostalgia and demand for an old Les Schwab car and wheel customization program. The observed screenshot showed 17 reactions and 4 comments. This is **one qualitative signal**, not multiple validated buyers and not proof of willingness to pay. Do not scrape commenters, infer permission to contact them, or repost the screenshot as an endorsement.

**Hypothesis:** Independent tire and wheel retailers might value a simple, mobile-first visual preview for converting browsing into shop-verified quotes. Competing consumer and B2B visualizer options exist. Test merchant demand before adopting pricing or building catalog integrations.

## What is implemented

- Standalone HTML, CSS and JavaScript, with original illustrative vector coupe.
- Reactive paint, wheel style, size, and finish controls.
- Hold-to-compare, reset, shareable allowlisted URL state, conceptual quote JSON download.
- Explicit fitment, catalog, inventory, price, shop-contact and payment disclaimers.
- No external services, accounts, lead collection, vehicle identification, merchant integration or checkout.

To view, open `index.html` locally in a browser. For static safety checks, use `node --test wheel-lab.test.mjs`.

Independent Playwright checks on 2026-10-16: Chromium desktop (1365x820) and mobile (390x844), UI selection and SVG repaint, concept quote download, safety flags, reset and zero observed page errors all **passed locally**. That does not attest public URL access or production readiness.

## Hard gates before a real pilot

1. Obtain Systemia admission receipt under the existing mission. Confirm dedup, capacity, ownership and authorized release gates.
2. Independently interview willing merchants, without contacting screenshot commenters automatically. Validate at least three distinct merchant needs, existing options, quote workflow and budget.
3. Confirm vehicle and wheel fit using reliable year/make/model and manufacturer specifications, including bolt pattern, center bore, offset, brake clearance, load and tire diameter. **Never translate visual appearance to mechanical fit.**
4. Inventory, SKU, pricing, merchant identity, asset licensing and quote recipients must be authoritative and independently checked. Preserve observed/modelled distinctions and audit receipts.
5. Reuse FindMyPart's documented partner and attribution patterns only after their contracts and authorization are verified. Evercraft Payments is the canonical payment authority; checkout creation is not payment proof. No charge or account should be created by this prototype.
6. Complete security, privacy, accessibility, mobile, visual-rights, and end-to-end fulfilment QA. Deploy only upon canonical release authorization.

## Nonclaims

No pilot shop has accepted, no customer bought anything, no fitting was verified, no public deployment was made, and no Systemia dispatch is demonstrated by this branch. The branch is a review surface to support governed admission and evaluation.
