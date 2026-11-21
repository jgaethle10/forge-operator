# American Infrastructure Watch: evidence-gated 2026 live import

As of November 9, 2026, the local app still has **no complete 2026 bridge-record index**. The summary counts are FHWA's annual statistics, not current hazard reports.

## Source and baseline

- Federal Highway Administration, 2026 National Bridge Inventory: https://www.fhwa.dot.gov/bridge/nbi/nbi_data_2026.cfm
- Data count expected: 624,939 bridges in 53 reporting state/territory datasets.
- Guam did not submit 2026 data; this is missing data, not proof of no bridges.
- 2026 SNBI JSON format is separate from the 2025 legacy bridge data.

## Smallest actual-data import smoke test

On a connected machine with Python 3.11 or newer, from the `forge-operator` repository root on the reviewed branch:

```bash
python3 -m unittest discover -s research/infrastructure-watch/tests -v
python3 research/infrastructure-watch/scripts/fhwa_2026.py sync \
  --state 'U.S. Virgin Islands' \
  --counts research/infrastructure-watch/fhwa_state_inventory_counts_2025_2026.csv \
  --out ./data/aiw-2026
python3 research/infrastructure-watch/scripts/fhwa_2026.py build \
  --counts research/infrastructure-watch/fhwa_state_inventory_counts_2025_2026.csv \
  --out ./data/aiw-2026 \
  --db ./data/aiw-2026/bridges2026.sqlite
python3 research/infrastructure-watch/scripts/fhwa_2026.py query \
  --db ./data/aiw-2026/bridges2026.sqlite --state-fips 78
```

Expected test: 23 records, one verified state, **partial=true**, **complete_national_import=false**. A successful smoke test does not imply the full national inventory is imported or the site is live.

## Evidence rules

1. Fail closed if FHWA's state link is missing, duplicated, or has a different state ID or count from the official index.
2. Preserve source URL, retrieval timestamp, raw SHA-256 and normalized SHA-256 as a state receipt.
3. Never combine 2025 and 2026 data in one unlabeled inventory.
4. Never classify a bridge as an imminent danger on the basis of BC12 poor condition alone. Current official dated hazard/closure notices require a distinct layer.
5. Never describe a partial import as nationwide coverage; missing data is not a zero count.
6. Keep government downloads read-only. Do not affect Evercraft production until the index passes verified coverage and performance checks.

## Review gate

Draft PR: https://github.com/jgaethle10/forge-operator/pull/1884

A scoped GitHub Actions CI job fetches only the small U.S. Virgin Islands dataset and retains a short-lived validation artifact. Review the CI outcome and artifact before treating the test as successful.