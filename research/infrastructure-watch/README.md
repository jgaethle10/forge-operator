# American Infrastructure Watch v0.9

**Status:** Working mobile-first static evidence explorer, 2025 local read-only bridge index/import tools, plus a **separate** official 2026 state/territory bridge-record count comparison. This is **not** an imported national bridge database, an emergency warning service, or a production deployment.

## What's new in 0.9

- Official **FHWA 2026** National Bridge Inventory summary: **624,939** records, compared with **624,193** in 2025. The net **+746** describes inventory record-count change, **not** new bridge construction, repairs, or safety changes.
- Searchable and sortable state/territory 2025 vs 2026 counts, embedded in the browser and available without a network connection.
- Guam marked **no submission** for both years, rather than being described as having no bridges.
- The existing 2025 individual-bridge search remains **2025-only**. **Never feed 2026 data to the 2025 ArcGIS parser**: FHWA warns that new SNBI specifications and temporary codes/null values apply in the 2026–2027 transition.
- Existing case-study, water, dam, electricity, funding and local-bridge sections retained. Reported poor conditions are distinct from active official emergency notices.

Official references:

- [FHWA 2026 download summary](https://www.fhwa.dot.gov/bridge/nbi/nbi_data_2026.cfm) (updated October 7, 2026)
- [FHWA 2025 download summary](https://www.fhwa.dot.gov/bridge/nbi/nbi_data_2025.cfm)
- [FHWA data limitations / SNBI transition](https://www.fhwa.dot.gov/bridge/nbi/nbi_data.cfm)

The files `fhwa_state_inventory_counts_2025_2026.csv` and `scripts/build_fhwa_vintage_counts.py` carry the comparison and a reproducible totals test. The counts were transcribed from official source tables, then validated against national totals. Differences can reflect updates to inventory membership and reporting and cannot be interpreted as risk trends.

## Open standalone interface

Open `index.html` in a browser. It includes the national illustrative map, 14 sourced starter case studies, historic summaries, and the 2026 state comparison. The 2025 individual-bridge local API section will state **Local index not connected** until an owned Python server is running with imported records.

## Import the *2025* individual bridge archive on an owned Linux node

Only run this on an internet-connected machine under Evercraft's control. Python 3.10+ standard library; no hosted database vendor.

```bash
python3 scripts/sync_fhwa_2025.py --out data --max-pages 2
python3 scripts/bridge_index.py build --data data --db data/aiw.sqlite
python3 scripts/bridge_index.py serve --db data/aiw.sqlite --root . --host 127.0.0.1 --port 8765
# Browser on that node: http://127.0.0.1:8765
```

For full historical 2025 coverage, stop the web service, resume with `python3 scripts/sync_fhwa_2025.py --out data --all`, rebuild index, and restart. The importer verifies the federal ArcGIS count before saying complete; rejects a source count change; writes progress to NDJSON; and the DB is atomically replaced on successful build. Do not treat a completed import as a live safety feed or a proof that each individual bridge record is independently audited.

`bash scripts/install_user_service.sh` only installs a user-level loopback service on the host where you run it. It does not import records or deploy public hosting, and is not claimed to have been installed on any Evercraft node.

## API, evidence and controls

- `GET /api/status`: historic source, record count, completeness and source hash.
- `GET /api/coverage`: counts only for the imported subset; incomplete indexes are marked partial.
- `GET /api/bridges?state=53&county=077&condition=P&limit=100`: 2025 bridge records for state/county.
- `GET /api/bridges?lat=46.6021&lon=-120.5059&radius_miles=25`: approximate 2025 nearby lookup, capped if too many candidates.
- `GET /api/counties?state=53`: subset-level county aggregates.

**Poor ≠ unsafe.** Historic load and access codes ≠ current closures. High-hazard potential for a dam ≠ imminent failure. Red requires a current, dated, authoritative warning. NBI should not be used to clear a route or assume unrestricted vehicle passage. No precise location is auto-collected.

## Validation

Run `python3 -m unittest discover -s tests -v`. A 390px-wide Chromium interaction test also verified 54 state/territory entries, Washington filtering, Guam's missing submissions, sort order, offline map, and local-API fallback via an in-memory browser document. See `TEST_REPORT.md`.

## Remaining work

1. Import actual 2025 individual records into an Evercraft-owned machine and validate against a pinned official source snapshot. No full national import has been run here.
2. Build a separate, schema-reviewed **2026** importer for FHWA's new SNBI JSON/GeoJSON files. Do not automatically apply 2025 field names or risk classifications.
3. Deploy behind Evercraft-owned TLS/proxy, add source-refresh receipts, monitor failures and publish a real public URL only after live checks.
4. Link funding, agency ownership, remediation status, and contemporaneous warnings with dated primary sources before labeling any location as urgent.