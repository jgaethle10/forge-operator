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

## RC06 | Permissioned merchant research controls (2026-11-04)

- The open PR remains a source-only engineering workbench. The last checked RC05 head completed all six GitHub workflows successfully. **New RC06 changes require their own checks.**
- Research documents [MERCHANT-DISCOVERY-01.md](MERCHANT-DISCOVERY-01.md) and [MERCHANT-DISCOVERY-02.md](MERCHANT-DISCOVERY-02.md) identify two independent wheel-service businesses using official public sites. These are candidate research subjects, not customers or confirmed needs.
- The pure `merchant-pilot-gate.mjs` now **rejects synthetic, sample, fixture, placeholder, fake and test evidence references**, including pilot-interest references. Operator-entered real-looking references are still only unverified claims; an independent human must inspect the actual source. It does not send messages, launch or bill.
- Before sending any business email, follow `systemia/operator-gates/README.md`: the exact recipient, subject and message body need explicit scoped human approval. No generic 'Push' or drafted copy is treated as approval to contact someone.
- The next genuine advancement must be a voluntary reply from a real merchant followed by source review, rather than more design controls or screenshots. Do not infer pilot opt-in from a public email address.

### RC06.1 | Existing Proof-First Sales engine reused

`proof-first-bridge.mjs` delegates to the canonical `systemia/proof-first-sales/engine.mjs`. Official source links can ground a **research hypothesis**, not a confirmed merchant pain or a customer relationship. The bridge currently hard-codes `proof_state:repo_only`; even a caller-provided fake proof URL or explicit-approval string cannot bypass the hold. Its preflight always has `send_authority:false`, `contact_permission:false` and `public_publish_permission:false`.

Required next evidence: (1) genuine Systemia admission and release authority, (2) an Evercraft-owned public HTTPS preview verified externally and linked to its exact build, (3) Interaction Ledger contact preflight and explicit opt-out checks, (4) approval bound to the actual recipient and message, and (5) a scoped one-use send permit. Merely having a Gmail **draft** or a business's published contact address authorizes none of these.

No public demo canary, permissioned retailer reply or payment receipt is available for this mission. Do not use the Proof-First Sales positive test fixtures as sales evidence.

## RC07 | Staged Evercraft-owned public route, **not deployed** (2026-11-09)

- Three reviewed, source-parity-checked HTML pages are now staged at `public/wheel-lab-preview/` **in this unmerged draft PR only**. This is a candidate for the first-party static application build. A repository file is not a live URL, and no hosted preview has been confirmed.
- The root `index.html` is the two-step launcher; `shopper.html` holds the existing vehicle concept preview; `merchant-desk.html` holds local-only CSV import and internal quote packet export.
- Staging adds `noindex,nofollow,noarchive` to all pages, plus the research/no-sale banner on the launcher. **Noindex is not access control.**
- `staged-preview.test.mjs` enforces byte-for-byte parity with the prototype-specific transformations, navigation to the correct neighboring files, no external in-app network mechanisms and no false fitment/payment claims.
- `.github/workflows/rockies-wheel-lab.yml` includes the staged route in trigger paths and uploads `wheel-lab-rc07-staged-route-review` as a ZIP **only after tests pass**. This is a review artifact, not a public deployment.
- [RELEASE-PREFLIGHT.md](RELEASE-PREFLIGHT.md) lists the exact Systemia admission, release approval, owned-host canary, merchant opt-in, privacy and settlement gates. Do not merge or publish this path until an exact signed release action is authorized; serving a research preview does not authorize actual sales.


## RC08 | FindMyPart local-interest handoff, no outbound integration (2026-11-09)

**Purpose:** Wheel Lab and FindMyPart remain distinct commercial identities. A shopper with a hard-to-find component may optionally mark sourcing research interest in Wheel Lab, but this does not turn the prototype into an order, an inquiry, or a claim that any illustrated wheel is available.

- Shopper preview adds an unchecked-by-default **Need help locating a hard-to-find component?** checkbox. Exported concept JSON includes findmypart_sourcing_interest_requested:true|false, findmypart_referral_sent:false, and findmypart_customer_contact_shared:false. Reset clears the checkbox. No identifiers are collected or transmitted.
- Merchant desk imports this field and retains it in the internal review packet with findmypart_handoff_state:"UNSENT_LOCAL_NOTE_ONLY". Forged claims of a referral/contact transfer or nonboolean intent are rejected; older RC01 packets remain compatible.
- **This is a local conversation note, NOT permission to contact the buyer or a paid FindMyPart service.** FindMyPart has a separate owned intake and checkout-release contract. It is not a live sourcing referral inside Wheel Lab.
- Do not activate a clickable cross-product referral until the exact FindMyPart HTTPS endpoint is independently reachable, its source/privacy status verified and the exact outbound URL approved. Any future link must not leak build parameters, contact details, VIN, cookies or quote packets.
- Systemia Proof-First Sales and Interaction Ledger remain the contact gate. Sourcing interest is not a consented FindMyPart inquiry, merchant validation, verified lead or payment receipt.

The open PR and branch remain under Systemia release hold even if CI passes.

## RC09 | Actionable, privacy-minimal FindMyPart note and read-only destination witness (2026-11-10)

Wheel Lab remains the shopper visualizer and merchant review desk; FindMyPart is a **separate** parts-research service. A shop can now click **Download FindMyPart research note** only after importing a shopper concept that explicitly requested optional sourcing help. The plain-text note contains the allowable illustrative wheel style, finish, diameter and paint preference plus verification reminders. It deliberately excludes the shop label, user-entered vehicle note, SKU, prices, buyer identity, contact information and any false inventory/fitment statements. It is **not sent or uploaded**. Reset disables the action again; forged claimed referrals, nonboolean consent and older legacy packets remain fail-closed/compatible as previously tested.

The dedicated Wheel Lab GitHub Actions workflow now includes an **independent, nonblocking read-only FindMyPart destination observation**. It reuses the canonical scripts/probe-findmypart-owned-launch.mjs GET-only source/hash/HTTPS/intake test and uploads a separate wheel-lab-findmypart-referral-readiness artifact (JSON and exit code). A green Wheel Lab source test or a green *probe job* does **not** mean the external URL is ready. Review the artifact's actual public_brand_frontage_verified and public_customer_intake_verified booleans, exit code and URL/content hashes. Any false, missing or stale observation keeps the referral held.

No direct-link referral is activated. A future referral requires independently verified public HTTPS destination, privacy review, explicit release/publishing authorization for the exact URL/asset and a voluntary click with **no query parameters or silent information transfer**. A separate purchase or authenticated form requires its own permissions, verified fulfillment and payment receipts. No customer/merchant order or sourcing result is claimed.

### RC09.1 | FindMyPart verified destination, staged passive link

On 2026-11-11 03:55:49 UTC the independent read-only GitHub Actions probe in run 42955868733 observed the owned FindMyPart origin. The artifact wheel-lab-findmypart-referral-readiness (ID 13827510478; ZIP SHA-256 2d6f5d91ef5481fae8506a645f74fbef21ebf3302ef41195993943ad7643c038) showed public_brand_frontage_verified:true and public_customer_intake_verified:true, probe_exit_code:0, and all six expected GET endpoints with 200 responses and matching source digests. The actual /findmypart/ page was still noindex. production_paid_checkout_verified:false and fulfillment_verified:false. This is independent evidence of route/GET-readiness, **not** proof of real buyer submission, charge, completed referral or operational uptime guarantees.

Following that result, the first-party public-preview candidate has been staged with a **user-clicked, secondary FindMyPart research link** on both shopper and merchant pages. This specific URL is https://fabric.systemiacommandcenters.com/findmypart/ with no query/hash, and HTML attributes target=_blank, rel=noopener noreferrer, referrerpolicy=no-referrer. No concept JSON, shop label, vehicle note, personal details, payment amount or auto-referral is sent. The offline source pages remain entirely standalone with no external links.

A pure, reviewed, fail-closed stage transform in findmypart-referral-stage.mjs produces the two staged source-parity expectations, while staged-preview.test.mjs requires exactly one allowed destination link and tests rejection of unknown stage files. Any change to destination/permission changes the release review. This link exists **only in unmerged PR source**, not the current live Wheel Lab site. The broader public Wheel Lab launch still requires canonical Systemia admission, publication approval for its exact asset/URL, live external canary, real merchant interest and appropriate privacy review.

## RC10 | Phone-friendly short concept code (2026-11-11)

A buyer no longer needs to understand JSON files to discuss a concept with a shop. Under the shopper's controls, **Copy short concept code** creates an 11-character appearance-only code such as **WL1-02000-2**, also shown on screen when clipboard access is unavailable. The code encodes only style, diameter, finish, car-paint appearance and the voluntary separate FindMyPart research-interest flag, with a one-digit typo-detection check. It contains **no email, VIN, name, shop, manufacturer fitment, SKU, price or customer identity**. Changing a control or sourcing-interest checkbox refreshes the displayed code.

In the merchant desk, enter that code into **Paste a short Wheel Lab code** and choose **Load concept**. The shop gets an unverified appearance preference, equivalent to the existing JSON import, and can still load an optional local inventory CSV and export an internal quote-review packet. An altered, unsupported or malformed code is rejected without replacing the prior accepted concept; no quote, contact, inventory claim, payment or referral occurs. Reset clears the code and imported concept. The original local JSON export/import remains supported.

Cross-product behavior is unchanged: the FindMyPart local research note requires the explicitly selected sourcing-interest flag, and the separately staged optional FindMyPart link remains user-clicked, exact-origin, no-referrer and withheld from live Wheel Lab deployment.

Technical limitations: the check digit catches many, not all, transcription errors; the concept code is neither a secure signature nor proof of merchant permission or fitment. The merchant must independently confirm every real part/vehicle detail. All formats remain an unverified illustrative prototype.

Regression coverage includes 600 allowed appearance/interest combinations decoded end-to-end against the exact shopper encoder, rejection of corrupted codes, fail-closed source flags, and staged source parity. Read the final GitHub Actions receipts for the exact commit before claiming CI green.
