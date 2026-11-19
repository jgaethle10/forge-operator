# Evercraft Site Planner

Self-hosted EV/infrastructure preliminary planning workspace. **No Base44 or third-party application runtime.**

## Status
The GitHub branch contains the Python server, responsive working interface, outbox integrity auditor, smoke test and integration specifications. The fuller local package also contains a more extensive interface, workflow tests, and an attachment UI. These are not yet a byte-for-byte source sync. **Do not treat this branch as production-ready or publicly deployed.**

## Start locally
Requires Python 3.11+; no additional Python packages:
```sh
cd products/site-planner
python3 server.py
# http://127.0.0.1:8808/
```
Set `EVERCRAFT_SITE_DATA` to select a private persistent data folder. The default is `./data` alongside the source. Back up the SQLite database and uploaded files together.

```sh
python3 -m unittest -v test_server_smoke.py test_outbox_audit.py
python3 outbox_audit.py data/site-planner.sqlite3
```
Run the auditor only after the SQLite database has been initialized by the server. It operates read-only.

## Customer workflow
Create a site with a real address; record aerial-visible and documentary findings as **verified**, **unverified**, or **assumption**; compare charger/equipment/circulation scenarios; generate an immutable report; request a preliminary plan, which snapshots its originating report; register the returned plan against the persisted order; inspect structured workflow gaps.

All submitted data is user-entered until independently verified. This is screening and evidence collection, **not stamped engineering or a verified geospatial analysis**. Plan orders are not payment confirmations.

## Technical boundaries
- `server.py` serves the same-origin UI and local API; binds `127.0.0.1:8808` by default.
- SQLite contains sites, evidence, scenarios, reports, orders, returned plans, gaps, and a pending event outbox.
- No Systemia dispatcher is running. Pending outbox events require a signed transport and receipts before state changes.
- `EVERCRAFT_SITE_TOKEN` adds an optional shared bearer-token check for API requests; **the current browser UI does not provide an authenticated sign-in flow**. It is suitable only for a trusted local operator, not public access.
- Uploaded files need malware scanning, content verification, tenancy checks, and private object storage before production.
- Payment verification, public report sharing, parcel/geocoding imagery, and external engineering tools are not integrated.

## Launch gates
1. Sync the complete richer local source and comprehensive workflow tests.
2. Confirm repository CI actually passes.
3. Implement identity, roles, per-site permissions, CSRF defenses, signed private shares, and secure file handling.
4. Connect canonical EV report identifiers and licensed geospatial source retrieval.
5. Connect Systemia authenticated event delivery, retries, idempotency and acknowledgments.
6. Connect Evercraft Payments order settlement receipts without equating queueing with paying.
7. Deploy on approved Evercraft-owned infrastructure, private first; perform mobile and security acceptance.

See `INTEGRATION.md` and `OUTBOX.md` for provenance and dispatch contracts.


## v1.4: private existing EV report integration

The upstream Forge/Yard endpoint is documented in `systemia/rivet/http-gateway.mjs`: `GET /api/rivet/reports/:reportId` returns a private `evercraft.rivet.yard-report-record.v1` with report/source SHA-256 identifiers, a source-coverage manifest, and readiness verification fields.

**Configure only on a trusted local Evercraft operator host**, with the existing gateway active:
```sh
export EVERCRAFT_SITE_REPORT_GATEWAY_URL='http://127.0.0.1:<actual-owned-gateway-port>'
export EVERCRAFT_SITE_REPORT_GATEWAY_TOKEN_FILE="$HOME/.config/evercraft/site-planner/rivet-report-gateway.key"
python3 server.py
```
Provision the token through Evercraft's private secret process. The file must be mode `0600` and contain a token of at least 16 bytes; never commit secrets to GitHub. The adapter refuses non-loopback origins and does not accept arbitrary user-provided URLs.

**Workflow:** Create a Site Planner project with the exact requested address. In Reports, import an existing `rivet-yard:<32 hex>` ID. The server fetches the private gateway record, checks the ID, schema, ready status, source/report hash identifiers, source-coverage attestation, and requested address. The import is idempotent per site. In Engineering, select that report to generate an internal immutable snapshot and order tied to its upstream ID and hashes. Invalid cross-site links and stale address associations are rejected. Source linkage is recorded in the pending outbox.

This establishes **gateway-attested provenance only**. The adapter does not independently rehash the upstream report byte stream, prove parcel or engineering facts, charge customers, verify payment, or dispatch work to Systemia. It does not create a new report. Real checkout, signed Systemia delivery, role-based access, upload hardening, and secure public sharing remain launch blockers.

Run `python3 -m unittest -v test_report_bridge.py` for the no-external-network integration proof.
