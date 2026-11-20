# Evercraft Site Planner

An Evercraft-owned, mobile-responsive **preliminary EV/infrastructure site planning intake and evidence workflow**, implemented with HTML/CSS/JavaScript and Python standard library plus SQLite. **Not engineering design software.** No map, satellite imagery, geocoding, hydrology, utility, permitting, payment, AI or engineering integration is fabricated.

## Start

Requires Python 3.11+ and no third-party packages.

```bash
python3 server.py
# Open http://127.0.0.1:8808
```

Local data is in `data/site-planner.sqlite3`; uploaded files in `data/uploads/`. Backup both together. Set `EVERCRAFT_SITE_DATA` to select a durable directory. For LAN/proxy binding set `EVERCRAFT_SITE_HOST=0.0.0.0` **and** `EVERCRAFT_SITE_TOKEN` with a long random secret. For production, add owned reverse-proxy TLS, authenticated user sessions/roles, access-controlled uploads, antivirus scanning, limits, auditing and backups. The browser does not currently support bearer-token login UI: do **not** expose it publicly as-is. Behind an owned private access gateway with a secured upstream bearer header is a possible future integration, but not included.

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

**Site Planner does not have an approved Stripe/Payments checkout offer.** The
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
