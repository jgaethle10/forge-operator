# FIRST-CONTACT-001 | Evercraft anomalous technology research

**Status:** research branch / preliminary evidence and reproducibility baseline. **Owner:** Evercraft LLC. **Route:** Systemia-first. **Last source review:** 2026-11-03.

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
