# Evercraft Site Planner

An Evercraft-owned, mobile-responsive **preliminary EV/infrastructure site planning intake and evidence workflow**, implemented with HTML/CSS/JavaScript and Python standard library plus SQLite. **Not engineering design software.** No map, satellite imagery, geocoding, hydrology, utility, permitting, payment, AI or engineering integration is fabricated.

## Start

Requires Python 3.11+ and no third-party packages.

```bash
python3 server.py
# Open http://127.0.0.1:8808
```

Local data is in `data/site-planner.sqlite3`; uploaded files in `data/uploads/`. Backup both together. Set `EVERCRAFT_SITE_DATA` to select a durable directory. Non-loopback network binding is rejected in this version, including with a shared bearer token. Do not expose this private operator workspace via port forwarding or a public reverse proxy. For production, add owned reverse-proxy TLS, authenticated user sessions/roles, access-controlled uploads, antivirus scanning, limits, auditing and backups. The browser does not currently support bearer-token login UI: do **not** expose it publicly as-is. Behind an owned private access gateway with a secured upstream bearer header is a possible future integration, but not included.

## Workflow

1. Create an address-based site record (user-entered address, not automatically geocoded/verified).
2. Record evidence with explicit **verified**, **unverified**, or **assumption** state; upload source files, record dates and constraints.
3. Review parking, driveways, pavement, circulation, islands, chargers, ADA, pads, trenches, utilities, topo, drainage and floodplain in dedicated views.
4. Compare several *assumption-based* candidate layouts, counts and budgets.
5. Record a preliminary qualification disposition with missing critical evidence explicitly shown.
6. Request a preliminary plan by selecting a scenario. Request **automatically creates an immutable origin report snapshot**, then binds order → report → site and scenario.
7. Register an engineer-returned plan with an uploaded document. Each plan inherits its order's exact report ID.
8. Download original report JSON. Log workflow/product/data gaps per site.

## Intentional gaps / deployment gates

- No actual parcel matching, aerial imagery or map annotation. Site geometry is evidence-logged, not spatially drawn.
- No verified parcel boundary, ADA dimensional audit, utility locate, topo survey, flood mapping, drainage engineering or code compliance.
- No payment/order checkout. Internal queue requests are not paid commercial orders.
- No role-based engineering approvals, external share links, webhook notifications, Systemia orchestration or existing Evercraft report ingestion yet.
- No public hosting, infrastructure domain or GitHub commit performed by running locally.
- Report snapshot is point-in-time; evidence status changes afterward do not rewrite the origin report.
- App intentionally has no Base44 dependencies, CDN, analytics, or external runtime.

## Canonical migration

Commit the folder to an Evercraft-owned GitHub repository, then deploy to an Evercraft-controlled server. Wire authenticated event delivery to Systemia with durable outbox, retries, provenance and signing. Attach main-report and payment order IDs only after the real upstream contracts are verified. Keep returned deliverables linked to the immutable source report and origin site.

## Verified engineering pass (2026-11-19)

Run the integration test suite with:

```bash
python3 -m unittest discover -s . -p 'test_*.py' -v
```

The tests create two independent sites and exercise evidence, scenario, plan ordering, immutable report generation, report JSON export, returned-plan binding and rejection of cross-site plan insertion. A report export serialization bug was fixed during this pass. The tests do not constitute a public-security or geospatial accuracy audit.

GitHub canonical integration contract committed on `feature/evercraft-site-planner-intake-v1` at `products/site-planner/INTEGRATION.md` (commit `b59681160a389b1217285650eb39d58039104e7b`). **The full application source has not yet been committed to GitHub**, and the Systemia adapter is not live. Keep this package private until the documented deployment gates pass.

## Durable local Systemia handoff (engineering pass 2)

The application now inserts `site.report.created.v1`, `site.plan.requested.v1`, and `site.plan.registered.v1` events into a SQLite **outbox in the same transaction** as the corresponding records. Inspect event metadata locally at `GET /api/outbox`. Events remain `pending`: this version deliberately does **not** authenticate to Systemia, dispatch events, create engineering jobs, or infer payment completion. SHA-256 is an integrity checksum, not an authenticated signature.

Canonical documentation: `products/site-planner/OUTBOX.md` on the isolated GitHub feature branch, commit `e9eb0d6be36701815ac820a268a2089c95af2481`. Full application source is still packaged separately pending canonical source upload.


## Validation hardening (2026-11-19)

The server now rejects negative/fractional charger counts, non-finite/negative power or cost and invalid content lengths. Additional integration tests verify that rejected cross-site orders leave no report or order behind, and changing the site after snapshot creation does not change the snapshot. Run `python3 -m unittest discover -v` before deploying. This remains a local engineering build: no signed Systemia dispatcher, external address verification, customer login, licensed design verification, payment settlement or published deployment.

## Engineering queue workflow (local v1.3)

The owned API now exposes `GET /api/engineering/queue` (all orders) and
`PUT /api/sites/{site_id}/orders/{order_id}/status` with JSON `{ "status":
"assigned", "actor": "Operator", "reason": "Reviewed intake evidence" }`.
Allowed transitions are `queued → assigned → in_review → returned → approved`,
with explicit revision and cancellation branches. Illegal transitions,
missing actor/reason, and cross-site updates are rejected. Each transition
creates an append-only `engineering_actions` row and a pending
`site.plan.status_changed.v1` event in the same SQLite transaction. These
statuses are **operator-recorded**, not independent proof of professional
approval, Systemia delivery, payment or real engineering completion. The
local interface includes a status form in Engineering queue.

The event auditor verifies status changes against the action ledger and
report lineage. A new regression test exercises allowed, rejected, and
cross-site transitions. Authentication is still a shared local token option;
**do not expose any of these status controls on the public internet** until
per-user roles and engineering authorization are in place.

## v1.3.1 verification and GitHub handoff (2026-11-19)

The local package has an HTTP regression test for evidence-file upload/download, report snapshot traceability, cross-site plan rejection, and unauthorized state-skip rejection. `test_api_workflow.py` supplements the engineering state machine tests. SQLite connections close deterministically after success or failure. As of this build, `python3 -m unittest discover -v` passes 10 local tests.

Canonical review: https://github.com/jgaethle10/forge-operator/pull/2281 (DRAFT; **not deployed**). The GitHub branch includes server, responsive interface, pending Systemia event outbox, audit, tests, and CI checks. The larger local package interface has more dedicated evidence-condition views than the GitHub interface; they remain intentionally distinguished until full source parity is proven. The latest GitHub UI supports evidence and plan uploads; storage remains unsuitable for untrusted public users until per-user authorization, file scanning, durable backup and safe download review are completed.

Public access, real Systemia delivery, payments, source imagery, engineering approval, and existing external EV report linkage are NOT verified or enabled.

## v1.4: Existing Evercraft report → preliminary plan provenance

This version includes a **private read-only import** for an existing Forge/Yard EV
opportunity report. The upstream owned gateway contract was inspected in
`systemia/rivet/http-gateway.mjs`: `GET /api/rivet/reports/:reportId` returns
`evercraft.rivet.yard-report-record.v1`, a ready report, report/source hashes,
and source coverage receipts. The Site Planner **does not create a new paid
report** or infer payment status from report readiness.

To enable the import on a trusted local machine:

```sh
# The report gateway must already be running on the same device or a
# separately authorized loopback tunnel to Evercraft-owned Forge/Yard.
export EVERCRAFT_SITE_REPORT_GATEWAY_URL='http://127.0.0.1:<actual-gateway-port>'
export EVERCRAFT_SITE_REPORT_GATEWAY_TOKEN_FILE="$HOME/.config/evercraft/site-planner/rivet-report-gateway.key"
# Create and protect the token file through your owned secret deployment process.
# Permissions must be 0600, token at least 16 bytes. Do not commit it.
python3 server.py
```

In the **Reports** tab, provide the existing `rivet-yard:<32-hex>` report ID.
Site Planner retrieves the record using the private Bearer token, checks its
schema, ready state, report/source SHA-256 **identifiers**, coverage receipts,
and requested-address match. These checks establish **gateway provenance**, not
independent cryptographic rehashing of the upstream report bytes, survey
accuracy, civil engineering compliance, or a settled customer transaction.

Imported records become site-scoped `source_reports` rows with an idempotent
`(site_id,external_report_id)` key. In **Engineering queue**, optionally select
that imported source report before requesting a plan. The local immutable report
snapshot stores the upstream report ID and both SHA-256 values; the order gets
an `order_source_links` record and a pending Systemia event with that lineage.
An imported report from another site or a now-changed site address is rejected.

Outbox events are not delivered to Systemia yet. Direct customer checkout,
settlement verification, plan engineering, customer login/roles, content scanning,
and secure sharing remain blocked pending their separate integration gates. No
public deployment is authorized by this source import.

Tests:
```sh
python3 -m unittest discover -v
# Expected local package: 13 tests (10 earlier + 2 upstream bridge checks + 1 server smoke test)
```

## v1.5 commercial quote safety gate

**Site Planner has a dedicated provisional Stripe product and inactive payment link, but still does not have an approved/active checkout or verified payment-to-fulfillment bridge.** The
canonical `public/mesh/checkout-ready/verified-links.json` lists seven other
products; none is a Site Planner preliminary plan. Do not reuse those products'
checkout receipts to claim this product is paid.

A browser-created preliminary plan request now defaults to
`order_kind="commercial_quote"`. The request creates an immutable report
snapshot, an order with `queued` status, and an `order_controls` record:
`payment_state="checkout_unconfigured"`, `fulfillment_release_state="held"`.
The outbox records both `site.plan.requested.v1` and
`site.plan.commercial_hold.v1`. An attempted transition into assignment/review
or registration of a returned plan is rejected on the **server**, regardless
of any untrusted fields such as `payment_status`, `paid`, `checkout_session`,
or `provider_receipt_ref` sent in the request.

Explicit `order_kind="internal_planning"` is a local QA/operator lane only.
It does not represent a paid sale, a customer entitlement, certified
engineering, or actual Systemia dispatch. The current local workspace has no
per-user authorization or approved public runtime. It MUST NOT be exposed to
untrusted clients, especially as the internal lane is selected by a plain
request field. Existing pre-v1.5 orders with no `order_controls` record are
**unclassified and held** for engineering transitions and returned plans.

The `GET /api/commercial/readiness` endpoint reports that checkout, payment
verification, authenticated Systemia dispatch and customer sign-in are not
connected. No endpoint can mark a commercial quote paid or release it.

### Payment-to-engineering requirements before launch
1. Register a distinct approved Site Planner product/price and a real checkout
   in Evercraft Payments. Do not infer success from user-supplied URLs or redirects.
2. Correlate the exact provider-verified payment to the right Site Planner
   order using account/offer/amount/currency IDs and durable private receipts.
3. Explicitly approve customer scope and available engineering capacity, with
   audited roles, before authorizing commercial work.
4. Hold/reverse promptly for chargebacks/refunds and maintain idempotent state.
5. Deliver assignments through a signed Systemia outbox worker with acknowledgments;
   without an authenticated receipt, leave events `pending`.
6. Add user identity, tenant/site permissions, upload content inspection and
   signed expiring customer report access before public deployment.

Run the full suite: `python3 -m unittest discover -v`.

### Network exposure hard stop

v1.5 explicitly rejects any non-loopback bind, even when a shared bearer token
is configured. The authentication model is not customer-ready. This is not a
substitute for real tenancy, permissions, CSRF controls, secure upload
processing or signed customer shares. Do not place it behind a public reverse
proxy or port-forward its loopback listener.

## v1.6: Separate live Stripe catalog entries, checkout held

On Evercraft LLC's **live** Stripe account, the dedicated founding-pilot objects were created and independently read back:

- Product: `prod_Vf1uyMq3FiZRfB` (inactive).
- One-time price: `price_1Udhqa5rgRECaZMDsK7sstdv` ($499 USD, provisional).
- Payment link: `plink_1UdhsM5rgRECaZMDczQW5JTr` (inactive).
- Product key: `evercraft-site-planner-concept-pilot-v1`.
- Product scope: one property, evidence-labeled non-stamped EV charger site concept and PDF, one revision after scope acceptance; no certified engineering or permits.
- Managed Payments explicitly disabled for this bespoke service link; automatic tax was also disabled. **Obtain the correct tax classification/collection setup before activation.**

The ID-only `stripe_pilot.json` is a **read-only recorded snapshot** of Stripe objects. It carries no credentials and does not prove current link state, a customer payment, a webhook event, or a released job. The local readiness API displays this as a prepared catalog with an INACTIVE checkout and keeps `checkout_configured=false`, `payment_verification_connected=false`, and `commercial_release_allowed=false`.

Do not enable the link or share it for paid intake until the pilot price/scope, tax, identity, authorized customer data, private Stripe provider-receipt verification, refunds, scope/capacity approvals, and signed Systemia dispatch are implemented and tested. The link was created separately, not by editing seven other offers.

## v1.7 founding five price experiment (both checkout links inactive)

Evercraft LLC live Stripe catalog, independently verified:
- Founding Five: **$349 USD**, price `price_1UdiIw5rgRECaZMDDUwbMux8`, link `plink_1UdiJV5rgRECaZMD3URffDU5` (inactive), maximum **five completed Checkout Sessions**. This does not guarantee five distinct customers.
- Standard: **$499 USD**, price `price_1Udhqa5rgRECaZMDsK7sstdv`, link `plink_1UdhsM5rgRECaZMDczQW5JTr` (inactive).
- Both prices share `prod_Vf1uyMq3FiZRfB` (inactive) and the same limited, non-stamped single-property concept-plan scope.
- Founding Five is a provisional price test: keep both links inactive pending tax review, owner-approved scope, private provider-verified settlement handling, customer authentication and Systemia receipts.

`stripe_pilot.json` stores only non-secret identity and last-checked status. It is **not a Stripe webhook, authenticated account lookup, payment receipt, or fulfillment entitlement**. `GET /api/commercial/readiness` presents the recorded prices while keeping `checkout_configured=false`, `payment_verification_connected=false`, `commercial_release_allowed=false`.

## v1.8: buyer-facing illustrative concept sample

`sample.html` is a responsive, original, **entirely fictional** two-page illustrative EV charging site concept and evidence register. It showcases four hypothetical Level 2 stalls, one circulation idea, a possible equipment pad and trench route, and the unresolved requirements for field/engineering confirmation. It uses no real parcel, customer data, map, aerial imagery, geocoding or external services.

The existing local-only server serves this at `GET /sample` and `GET /sample.html`, with the **same optional bearer-token gate** as the operator UI. The workspace links to the sample. The sample is read-only, requires no Site Planner DB record, and its print stylesheet supports **Print / Save PDF** in a browser. For developer-independent review, an equivalent two-page PDF snapshot can be generated from this HTML; the authored HTML remains the canonical source.

`test_sample.py` checks access control, content markers, anti-framing headers, zero Stripe checkout links, and the absence of mutations to sites, orders and Systemia outbox. Full test command: `python3 -m unittest discover -v`.

**Release boundary:** Illustrative sample quality does not establish site-specific feasibility, licensed engineering, automated concept generation or production readiness. Live Stripe links remain inactive, and commercial orders cannot be dispatched.

## v1.9 Kennedy-style owned drawing studio

The earlier illustrated concept sample was **below the standard of the prior Kennedy Space Station drawing sheets**. The new source file `plan-studio.html` is an Evercraft-owned, standalone browser drafting tool available at `/plan-studio.html` on the local operator server. It does NOT contact Base44, a mapping API, or any remote system.

Capabilities currently implemented:
- Source-selected site aerial and area-context PNG/JPG/WebP files, up to 12 MB each, held in browser memory only (not uploaded to the backend).
- Interactive tap-to-place charger stalls, EV equipment pads, access arrows, annotations, two-point conduit routes; rotation control, erase, undo, and reset.
- Professional 17×11 landscape sheet layouts: **S-01 charging concept** and **A-01 vicinity/context**, with engineering-style notes, title blocks, revisions and source labels.
- Print / Save PDF from the browser and export the two vector SVG sheets.
- SHA-256 byte fingerprints where browser crypto is available. **A byte hash does not verify aerial rights, coordinates, dimensions, ownership or engineering correctness.**
- A source-free synthetic drawing is supplied for exploration. **When a real site aerial is loaded, all existing demo marks are cleared** so they cannot be mistaken for genuine site placements. Missing vicinity imagery is marked as missing rather than invented.

This is a **manual pre-engineering illustration tool**, not an automated parcel analysis. There is no survey control, georeferencing, authoritative site location, certified scale, traffic model, clearance check, electrical study, ADA compliance approval, utility plan, stamped drawing, or public deployment. Users must supply authorized images and have an appropriately qualified reviewer inspect all output before any client reliance. Do not use this to claim a verified plan based on its appearance. Existing commercial quote and Stripe payment holds remain unchanged.

`test_plan_studio.py` exercises the protected HTTP route, non-mutating sample access, JavaScript editing and undo, conduit placement, supplied aerial display and automatic clearing of sample marks. Run `python3 -m unittest discover -v` locally.

## v2.0: source-bound reference calibration and evidence export

The owned Kennedy studio now provides **📏 Reference** measurement: enter a genuine known distance (feet) visible in the uploaded **site** image, then tap two endpoints. The operator-entered reference establishes a provisional on-screen image-plane conversion, **not surveyed scale, georeferencing, or geographic coordinates**. Reference clicks are refused without a real uploaded aerial, with missing/invalid distances, or with too-short baselines. Calibrated proposed conduit route lengths are marked as estimates.

The tool exports `Evercraft-Site-Concept-Evidence.json` with source filenames and byte SHA-256 hashes (when browser-supported), image-plane calibration endpoints/known feet, conceptual marks, approximate route lengths and explicit verification limits. It deliberately excludes raw image bytes and cannot prove the images' locations, rights, dimensions or correctness. Users must retain authorized originals for review.

Replacing the site aerial clears all overlays and measurements to prevent cross-property carryover; switching tools cancels an unfinished calibration. The editor remains **private and local**; no customer-facing claims of engineering validity, sales, paid orders or Systemia dispatch. See `CALIBRATION.md` for limitations and tests.

`test_calibration.py` adds a Node VM regression test. The complete local v2.0 suite contains 22 tests.

## v2.1: offline, source-bound project save and restore

The Kennedy editor has **Save editable project** and **Restore project JSON** controls. The saved JSON contains project labels, conceptual placements and optional operator reference calibration. It intentionally excludes aerial image pixels, payment data and customer entitlements.

To reopen a draft, first upload **the same original site image and vicinity image**. The editor requires SHA-256 fingerprints of those files and validates them against the draft; file names alone are not proof. Restoration is refused when the source bytes, context imagery, reference baseline, placement geometry or status flags are incompatible. Rejected files cannot change the active drawing.

Drafts are plain, human-inspectable JSON with a fixed schema and limits on marks and file size. They are **not** encrypted, electronically signed, cloud-synchronized, georeferenced, verified surveying documents or guaranteed recoverable backups. Keep source imagery and saved JSON privately, and do not include confidential site data in public issue attachments. No remote tracking, Base44 runtime, or automatic field approvals are used.

The standalone editor loads `plan-drafts.js` relative to `plan-studio.html`; the private loopback server serves the script from `/plan-drafts.js` behind the same operator authorization check. The `test_plan_drafts.py` regression tests verify the private route, successful round-trip, source mismatch, malformed placement, tampered certification, reference recalibration and no partial writes.

The local v2.1 suite has **24 passing tests**. Site Planner commercial orders remain held, and neither Stripe checkout link is enabled.

## v2.2 simple-first Kennedy workflow

**The default UI is deliberately three actions:** (1) upload an authorized overhead site photo and optionally enter its address, (2) tap the site sheet to place conceptual chargers, and (3) use **View / Save PDF**. This is a manual drawing experience; entering an address alone does **not** fetch imagery or generate a verified plan.

Technical controls are still preserved in a **collapsed More tools & project details** section. These include the separate vicinity image, project metadata, equipment pads, conduit routes, access notes, erase, image reference calibration, advanced exports and source-fingerprint-bound save/restore. A simple customer should not be required to learn any of these before seeing a usable concept.

On phones, the diagram remains large enough for tapping and can be swiped horizontally rather than becoming an unreadable thumbnail. The PDF/print path still contains both engineering-style sheets. Real photo upload clears all fictional demo placements and resets calibration; if the site name is the unchanged demonstration placeholder it becomes an explicit operator-review concept. All outputs remain **not for construction**.

`test_simple_ui.py` locks the three visible steps, verifies expert controls stay collapsed but available, and compiles the inline browser code. Run `python3 -m unittest discover -v`. This is a **UX simplification**, not an automated aerial fetch, engineering review, customer login or production deployment. The commercial order hold remains in place.

## v2.3 federal aerial lookup (screening-only)

The default three-step Kennedy workflow has **Find public aerial** inside step 1, with manual upload still available. Enter a complete mainland-U.S. street address. The private local server asks the U.S. Census address-range geocoder for an unambiguous match and then obtains site/vicinity previews from **USGS The National Map imagery** through fixed HTTPS endpoints. These are government data sources, not third-party application runtimes.

The browser gets source-labeled JPEGs and byte SHA-256 fingerprints. Their display **does not prove** the parcel, aerial date, property boundary, utilities, rights-of-way, charger clearance, or engineering feasibility. Public aerials may be too old or too coarse for detailed stall layout. The UI clearly labels address and image uncertainty. Operators can keep the original JPGs alongside their editable drafts.

Both lookup paths reject ambiguous or unavailable sources **without changing the active drawing**. A new real site photo clears all previous overlay marks, reference measurements and the **old vicinity photo** to prevent cross-site contamination. Requests use the existing loopback-only authenticated endpoint; results are ephemeral, non-persistent, and do not create orders, outbox events or transactions.

The browser now permits local `data:` imagery under a narrowly scoped image Content Security Policy. No arbitrary URL fetching, unknown third-party API, address tracking, public hosting, or hosted checkout has been enabled.

`test_aerial_sources.py` and `test_aerial_ui.py` test the federal-source client and the private browser flow using fake providers. **Real provider connectivity from the Evercraft operator host still requires live acceptance.** See [FEDERAL-IMAGERY.md](./FEDERAL-IMAGERY.md) for provider contracts, privacy and verification boundaries.

## v2.4 live federal evidence and automatic *screening* scale

The actual Census plus USGS two-image workflow was successfully exercised in GitHub Actions on **2026-11-20** using a public Census test address. Two JPEG sources were received and SHA-256 fingerprints recorded. See [LIVE-FEDERAL-ACCEPTANCE-2026-11-20.md](./LIVE-FEDERAL-ACCEPTANCE-2026-11-20.md). This test was run on GitHub's network, **not Penguin or NextGen**; Evercraft-host reachability and individual site-quality review remain open gates. The live diagnostic is now opt-in instead of running on every PR update.

The Kennedy editor computes an **approximate source-image screening conversion** from the USGS EPSG:3857 site bbox and matched latitude. This lets the operator see provisional conduit-route lengths immediately after address lookup, without navigating advanced measurement controls. At this point the numbers are **Web Mercator ground-distance approximations**, not surveyed or certified geometry, parking dimensions, utility measurements, or legal parcel boundaries. A manually entered, source-supported reference overrides this screening conversion where available; no guessed distances are accepted for manual calibration.

A changed address now invalidates both previously loaded government aerials and their estimated scale, preventing the user from silently relabeling another parcel's drawing. Changing a manually uploaded image likewise clears the old government scale. Draft JSON does not preserve independently verified imagery geolocation, and the source images still need to be retained privately.

The provider's published imagery metadata describes USGS/NAIP imagery which may date back many years, including NAIP collections from 2017–2021 in the conterminous U.S. Never treat a recent API response as proof of current site conditions.

The local-only app is not public, cannot issue approvals, and keeps the $349/$499 Stripe links inactive. Run `python3 -m unittest discover -v` for the complete safety regression suite.

## v2.5 quick charger adjustment and reliable undo

The **three-step** mobile-first editor remains the default. Inside step 2, a user can:
- Tap an empty space in the site drawing to add a charger.
- Tap an existing charger once to select it, then tap the desired new position to move it. No drag, pinch gesture, specialist CAD tool or dialog required.
- Tap **Undo** to cancel a selection or reverse the last addition, reposition, deletion or reset. Up to 50 past drawing snapshots are retained in browser memory.
- Continue using the advanced **Remove**, conduit and equipment-pad tools without learning additional entry screens.

The active-step message now appears immediately below the charger controls so the operator can see what the tap did on a phone. A newly uploaded site image, new address or successful federal aerial lookup clears stale placement history. Restoring a locally saved project starts a fresh undo history so old-property drawings cannot be resurrected.

`test_tap_to_edit.py` uses the actual browser JavaScript in an isolated Node VM to verify add/select/reposition/cancel/undo/erase/reset/history clearing. This is an ease-of-use improvement, **not** geospatial validation. The map source, parcel evidence, commercial holds and PDF accuracy limitations are unchanged.
