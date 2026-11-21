# American Infrastructure Watch v0.9 — test report

**Prepared:** November 4, 2026 (America/Los_Angeles)

## Passed

- 25 Python tests passed (the existing 21 importer/index/HTTP tests plus four 2025–2026 state-inventory integrity checks).
- Official summary counts reconcile precisely: 2025 = 624,193, 2026 = 624,939; net change = +746.
- State/territory 2025/2026 comparison renders 54 entries: 50 states, Washington DC, Puerto Rico, Guam (no submission) and US Virgin Islands.
- Chromium 390px mobile DOM test, using `set_content`, passed: filter Washington, filter Guam, sort by count, preserve fallback map and show offline local-index status. Local HTTP navigation was blocked by the testing container's browser policy; the DOM behavior was tested via in-memory content.
- No synthetic test bridge records are presented in the shipped UI as real findings.

## Not done / unresolved

- No successful live national FHWA download was performed in this container. Historical 2025 individual-bridge records are **not** included in this release.
- The 2026 comparison is aggregate state counts only, not imported 2026 bridge records or a year-over-year condition analysis.
- No tests on the user's devices, no verified node deployment, and no proven public API uptime.
- GitHub branch/pull request is a source-review workflow, not proof the application is live at a public domain.
- The 2025 ArcGIS importer and local HTTP API passed synthetic tests, but not a full 620k+ live import.

## Risk rules

- Bad condition reports are documented at ordinary severity.
- An official, current warning is required before labeling imminent danger.
- A change in the number of inventory records cannot be used as a change in bridge safety.