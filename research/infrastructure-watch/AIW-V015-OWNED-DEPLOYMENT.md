# American Infrastructure Watch v0.15: owned evidence service

**Status:** locally verified and ready for *review*. Not merged, not installed on Node001/Node002, not publicly deployed. The national 2026 inventory remains incomplete. The service carries historical 2026 FHWA inspection classifications, not live safety clearance or emergency alerts.

## New capability

The existing v0.14 Pacific Northwest atlas remains unchanged and works offline. v0.15 adds an **independent, read-only Python/SQLite service** for more than 21,000 bridges with source lineage, exact condition and county counts, stable pagination, text search and scoped access. No paid server or outside database is required.

The backend is constructed from the SHA-256-pinned v0.14 HTML source asset, which itself was prepared from three reconciled official FHWA state files. It is a derived indexed snapshot, **not a new federal download or an independent 2026 source refresh**. Original raw-source SHA-256 receipts remain in the index metadata.

## Verified coverage

| State | Original raw records | Good | Fair | Poor | N/unclassified |
|---|---:|---:|---:|---:|---:|
| Washington | 8,619 | 4,298 | 3,918 | 403 | 0 |
| Idaho | 4,645 | 1,644 | 2,753 | 248 | 0 |
| Oregon | 8,326 | 2,470 | 5,426 | 429 | 1 |
| Total | 21,590 | 8,412 | 12,097 | 1,080 | 1 |

Washington's BL02 county fields reconcile to **8,060 assigned** and **559 unassigned**. Yakima County code 077 contains **531** total records and **27** Poor-condition reports. Oregon's N-coded record `000013570-00286` remains unclassified, never a warning.

## Install on an owned Linux machine after review

From the checked-out Evercraft repository branch, with Python 3.11+ and **no pip dependencies**:

```bash
python3 research/infrastructure-watch/engineering/aiw_index_service.py build \
  --source public/infrastructure-watch/pnw-2026.html \
  --db /path/to/owned/aiw/bridges2026.sqlite

python3 research/infrastructure-watch/engineering/aiw_index_service.py audit \
  --db /path/to/owned/aiw/bridges2026.sqlite

python3 research/infrastructure-watch/engineering/aiw_index_service.py serve \
  --db /path/to/owned/aiw/bridges2026.sqlite \
  --html public/infrastructure-watch/pnw-2026.html \
  --host 127.0.0.1 --port 8786
```

Use a dedicated non-root service account and a protected database path. **Bind to loopback only** until a separately reviewed HTTPS reverse-proxy route, logging policy, and rollback procedure have passed. This example **does not configure or change Caddy, DNS, GitHub production, or any existing services**. Don't run it over an existing service or port without checking conflicts.

Run these smoke checks from the machine where the service is listening:

```bash
curl -fsS http://127.0.0.1:8786/healthz
curl -fsS http://127.0.0.1:8786/api/v1/coverage
curl -fsS 'http://127.0.0.1:8786/api/v1/bridges?state=WA&county=077&condition=P&limit=5'
curl -fsS 'http://127.0.0.1:8786/api/v1/bridges?state=OR&condition=N'
```

The Yakima County `total_matching` must be **27**; the Oregon N filter must return **1**. Metadata must say `national_import_complete=false`, `last_live_emergency_check=null`, and `repair_funding_coverage=not_linked`.

## HTTP endpoints (read-only)

- `GET /` and `GET /atlas` serve the unchanged offline atlas; `?county=077` and `?state=ID` remain usable deep links.
- `GET /healthz` provides service health and coverage-limited status.
- `GET /api/v1/coverage` reports asset provenance, source hashes, counts, date and explicit limits.
- `GET /api/v1/bridges?state=WA&county=077&condition=P&limit=50&offset=0` lists source-linked bridge records (max page size 250).
- `GET /api/v1/bridge?state=OR&id=000013570-00286` retrieves a single record.

Unsupported writes return HTTP 405. Invalid filters return 400. No API includes an inferred emergency alert. `current_imminent_danger_verified=null` means **not assessed**, not safe. All records are *historical observations*.

## Evidence and release gates

1. SHA-256 of pinned `pnw-2026.html` must match `c29c079d04817f85657fa3e8f7c7ea0b83d6809f5ed2dfb09b592f1e430ed8f4` or import fails. Never silently accept changed files.
2. The importer must match all raw state-condition counts, retain Oregon's N record, exclude four previously flagged implausible coordinates from plotting, and reconcile Yakima/unassigned county totals.
3. SQLite database builds are atomic: a failed rebuild cannot overwrite an existing valid index.
4. Hosted UI must identify the 2026 snapshot vintage, verify the public HTTPS endpoint separately, and must not claim nationwide completion, current route clearance, funding linkage or imminent danger monitoring.
5. Production merge/deployment remain separate review gates. Do **not** take down or replace Evercraft's existing Journal, Systemia, Worlds, or unrelated services.

## Source links

- 2026 state files: https://www.fhwa.dot.gov/bridge/nbi/nbi_data_2026.cfm
- Classification table: https://www.fhwa.dot.gov/bridge/nbi/no10/condition26.cfm
- Data limitations: https://www.fhwa.dot.gov/bridge/nbi/nbi_data.cfm
- Draft implementation: https://github.com/jgaethle10/forge-operator/pull/1884