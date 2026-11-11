# FIRST-CONTACT-001 | Primary-source audit and engineering gates
**Audit date:** 2026-11-02. **Status:** initial public-source reconciliation. **Review needed before public publishing.**

This memo contains separate *source observations*, *agency analyses*, *limited computational reproductions*, and *still-untestable hypotheses*. It does **not** assert that any technology is extraterrestrial.

## UAP-001: Go Fast (Navy footage, January 2015)

**Primary report:** AARO, *Go Fast Case Resolution*, February 6, 2025, Appendix A. https://www.aaro.mil/Portals/136/PDFs/case_resolution_reports/AARO_GoFast_Case_Resolution_Card_Methodology_Final.pdf

- AARO used a **34-second public video** because the original sensor recording and associated metadata could not be obtained. It does not establish a unique object identity. Its assessment was **no anomalous flight performance**.
- AARO analyzed frames at **4239 s** and **4252 s**, 13 seconds apart, with the following rounded display readings (Appendix A, Table I):
  - t1: sensor 49° to the left, -29° elevation, 4.0 NM = 7,408 m slant range; aircraft 25,000 ft = 7,620 m.
  - t2: sensor 57° to the left, -35° elevation, 3.4 NM = 6,297 m slant range; aircraft 25,010 ft = 7,623 m.
  - F/A-18 airspeed ~190 m/s, bank angle ~14°. Aircraft actual absolute heading/position not known.
- **Internal publication typo:** Appendix A, page 11, one sentence says range 6,279 m; Table I and nearby worked equation use 6,297 m. The numeric reproducer follows Table I/Eq. (9) and documents this decision.
- Appendix A assumes a coordinated aircraft turn and uses circular turn radius v²/(g tan bank), yielding ~14,759 m and ~9.6° heading change over 13 s.
- Appendix A's aircraft-relative *rounded* object positions are approximately (4,251,-4,890,3,591) m and (4,510,-4,941,3,612) m, using x forward, y right, z **down**; speed ~20 m/s over this selected 13-second interval.
- Our script \`gofast-appendix-a.mjs\` independently recomputes **arithmetic based on published rounded inputs** and obtains ~263 m and ~20.2 m/s. Agreement at this precision is a cross-check of published calculations, **not** independent reproduction of the physical event, the full 13-second path, or all-wind scenarios.
- AARO's broader heading/wind analysis gave an object altitude around 3,962 m (13,000 ft) and wind-compensated speed range 1.9–41.3 m/s (about 5–92 mph). The published numbers are approximate; AARO itself cautions against literal interpretation at their precision.
- Independent constraints: missing raw original sensor recording, sensor calibration, absolute F/A-18 platform heading and location, uncertainties in wind at aircraft and target altitudes, missing unrounded frame transition observations. **Do not** claim an independent motion/propulsion solution from the two-frame source alone.

**Engineering lesson:** Camera angular motion is not enough; restore moving-observer state, pointing conventions, range and uncertainties before solving a trajectory.

## MAT-001: Layered magnesium alloy sample, claimed recovered 1947

**Primary reports:**
- Oak Ridge National Laboratory, *Synopsis: Analysis of a Metallic Specimen*, 2024: https://www.aaro.mil/Portals/136/PDFs/Information%20Papers/ORNL-Synopsis_Analysis_of_a_Metallic_Specimen.pdf
- AARO supplement, July 2024: https://www.aaro.mil/Portals/136/PDFs/Information%20Papers/AAROs_Supplement_to_ORNLs_Analysis_of_a_Metallic_Specimen.pdf

The material examined by ORNL was predominantly Mg (~97.5% by one SEM-EDS analysis) and Zn (~2%), with multiple mixed Bi/Pb-rich bands. ORNL's tests used CT, microscopy, EDS/TEM, mass spectrometry and isotopic comparisons; it assessed terrestrial origin, consistent manufactured processing, and a structure unsuitable for the **specific** hypothesized crystalline bismuth THz waveguide. Long pre-lab chain of custody could not be verified. These tests **do not** prove all unusual materials claims false, and do not support antigravity claims either.

**Engineering lesson:** Define expected crystal orientation, phase purity, dielectric interface and transmission signatures *before* a waveguide claim is considered testable. THz waveguides are a normal, viable photonics research topic, not evidence of antigravity.

## UAP-002: PR-011, Europe, 2021

AARO official imagery listing: https://www.aaro.mil/UAP-Cases/Official-UAP-Imagery/

AARO describes an infrared contrast area in a 2m8s recording and says analysis of physical attributes/performance is ongoing. Unresolved or under analysis is **not** validation of extreme acceleration, exotic propulsion, or non-human technology.

## ENG-001: Known-physics analog

Xu et al., *Nature* 563, 532–535 (2018), electroaerodynamic powered flight:
https://www.nature.com/articles/s41586-018-0707-9

A terrestrial, peer-reviewed demonstration of electric/ion-wind fixed-wing flight. It establishes that an airframe can be propelled with no conventional propeller; it does not identify or explain any specific UAP. Further feasibility work should be desk/simulation-based; no unreviewed high-voltage builds.

## Evidence classification and no-go criteria

| Label | What it permits | What it does not permit |
| --- | --- | --- |
| Official primary case source | Quote and attribute the official video/report | Treat an interpretation as an independently replicated measurement |
| Agency assessment | Report agency's documented conclusions and uncertainty | Assert a known craft identity unless established |
| Arithmetic reproduction | Verify inputs, conversions, equations and rounded numbers | Claim new sensor calibration or a new observed result |
| Synthetic simulation | Test software and thought experiments | Reclassify simulated speeds as actual UAP measurements |
| Unresolved case | Open research question | Equate missing data with proof of non-human technology |

**Review gates:** independent source check; code test run in repository environment; documented assumptions; strongest alternative/null explanation; explicit precision and source availability; permission/rights check; sign-off before marketing or publication.

## Systemia handoff boundary

Proposed roles: Evidence & Provenance, Sensor Forensics, Materials/Photonics, Known-Physics Engineering, Independent Red Team. These are *work packages*, not proof of active agents or autonomous job dispatch. Any Systemia mission run requires a real runtime endpoint, execution receipts, and authorized capabilities. Do not substitute a public read-only Fabric catalog listing for evidence of execution.
