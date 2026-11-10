# Evercraft Watershed Intelligence | immutable evidence ledger

This dedicated branch is **source archive storage**, not the public website, a source-code release, or permission to publish a water-supply report.

The `Yakima watershed immutable source history` GitHub workflow, after it is reviewed and merged to `main`, may write ONLY new records beneath `evidence/watershed/runs/YYYY/MM/DD/<trusted_run_id>/` following official scheduled/manual watershed canary runs from the repository's `main` branch.

Each run stores:
- `receipt.json`: source-reported collection date, schema, observation metadata, source SHA-256, quality and missing-feed flags, archived history-point projections, and `publication_authorized=false`.
- `sources/latest.json`, `sources/swe-median-audit.json`, `sources/official-basin-report.json` and `sources/reservoir-source-probe.json` when present, byte-for-byte from the original official-source collection artifact.

**Immutable behavior:** The recorder must never overwrite a recorded run. Duplicate identical source-run IDs are no-ops. Duplicate IDs with altered bytes fail visibly and require human reconciliation. All missing days remain missing, not zero; reports/forecasts are not inferred.

The code and tests remain on the canonical `main` branch; this branch stores evidence only. The bootstrap branch itself contains **no archived daily run yet**. The first append requires a merged approved workflow, a qualifying source collection, and a successful GitHub push receipt.

No customer payload, payment record, credentials, private river location, drone operating instructions, or human-reviewed public brief belongs here.
