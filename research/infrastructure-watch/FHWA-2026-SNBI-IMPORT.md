# American Infrastructure Watch: 2026 SNBI import plan (v0.10)

**Status: not deployed.** The 2026 bridge files are a separate dataset from the 2025 ArcGIS bridge index because FHWA changed its inventory schema. The reviewed local v0.10 release includes an importer, separate SQLite builder, and tests. This PR does not yet contain that whole release.

## Required evidence gates
- Read the 2026 state JSON download URLs from FHWA's own [index](https://www.fhwa.dot.gov/bridge/nbi/nbi_data_2026.cfm), rather than guessing URLs.
- Verify official state count, state/territory identity (BL01), bridge ID (BID01), coordinates (BL05 and BL06), and condition classification (BC12).
- Fail closed on missing, ambiguous, duplicated or mismatched source links. Check file SHA-256 before indexing.
- Check 624,939 records across 53 reporting states/territories. Guam submitted no data; this is not proof of zero bridges.
- Report partial coverage until all state records have been checked and reconciled. Keep 2026 physically separate from the 2025 index.
- A condition G/F/P is not a current warning. Imminent danger requires a current dated official advisory.

## Status and limitations, November 9, 2026
- Locally assembled importer and 11 new synthetic tests. Combined local suite: 36 passed.
- Full network download, actual-state run, and public deployment: **not performed**. The build environment cannot resolve external hostnames.
- One extraction of the official page suggests the Mississippi link may point to a Massachusetts file; verify the original source before importing. Importer blocks duplicate download links instead of guessing.
- Do not merge or claim national bridge coverage without verified source data and operational hosting.

## User-facing classification rule
A poor report is visible but not severe unless evidence supports imminent danger. Closures and official alerts are separate dated layers.

Source: https://www.fhwa.dot.gov/bridge/nbi/nbi_data.cfm
