# Evercraft Fungal Defense Observatory

**Research ID:** FUNGAL-DEFENSE-001  
**Build status:** v0.2 standalone offline prototype, not deployed  
**Last manual evidence review:** 2026-11-04  
**Mode:** Public aggregate data, static and non-clinical

## What is actually working

- `observatory-v0.2.html` is a self-contained HTML/CSS/JS interface that can open in a modern browser without external libraries or network requests.
- Users can switch between CDC's public tracking series (2016–2024) and its corrected 2026 MMWR analysis of 2022–2024. The selector changes the chart, accessible source notes, table, and exact count.
- Source definitions, access dates, historical data limits, and caveats are embedded. The interface explicitly explains discrepancies between sources rather than silently reconciling them.
- The public tracking data total 17,091 cases over 2016–2024. The corrected MMWR study reports 13,507 across 2022–2024. **Neither count is deaths or confirmed invasive infection incidence.**
- The interface gives pathways to CDC clinical prevention information and WHO's June 2026 fungal-disease response blueprint.

## Quick start (owned local environment)

Open `observatory-v0.2.html` directly in a modern browser. No server, database, cloud host, account, patient data, vendor API, or third-party JavaScript is required.

From the repository root, run:

```bash
python3 research/fungal-defense-001/tools/validate_surveillance.py --self-test
python3 research/fungal-defense-001/tools/check_observatory.py
```

Both scripts use the Python 3 standard library. They are **committed validation tools**, not a claim that production deployments, recurring schedules, or automatic public-health data ingestion are active.

## Source file responsibilities

| File | Role |
|---|---|
| `CHARTER.md` | Science, ethics, product boundaries, milestones |
| `data/cdc-cauris-clinical-annual.json` | Canonical source-specific annual historical counts and provenance |
| `observatory-v0.2.html` | Offline prototype with embedded copy of canonical source data |
| `tools/validate_surveillance.py` | Rejects source mix-ups, altered snapshot data, invented years and privacy-rule removal |
| `tools/check_observatory.py` | Checks UI source JSON consistency, required labels and standalone/offline behavior |

## Updating surveillance information

1. Obtain the updated official source from CDC. Record exact URL, source date, data extraction/access date, the case definition and any revisions. **Never substitute a blog or model estimate.**
2. Decide whether to add a *new* source/version rather than overwriting a historical frozen analysis; avoid combining tracking counts and a case-based study.
3. Review changes with a human. Any new years or changed historical counts require documented source evidence and accompanying updates to pinned validation snapshots.
4. Update the canonical JSON and then the embedded `dataset-json` script in the standalone HTML. Do not update only one copy.
5. Run both validation commands and manually check source dropdown, year dropdown, accessible data table, footnotes and mobile layout.
6. Do not identify patients or facilities, reverse CDC-suppressed geographic bins, or generate unsupported automated outbreak alarms.
7. Public health or clinical release requires expert review, appropriate local privacy controls, documented update/monitoring process and verified hosting.

## Why this is not a forecast

Historical counts show reported case burden, not causal attribution to climate change. Fungi evolving thermal tolerance and antifungal resistance are genuine scientific questions; this page does not establish the risk, timing or inevitability of any fungal pandemic. The best current application is evidence access, prevention education and methods transparency.

## Evidence sources

- [CDC tracking C. auris](https://www.cdc.gov/candida-auris/tracking-c-auris/index.html) (page reviewed October 2, 2026)
- [CDC corrected MMWR surveillance analysis, 2022–2024](https://www.cdc.gov/mmwr/volumes/75/ss/ss7504a1.htm) (July 2, 2026; analysis dataset frozen February 20, 2026)
- [CDC infection prevention guidance](https://www.cdc.gov/candida-auris/prevention/index.html)
- [WHO fungal-disease and antifungal-resistance response blueprint](https://www.who.int/publications/i/item/9789240122529) (June 30, 2026)
- [Schuh & Gokhale fungal thermotolerance review](https://doi.org/10.1128/msphere.00109-26) (2026)

## Systemia integration and deployment gate

This is a **research-branch deliverable**, not a remotely deployed Evercraft product. Verify owned local Node001/Node002 runtime and Systemia/Fabric health before attempting integration or publishing it. Do not introduce external hosting services as a shortcut. The observatory can remain a standalone static file until an owned, permitted publication lane exists.


## Verified local source-watch and preview tools (November 4, 2026)

The following additions are committed in this research branch and **were executed successfully in an isolated development container**. This is **not** a Node001/Node002 deployment receipt.

- `tools/source_watch.py`: read-only source drift sentinel. The `--online` mode makes exactly one allowed request to the official CDC C. auris tracking page. A changed headline yields a **manual-review signal**, never an outbreak alarm or automated dataset update.
- `tools/test_source_watch.py`: five local fixture tests for matching, changed, unparseable and script-injected pages.
- `tools/serve_local.py`: local-only preview HTTP server bound to 127.0.0.1, serving only the observatory HTML and refusing repository file browsing.
- `tools/test_serve_local.py`: six-test suite's server test checks redirect, page serving, unrelated-file refusal, traversal refusal and restrictive headers.

From a checked-out `research/fungal-defense-001` branch at repository root:

```bash
python3 research/fungal-defense-001/tools/validate_surveillance.py --self-test
python3 -m unittest discover -s research/fungal-defense-001/tools -p 'test_*.py' -v
python3 research/fungal-defense-001/tools/check_observatory.py
python3 research/fungal-defense-001/tools/serve_local.py
```

The preview command reports a loopback URL. Opening it on the same computer should display the v0.2 page. The server does not expose the page on your LAN or Internet; remote use requires a separate reviewed and explicitly approved owned deployment.

The source watcher can be run manually on a networked Evercraft host:

```bash
python3 research/fungal-defense-001/tools/source_watch.py --online --output source-drift-receipt.json
```

A non-zero exit status signals that the source changed, cannot be verified, or could not be fetched. **Do not treat a changed total alone as evidence of an outbreak.** Record retrieved source and its definition; review revisions; then propose a new version of the dataset. No automation should promote new numbers without review.

### Verified test scope and limits

The isolated development container executed `validate_surveillance.py --self-test` successfully (seven mutation checks), `unittest` successfully (six tests), and compiled the Python tools. Git blob hashes match the corresponding GitHub source files. The web browser UI, live online CDC-fetch mode, local Evercraft machines, Systemia integration, and public domain deployment still require separate verification.
