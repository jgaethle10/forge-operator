# Wheel Lab RC02 | Rockies demand-to-proof experiment

**Status:** Nonproduction prototype, gated. This directory is a source-level proof, **not** a published product or an authorized sales workflow.

**Systemia mission:** `rockies-yakima-wheel-visualizer-demand-20261014`
**Intake:** Systemia Core `FounderDirectiveDraft`, state `awaiting_canonical_admission` at last verification on 2026-10-16. A private draft is not canonical admission, team dispatch, or production release.

## Evidence and proposition

A founder-supplied October 2026 screenshot of a public Yakima community discussion describes nostalgia and demand for an old Les Schwab car and wheel customization program. The observed screenshot showed 17 reactions and 4 comments. This is **one qualitative signal**, not multiple validated buyers and not proof of willingness to pay. Do not scrape commenters, infer permission to contact them, or repost the screenshot as an endorsement.

**Hypothesis:** Independent tire and wheel retailers might value a simple, mobile-first visual preview for converting browsing into shop-verified quotes. Competing consumer and B2B visualizer options exist. Test merchant demand before adopting pricing or building catalog integrations.

## What is implemented

- Standalone HTML, CSS and JavaScript, with original illustrative vector coupe.
- Reactive paint, wheel style, size, and finish controls.
- Hold-to-compare, reset, allowlisted URL state for same-device preview, clipboard-ready **multiline build specification** and concept quote JSON download. Offline file links are not shareable, so the copy action does not promise a transferable URL.
- RC02 regression suite (`wheel-lab-rc02.test.mjs`) verifies parseable inline JavaScript, offline-copy truth and commerce/fitment disclaimers. The dedicated read-only, path-scoped PR workflow is `.github/workflows/rockies-wheel-lab.yml`.
- Explicit fitment, catalog, inventory, price, shop-contact and payment disclaimers.
- No external services, accounts, lead collection, vehicle identification, merchant integration or checkout.

To view, open `index.html` locally in a browser. For source-contract tests, run `node --test prototypes/rockies-wheel-lab/rc01/*.test.mjs` at the repository root. Copy Build Summary outputs a human-readable, portable specification, **not** a file URL and not a submitted merchant quote.

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

RC02 local validation (2026-10-23): Chromium desktop 1280×800 and phone 390×844, four selectors, clipboard mock checked for human-readable specs, JSON quote export, reset, and zero JavaScript errors. Seven isolated regression cases passed locally in the expanded suite; GitHub Actions verdict must be checked separately. No real buyer, inventory, fitment, or contact implied.

## RC03 | Market evidence, not decorative features (2026-10-28)

- Added `demand-observation.mjs` with five Node tests: founder-provided screenshot becomes one identity-free **reported** observation using the already existing Rockies/Worldstate in-memory context model. Its source remains private and no canonical ingestion or mission admission occurs.
- Added `merchant-pilot-gate.mjs` with five Node tests: three independently permissioned merchant responses plus a distinct unmet workflow and explicit pilot evidence trigger only **human review**, never sales/release authority. Empty evidence remains blocked.
- Added [MERCHANT-PILOT.md](MERCHANT-PILOT.md): current competitor reality, candidate research list, gating decisions, and explicit stop conditions. The visualizer market is not novel, and this is **not** a validated paid product.
- The existing path-scoped, read-only workflow runs all `*.test.mjs` files in this directory. Evaluate actual Actions results separately rather than claiming local unit proof from a committed file.

## RC04 | Offline merchant quote desk (2026-10-28)

- Open `merchant-desk.html` in a browser to see a **separate operator-side** quote-workflow demonstration. The prior `index.html` remains the shopper-side appearance proof.
- Optional CSV import is local-only, bounded at 200 KB and 200 rows. Expected headers: `sku,name,finish,diameter,unit_price_usd`; prices must be positive USD decimal numbers, and SKU duplicates fail closed.
- Select a SKU, quantity, vehicle note and requested service. The view shows a merchandise-only subtotal and exports an `INTERNAL_DRAFT_UNVERIFIED` JSON review packet. It never sends a message or creates a quote, customer record, lead, invoice, checkout or order. Explicit flags retain `fitment_verified:false`, `price_verified:false`, `inventory_verified:false` and `payment_verified:false` even for uploaded CSVs.
- `merchant-desk.test.mjs` tests inline JavaScript parsing, quoted CSV fields, blocked spreadsheet formula prices and malformed/oversized catalogs, cent arithmetic, local import, unreleased packet state and no network request mechanisms.
- The isolated `rockies-wheel-lab.yml` workflow runs this suite along with RC01–RC03. Verified CI run: https://github.com/jgaethle10/forge-operator/actions/runs/40821971672 (**success** on commit `8b7d178a36479159216112856da9c7d1119147c4`). Subsequent commits need their own CI verification.
- This is still **research software**, not a hosted customer product or offer. No actual merchant consent or catalog license exists. A real shop-side integration must use Systemia admission, verified inventory and fitment, signed quote authorization and proper payment/delivery receipts.

## RC05 | One offline review journey (2026-10-30)

**Open review.html** (locally and from the same directory as index.html and merchant-desk.html). It presents two tabs: shopper design preview and merchant review desk. This is the experience for review, **not a publicly deployed or merchant-signed service**.

1. In **Shopper preview**, change the concept car's wheels and finish. Press **Export shop quote packet** to save wheel-lab-concept-quote.json. There are no accounts, vehicle records or customer identifiers.
2. Switch to **Merchant quote desk**. Under *Customer's concept*, select that JSON file. The merchant desk validates the RC01 schema, requires all source safety flags to remain false, and displays the customer's desired *appearance*.
3. The shop may optionally load its own local CSV and choose a merchandise SKU. **No automatic SKU mapping is made**, and the imported concept remains an unverified illustration.
4. Export the combined **internal draft**. It includes both the visual request and the separate operator-selected SKU, with fitment_verified:false, inventory_verified:false, price_verified:false, merchant_sku_matched_to_concept:false, and payment_verified:false. Only independent human shop review can establish an actual quote.

### How to hand off a demo for review without hosting

The read-only path-scoped .github/workflows/rockies-wheel-lab.yml runs all Node source-contract tests before assembling wheel-lab-rc05-offline-review as a GitHub Actions artifact with review.html, index.html, merchant-desk.html and this README. After a successful run, download the ZIP from that run, extract it preserving the shared folder structure, then open review.html. No npm install, account, API key or backend is needed.

The artifact expires after seven days. It is **not** an Evercraft-owned public URL or a production promotion. A publishable, customer-facing origin requires Systemia admission receipt, scope/permissions, owned hosting and release verification. No third-party hosting fallback is authorized.
