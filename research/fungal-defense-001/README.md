# Evercraft Fungal Defense Observatory

**Research ID:** FUNGAL-DEFENSE-001  
**Build status:** v0.3 standalone offline prototype with a separate provisional 2026 surveillance lane; not deployed  
**Last manual evidence review:** Historical CDC data 2026-11-04; provisional CDC NNDSS weekly series 2026-11-09  
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


## November 9, 2026: Owned runtime verification and release gates

[Draft PR #1908](https://github.com/jgaethle10/forge-operator/pull/1908) collects the research branch for review. It is **not** a request to publish or merge without the required reviews.

The approved path remains **GitHub as canonical source, Evercraft-owned Node001/Node002 as runtime, Systemia coordination**, with no external app host. The new tools do not contact cloud APIs or deploy anything.

### Run on an Evercraft-owned node after checking out the branch

From a clean local clone of `jgaethle10/forge-operator`:

```bash
git fetch origin research/fungal-defense-001
git switch research/fungal-defense-001
python3 research/fungal-defense-001/tools/run_owned_validation.py \
  --node-label evercraft-node002-nextgen \
  --output "$HOME/.local/state/evercraft/fungal-defense/local-validation.json"
```

The command runs the exact validation scripts and offline unit tests, records the checked-out Git commit and worktree cleanliness, and creates a receipt. **The node label is an operator-supplied label, not cryptographic proof of node identity.** The command neither fetches live surveillance nor publishes the application. A passing receipt must be obtained on actual Evercraft hardware before claiming a successful owned-runtime execution.

### Check release-readiness without releasing anything

```bash
python3 research/fungal-defense-001/tools/release_gate.py --self-test
python3 research/fungal-defense-001/tools/release_gate.py --stage preview
python3 research/fungal-defense-001/tools/release_gate.py --stage public
```

- The `preview` stage can report `preview_ready` for internal testing but always sets `can_publish=false`.
- The `public` stage intentionally fails with exit code 2 and `status=blocked` until all four review records and explicit release approval exist.
- Scientific, privacy/security, accessibility, and owned-runtime evidence must be recorded in `release-gates.json`, including dated evidence links and a pinned 40-character commit SHA.
- **Do not self-certify or fabricate approvals.** The script checks manifest completeness, but human review and authenticity verification remain separate requirements.
- Never run `serve_local.py` on a public interface; it is deliberately bound to 127.0.0.1.

### What was actually exercised on November 9

- `release_gate.py --self-test`: PASS on isolated development machine.
- `release_gate.py --stage preview`: `preview_ready`, with public publication false.
- `release_gate.py --stage public`: blocked as expected.
- `run_owned_validation.py` without its repository checkout files: properly failed and produced a non-green receipt.
- Checked local file Git hashes matched the committed scripts. **The full suite has not yet been executed on Evercraft Node001/Node002; do not mark that milestone complete.**

The next actual Evercraft-node success receipt is the prerequisite for an internal preview deployment discussion. The public-health claims remain subject to qualified external review.


## November 9 continued: Clean-checkout admission and one-command owned-node handoff

A passing validation result now requires **local checkout admission**, in addition to scientific-source and UI integrity checks. The runner invokes `tools/verify_checkout.py` first and stops before the other checks if the branch, Git origin, commit, required files or worktree cleanliness do not match expectations. It fails rather than producing a misleading green receipt.

### One-command handoff to the approved Evercraft Linux node

This **does not run from GitHub or ChatGPT by itself**. Execute from the Evercraft node's approved agent/operator context after fetching the research branch, or provide the command to Systemia once its execution route is confirmed:

```bash
bash research/fungal-defense-001/tools/validate_on_owned_node.sh "$REVIEWED_COMMIT" evercraft-node002-nextgen
```

The script uses GitHub **only as canonical source retrieval**, never as an application runtime. It clones `research/fungal-defense-001` into a restricted temporary directory on the node, runs `run_owned_validation.py`, writes a private local receipt at `${XDG_STATE_HOME:-$HOME/.local/state}/evercraft/fungal-defense/latest-node-validation.json`, and removes its own temporary checkout. It does not contact Base44 or other application hosts, modify an existing checkout, use cloud compute, or open a public port.

A label such as `evercraft-node002-nextgen` is **self-reported**. The receipt is **not** cryptographic attestation of which physical machine executed the tests. Verify origin and commit against GitHub, inspect the receipt on the actual node, and record its provenance before changing the issue's owned-runtime status.

### Offline tests actually executed in isolated development environment

- Seven `test_verify_checkout.py` tests: admitted clean canonical Git fixture; rejected dirty tracked file, untracked file, wrong branch, wrong origin, missing file, and non-Git directory.
- Four `test_run_owned_validation.py` integration tests: green local fixture; fail-closed on dirty checkout and wrong origin; fail-closed on a validator reporting failure.
- **Total 11 passed (2026-11-09)** using Python 3.13.5 and temporary local Git repositories; this is **not** execution on the actual Evercraft nodes.
- `validate_on_owned_node.sh` passed `bash -n` and `--help` smoke checks, but its GitHub clone + Evercraft-node run has not been executed.
- Exact local Git blob hashes of `verify_checkout.py`, `test_verify_checkout.py`, `run_owned_validation.py`, `test_run_owned_validation.py` and the handoff shell script were checked against committed branch files.

**Open gates:** actual owned Node001/Node002 receipt, Systemia/Fabric execution route verification, real-device/browser checks, scientific review and explicit public release approval. PR #1908 remains draft; no deployment was performed.

## November 9, 2026 night: Provisional 2026 NNDSS surveillance lane

The historical CDC tracking chart ended in 2024, but the CDC's weekly NNDSS series publishes **provisional** 2026 data, with a like-week 2025 comparison. To avoid misrepresenting newer evidence, the observatory now includes:

- [`observatory-v0.3.html`](https://github.com/jgaethle10/forge-operator/blob/research/fungal-defense-001/research/fungal-defense-001/observatory-v0.3.html): distinct historical (2016–2024) and provisional week 43 (2026) panels, category selector, cumulative-notification table and source links. Still offline and not published.
- [`data/cdc-nndss-provisional-2026-w43.json`](https://github.com/jgaethle10/forge-operator/blob/research/fungal-defense-001/research/fungal-defense-001/data/cdc-nndss-provisional-2026-w43.json): official CDC NNDSS clinical series (weeks 41–43) and separately labeled screening count (week 43). Data reviewed November 9, 2026.
- [`tools/check_provisional.py`](https://github.com/jgaethle10/forge-operator/blob/research/fungal-defense-001/research/fungal-defense-001/tools/check_provisional.py) and `tools/test_provisional.py`: separate source-case validation, embedded JSON consistency and safety requirements.
- `tools/serve_local.py` now serves v0.3, while retaining the loopback-only and single-file allowlist behavior. `tools/verify_checkout.py` and `tools/run_owned_validation.py` require and validate both datasets.
- The v0.2 snapshot is preserved for historical continuity.

**CDC NNDSS week 43, week ending October 31, 2026, U.S. residents excluding territories:** 6,572 provisional clinical notifications YTD 2026 versus 5,733 at the same week in 2025; screening notifications 7,202 versus 6,896. *Clinical and screening are different categories; never add them or compare these provisional figures directly against the finalized CDC historic annual surveillance series.* Data can be revised, and reporting completeness differs across jurisdictions.

Sources: [CDC clinical NNDSS week 43](https://stacks.cdc.gov/view/cdc/262786) and [CDC screening NNDSS week 43](https://stacks.cdc.gov/view/cdc/262787). Both are official CDC archival records. Neither count is a mortality total or real-time confirmed outbreak estimate.

To validate the v0.3 source lane on a checked-out research branch:

```bash
python3 research/fungal-defense-001/tools/check_provisional.py
python3 -m unittest discover -s research/fungal-defense-001/tools -p 'test_*.py' -v
bash research/fungal-defense-001/tools/validate_on_owned_node.sh "$REVIEWED_COMMIT" evercraft-node002-nextgen
```

The last command **must be executed on the intended Evercraft-owned node**; its label is self-reported, not hardware attestation. As of this commit, this has not been done. The v0.3 panel has passed source/HTML structural integrity assertions within the connector session, but not a fully instrumented actual-device browser review or owned-node runtime execution.

### Next acceptance milestones

1. Run the full v0.3 Python suite from a clean branch on owned Node002 (or Node001) and preserve the local receipt.
2. Verify the preview in an actual browser, including category switching, mobile layout and accessibility.
3. Establish NNDSS update cadence with **manual source-review admission**, not an automatic live outbreak feed. Every future week must be linked to the exact CDC record.
4. Obtain independent scientific, privacy and accessibility review before any public health-related publication or clinical positioning.
5. Keep `release-gates.json` unapproved until those checks have genuine, attributable evidence.


## November 10, 2026: immutable commit admission and handoff tests

The handoff previously cloned a **mutable research branch** and executed its current HEAD without requiring the human-reviewed commit. This has been corrected.

- `tools/validate_on_owned_node.sh` **requires the exact 40-character lowercase Git commit** as its first argument. Missing, malformed, or changed commit IDs stop before any validation script executes.
- The script downloads only the canonical branch into a disposable checkout, resolves its HEAD, compares it byte-for-byte to the approved expected SHA, and refuses to run if they differ.
- A unique private receipt is produced for each run (not an overwritten `latest` file). Temporary source is removed by a cleanup trap.
- `tools/test_node_handoff.py` performs six offline integration checks using fake Git and Python binaries. These cover missing/malformed pins, changed branch commits, success with a matching pin, failed downstream validation and distinct receipt names.
- **Observed in an isolated development container:** all six tests passed, `bash -n` passed, and the missing-pin invocation correctly exited 2. Verified Git blob hashes: handoff `3469af4a4ba2528ced2d87219c6bb2c1ac974fef`; test suite `d5da2b50a03363bd97a3701e3b92a596fcfe8266`.

### Running a reviewed source on NextGen

Set `REVIEWED_COMMIT` to the **exact current, explicitly inspected 40-character HEAD** of the draft research branch; do not substitute a mutable branch name, use an unverified value from an email, or auto-resolve HEAD at execution time.

```bash
REVIEWED_COMMIT="PASTE_REVIEWED_40_HEX_COMMIT_HERE"
bash research/fungal-defense-001/tools/validate_on_owned_node.sh "$REVIEWED_COMMIT" evercraft-node002-nextgen
```

If the branch changes after review, the command **must fail**. Review the new commit before trying with a different pin. This is a safety feature, not a runtime outage.

The script must itself be retrieved from the reviewed commit or have its Git blob hash checked against the reviewed source. The local node label is informational only; the output does not cryptographically prove the machine identity. It does not deploy the observatory or issue public-health alerts.

**Still missing:** an authentic execution receipt from Evercraft Node001/Node002, browser accessibility checks, expert scientific review, and owned Systemia integration. Public release remains blocked by `release-gates.json`.

