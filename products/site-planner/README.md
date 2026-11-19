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
