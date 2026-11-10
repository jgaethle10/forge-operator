# FIRST-CONTACT-001 | Evercraft anomalous technology research

**Status:** research branch / preliminary evidence and reproducibility baseline. **Owner:** Evercraft LLC. **Route:** Systemia-first. **Last source review:** 2026-11-09.

## Mission

Investigate publicly documented unidentified anomalous phenomena (UAP), claimed recovered materials and unusual engineering concepts. Reconstruct claims in testable terms; validate observations, rule out ordinary mechanisms, and then pursue independently useful engineering. No UAP case, alleged material or theoretical model here is represented as verified extraterrestrial technology.

**Operational honesty:** This repository is a research packet and a reproducible *synthetic* kinematics control, not evidence that a live multi-agent crew has executed a mission, that sensors have been deployed, that a craft or specimen has been acquired, or that a propulsion device has been built. Public Evercraft/Fabric discovery is read-only; Systemia runtime dispatch requires a separately verified execution route.

## Research lanes and proposed specialist team

1. **Evidence/provenance:** Capture primary source URLs, release dates, format, source independence, chain of custody, full-vs-excerpt status, and unavailable sensor metadata. Dedupe retellings.
2. **Sensor forensics:** Reconstruct geometry, parallax, observer motion, atmospheric context, camera/radar limitations, IR polarity, compression and frame timing. Assign uncertainty intervals. Do not infer intrinsic speed from pixel travel alone.
3. **Physics & materials:** Translate *specific* reported properties into mass/energy, electromagnetic, thermal, mechanical and microstructure constraints. Mark all assumed parameters.
4. **Independent red team:** Identify strongest terrestrial explanations; write null models and falsification conditions **before** approving a speculative hypothesis.
5. **Prototyping and QA:** Simulate first. Design safe, bounded experiments on known physical effects only if personnel, facilities, hazards, funding and controls are available.

Proposed roles are *unassigned*. Do not portray them as spawned or running Systemia agents.

## Initial evidence register

See `cases.json`. Three distinct types of work are intentionally separated:

- **UAP-001: Go Fast, January 2015.** AARO's February 6, 2025 review of the Navy footage did not determine identity but found no anomalous performance; assessed object altitude approximately 13,000 ft and wind-adjusted speed range approximately 5–92 mph. This is a *calibration control* for observer-relative motion and uncertainty, not a recovered propulsion design.
- **MAT-001: alleged 1947-origin Mg/Bi/Pb specimen.** AARO/Oak Ridge testing concluded that the studied specimen was consistent with terrestrial Mg alloy processing and lacked structural characteristics required by the proposed THz-waveguide claim. We can study real metamaterial/waveguide design as an independent engineering topic, but cannot treat this material as extraterrestrial or antigravity-capable.
- **UAP-002: PR-011, Europe 2021.** AARO lists this IR video as undergoing analysis. Label unresolved/performance not independently established and **do not** use it as proof of novel propulsion.
- **ENG-001: electroaerodynamic propulsion.** MIT demonstrated a propeller-free solid-state heavier-than-air flight in 2018, using onboard high-voltage ion-wind propulsion. It is terrestrial, established technology and only a *possible inspiration* for a future lab feasibility analysis. It does not explain any particular UAP. No high-voltage build is authorized by this document.

## First reproducible measurement control

`kinematics.mjs` models **synthetic**, stationary-observer two-frame angular displacement with equal endpoint slant range. It shows that the identical angular displacement yields different observer-relative chord speeds when distance is unknown.

Run: `node systemia/research/first-contact/kinematics.mjs`

Test: `node --test systemia/research/first-contact/kinematics.test.mjs`

### Required limitations

This is a mathematical sanity check, **not** an analysis of Go Fast raw frames. The code uses deliberately invented demonstration numbers, not extracted flight telemetry. Real airborne sensor analysis also needs observer position, heading, velocity, pointing/calibration, line-of-sight/range measurements, atmosphere, frame timing and their error bars. No ground-relative object velocity can be inferred from a single simple angular observation without additional constraints.

## Sprint 2, November 2, 2026: measured progress (research branch only)

- **Generic moving-observer geometry:** `platform-geometry.mjs` projects known target range/azimuth/elevation into a local East-North-Up reference using per-frame observing-platform positions and timestamps. It estimates velocity, three-frame acceleration, optional wind-relative velocity, and conditional Gaussian Monte Carlo *sensitivity*. A missing range or timestamp fails closed. The independent-error intervals are assumed, not inferred from video.
- **Published-number AARO reproduction:** `gofast-appendix-a.mjs` translates AARO's public Appendix A Table I and Eqs. 4-13, including coordinated aircraft turn, into its **different aircraft-fixed** x-forward/y-right/z-down convention. With displayed rounded values, it reproduces approximately 14.76 km turn radius, 9.59-degree turn, and **263 m in 13 s = 20.2 m/s**, consistent with AARO's rounded ~265 m / 20 m/s example. This is a check on *AARO's published arithmetic*, not independently measured motion or wind-compensated speed. The report has a 6297/6279 m t2 range inconsistency; see audit.
- **Research/source audit:** `source-audit-2026-11-02.md` distinguishes primary observation, government interpretation, reproduced public arithmetic, synthetic simulation, and speculation. It covers Go Fast, Oak Ridge material findings, PR-011 and terrestrial electroaerodynamic flight.
- **Tests:** 14 targeted new tests passed on local Node v22; repo CI/production execution **not yet verified**. Run `node --test systemia/research/first-contact/*.test.mjs` after checking out the branch. The earlier three baseline tests remain in place.
- **Boundary:** no autonomous Systemia agents dispatched, no evidence of extraterrestrial recovered craft, no verified full-frame video replication or hardware demonstration.

## Sprint 3, November 3, 2026: desk feasibility and red-team stage

- **Materials / THz:** `materials-thz-screen-2026-11-03.md` audits the AARO/ORNL findings for the alleged recovered Mg-Bi-Pb specimen. The specific proposed crystalline-bismuth waveguide mechanism is unsupported by its described mixed composition and structure. No material specimen is possessed or independently tested.
- **Electroaerodynamic propulsion:** `propulsion-feasibility-2026-11-03.md` keeps MIT's established fixed-wing ion-wind demonstration separate from hypothetical parameter extrapolation. `engineering-feasibility.mjs` computes airframe-level drag/thrust/power and battery arithmetic from user-provided assumptions; it cannot predict real hover, scale-up or safe hardware implementation.
- **THz physical scale:** the new tool computes `lambda=c/f` in free space. Guided-mode wavelength, insertion loss and antigravity claims are **not** determined by this conversion.
- **Red-team draft:** `red-team-decision-2026-11-03.md` prioritizes falsification, sensor-quality engineering and known-physics modeling, with unresolved claims held pending source data.
- **Validation:** 7 new pure-math scenario tests passed locally on Node v22 on 2026-11-03; earlier 14 new tests and 3 baseline tests were reported previously but not re-run in this local verification. Repository CI outcomes and independent code review are still required.
- **Runtime state:** Systemia mission intake statuses updated, but specialist agent slots are still unassigned, and no live autonomous Systemia mission was dispatched.

## Sprint 4, November 4, 2026: second-view triangulation + recent evidence intake

- **New working synthetic model:** `triangulation.mjs` estimates the closest approach between **two bearing rays** from independently located observers using local ENU. It rejects near-parallel viewing directions, intersections behind either sensor, invalid inputs and cross-ray misses exceeding a user-supplied tolerance. Without a specified tolerance, the result is labeled `CANDIDATE_UNVALIDATED` rather than a confirmed target position. This depends on synchronized observation times and surveyed positions; it is not a UAP measurement.
- **New quality gate:** `case-readiness.mjs` tracks documented inputs for 3D trajectory reconstruction or second-view ranging; `null` means **not established**, not `false` or missing. No case is automatically upgraded to unusual propulsion or extraterrestrial origin.
- **Official source intake:** `public-case-intake-2026-11-04.json` records published AARO descriptions of PR-049 (2026 Army IR imagery with zoom changes), PR-017 (2024 phone footage insufficient for agency determination), PR-016 (AARO assessed birds) and PR-011 (2021 IR footage under continued analysis). These are case-listing snapshots, **not** original files, independently interpreted videos, or a live feed.
- **Validation:** 9 new triangulation and 5 new evidence-gate tests passed together on local Node.js v22. GitHub blob SHA values for all four committed JS/test files matched the exact tested local files: `triangulation.mjs e2fd0526...`, `triangulation.test.mjs 0d6521f5...`, `case-readiness.mjs adcdaa22...`, `case-readiness.test.mjs 5112ea26...`. Previous Forge checks for Nov 3 commit `09afb5f...` completed successfully; this does not establish that all current work passed a branch-specific full suite.
- **Owned execution pathway inspection:** Repository docs describe Systemia mission admission, Capability Mesh, Passport/Execution Gate and specialist dispatcher receipts. Neither a source-controlled `mission-intake.json` nor public read-only Fabric discovery dispatches a live team. Execution remains `NOT_DISPATCHED`; no specialist was assigned, no permit consumed, and no compute run receipt obtained.

Review: `node --test systemia/research/first-contact/*.test.mjs` on this branch and inspect PR #1838 before any merge. No high-voltage experiments, no unverified sensor fusion claims, no alien-origin assertions, and no public release.

## Sprint 5, November 5, 2026: reproducible offline sensor intake

- **New dedicated CI:** `.github/workflows/first-contact-research.yml` runs the branch's complete Node test suite and an offline JSON mission/source-integrity audit on relevant changes. On first instrumented commit `9bb5d05e...`, [FIRST-CONTACT verification](https://github.com/jgaethle10/forge-operator/actions/runs/41994861626) succeeded (both test and source audit stages). On code/fixture commit `be1546bc...`, the same workflow [succeeded again](https://github.com/jgaethle10/forge-operator/actions/runs/41995140199). These CI outcomes do not prove field measurement validity.
- **Synchronized dual-view preflight:** `observation-sync.mjs` and `observation-sync.test.mjs` require affirmative operator calibration/survey/timebase/identity assertions and **identical timestamps** for unknown moving targets; refuse inconsistent bearings, near-parallel geometry and duplicated sensor identifiers. A passing result is only `CANDIDATE_REQUIRES_INDEPENDENT_REVIEW`; inputs are self-attested, not authenticated proof.
- **Actual executable intake:** `two-view-cli.mjs` reads one bounded local JSON file, calls the synchronization and 3D geometry checks, and emits a SHA-256 input-hashed result receipt. It never uploads footage, dispatches agents or changes persistent system state. `two-view-cli.test.mjs` and two `fixtures/synthetic-*.json` examples cover a known-target positive control and a desynchronized fail-closed control. The dedicated CI passed with these files committed.
- **Operator field protocol:** `TWO_VIEW_RUNBOOK.md` provides exact test commands, timestamp/coordinate/calibration prerequisites, privacy boundaries and the next legitimate milestone: two independently surveyed cameras observing a non-sensitive known stationary target.
- **Evidence boundary:** No new real UAP measurements or specimen data were obtained, no live Systemia agent ran, and no extraterrestrial technology was identified. Do not present self-attested fixture data as real calibrated imagery.

## Sprint 6, November 9, 2026: known-target accuracy acceptance

- **Numerical calibration evaluator:** `known-target-calibration.mjs` evaluates 3–500 independent, time-ordered two-camera observations of a **known stationary reference target**, with operator-attested survey and predeclared ray-miss/parallax/error/rejection gates. Reports median, P95 and maximum 3D positional error, minimum accepted parallax, accepted/rejected count. A pass is explicitly `NUMERIC_GATE_MET_REQUIRES_INDEPENDENT_FIELD_VERIFICATION`, never proof of real-world calibrated instruments.
- **Guardrail tests:** `known-target-calibration.test.mjs` has 11 synthetic acceptance/rejection cases, including a geometrically consistent but positionally **biased target** that must fail known-ground-truth accuracy. The dedicated FIRST-CONTACT GitHub workflow **passed** on commit `a9a7569a...`, including the calibration module and offline CLI tests.
- **Local operator command:** `known-target-cli.mjs` reads bounded JSON packets without a network call, writes SHA-256-input-hashed results to stdout, and uses nonzero exit codes for holds/errors. `known-target-cli.test.mjs` has 3 command/receipt tests.
- **Calibration fixture:** `fixtures/known-target-synthetic-session.json` has five invented, exactly consistent observations. It tests software behavior only and must not be described as actual camera accuracy, field observation, independent calibration, or extraterrestrial technology.
- **Field protocol:** `KNOWN_TARGET_FIELD_PLAN.md` specifies the real next gate: two independently surveyed and synchronized cameras, a known stationary target, predeclared error thresholds, secure local records and independent survey review.
- **Evidence and dispatch:** GitHub Actions verify source-code tests, not real sensor measurements. No field calibration dataset or qualified independent observation has been provided; Systemia worker dispatch is still `NOT_DISPATCHED` and public release remains held.

## Sprint 7, November 9, 2026: practical two-camera baseline planner

- **New sensitivity engine:** `baseline-sensitivity.mjs` compares up to 16 camera separations for an **invented stationary** target in a local ENU frame. The model applies reproducible seeded independent Gaussian azimuth/elevation error plus optional common systematic azimuth bias. Results explicitly report true synthetic parallax, accepted/rejected ray pairs, rejected fractions and accepted-only position-error quantiles. These are not calibrated sensor confidence intervals.
- **Synthetic regression controls:** `baseline-sensitivity.test.mjs` adds 10 tests covering noiseless recovery, improved range accuracy under longer lateral baselines with the same assumed noise, systematic-bias error despite agreeing rays, insufficient parallax, strict ray-miss filters, reproducibility and invalid values.
- **Usable local CLI:** `baseline-planner-cli.mjs`, its 4 tests and two `fixtures/baseline-plan-*.json` examples provide a no-network JSON interface that returns a SHA-256 input-byte receipt. The examples compare identical simulated setups with and without an assumed 0.5-degree shared azimuth bias. No real footage or hardware is used.
- **Field experiment design:** `BASELINE_PLACEMENT_PLAN.md` documents a feasible **candidate** geometry of 3 meters camera separation and 10 meters to a stationary target (roughly 16.7 degrees parallax), but does not claim such a rig has been placed, surveyed, calibrated or observed. Real field testing requires separate measured camera pointing and ground truth, predeclared thresholds and independent review.
- **Validation:** the dedicated FIRST-CONTACT GitHub Actions test and integrity workflow **passed** for code/fixture commit `a767c6af...` (run `42760006294`). The full research test glob includes the new 10 simulation tests and 4 CLI tests. Later documentation/mission commits must be checked separately. Neither CI nor simulation is evidence of physical UAP acceleration, recovered technology or actual camera calibration.
- **Runtime boundary:** autonomous Systemia agents remain unassigned and `NOT_DISPATCHED`; the tool is an offline software planning utility, not an ongoing agent task or deployed service.

## Sprint 8, November 9, 2026: field evidence byte-chain

- **New private offline evidence audit:** `field-evidence-audit.mjs` enforces SHA-256 byte checks for the declared pre-registration plan and seven source roles: both original-camera records, both calibration records, target/observer survey, clock synchronization and the exact numeric calibration input. It refuses path traversal, symlinks, duplicate roles, absent files, source tampering and mismatched declared target/quality/acceptance criteria.
- **Native file handling:** files are read in bounded **1 MiB chunks**, up to 4 GiB per file; the code records whether each source matched the supplied reference digest, without uploading or exposing their contents.
- **Offline executable:** `field-evidence-cli.mjs` provides local manifest validation, with explicit exit statuses for matched byte chain, HOLD, and invalid input. Unit/CLI tests include real on-disk local test fixtures, tampering, plan/evaluation mismatch, invalid paths and multi-chunk hashing.
- **Operator protocol:** `FIELD_EVIDENCE_CHAIN.md` describes a private, local evidence folder and why the plan's hash must be independently timestamped **before** capture. Matching a hash to another operator-supplied hash is not independent source authentication or a demonstrated time of capture.
- **Evidence restriction:** successful byte checks return only `BYTE_CHAIN_MATCHED_REQUIRES_INDEPENDENT_PROOF`. The auditor does not prove camera calibration, survey accuracy, target identity, chronology, source custody, recording authenticity, extraterrestrial origin or independently observed field accuracy.
- **CI:** dedicated FIRST-CONTACT research checks **passed** for the initial evidence-audit and CLI test commit `1b7a4384...` (run `42771006361`). Subsequent chunked-media enhancement and docs are subject to their own workflow checks; do not infer pass from the older run.
- **Runtime:** no real camera files acquired; no Systemia specialists dispatched. Experiment and independent review remain the next physical gate.

## Decision and escalation gates

- `primary_observation`: original public primary source with reproducible metadata or official release.
- `agency_assessment`: named agency's analysis; preserve its wording and uncertainty rather than laundering it into independently proven fact.
- `independent_replication`: independently reproduced result, recorded method, raw data and assumptions.
- `hypothesis`: specific, falsifiable, not yet verified.
- `speculation`: cannot currently be tested or lacks critical observables.

**Promotion rule:** No engineering claim is promoted because a case remains unexplained. Maintain alternatives and an explicit `missing_data` record. Never claim first-contact, anomalous acceleration, antigravity or non-human origin without supporting independently reproducible evidence. Work only with authorized, unclassified, public or voluntarily provided materials; no attempt to obtain restricted sensor data, unauthorized physical samples or access.

## First milestone

1. Validate source ledger and checksum any original public media actually acquired, with rights review.
2. Extend kinematic model to include **moving** observing platforms with confidence intervals.
3. For UAP-001, extract the public AARO method and list all parameters needed to independently reproduce the result. If missing, report non-reproducibility rather than fabricate measurements.
4. For MAT-001, compare original lab test criteria with the exact physical requirements of THz waveguiding.
5. Produce a red-team-reviewed decision note: what can be built with known physics and what remains untestable.

## Primary references

- NASA UAP FAQ and study: https://science.nasa.gov/uap/faqs/
- AARO official UAP imagery listing: https://www.aaro.mil/UAP-Cases/Official-UAP-Imagery/
- AARO Go Fast case resolution (2025): https://www.aaro.mil/Portals/136/PDFs/case_resolution_reports/AARO_GoFast_Case_Resolution_Card_Methodology_Final.pdf
- AARO/ORNL metallic specimen supplement (2024): https://www.aaro.mil/Portals/136/PDFs/Information%20Papers/AAROs_Supplement_to_ORNLs_Analysis_of_a_Metallic_Specimen.pdf
- Xu et al., `Nature`, 2018, solid-state electroaerodynamic powered flight: https://www.nature.com/articles/s41586-018-0707-9

**Publication boundary:** No customer claim or Evercraft Journal announcement that alien technology has been found. Publish only verified analysis with linked evidence and explicit limitations.
