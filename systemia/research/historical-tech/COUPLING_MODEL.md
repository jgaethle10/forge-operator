# HIST-TECH-001 | Ideal Coaxial Coupling Study (Stage 3)

**Status:** executable theoretical model, not a bench result or product-level power-transfer simulator.

## Model provenance
The code implements the SI-units Neumann line-integral for two ideal coaxial circular current filaments. NIST's Digital Library of Mathematical Functions gives the equivalent angle integral in §19.34.1: https://dlmf.nist.gov/19.34 . The classical Maxwell/Grover elliptic-integral solution describes the same ideal geometry. The implementation evaluates the 1D integral using composite Simpson quadrature and rejects cases where numerical convergence is insufficient.

**Outputs:** mutual inductance (henries) and a normalized `M²` illustrative pickup-power proxy under fixed current, frequency, circuit load, and *weak coupling*. More separation usually decreases mutual inductance. The model does **not** calculate actual DC-source-to-DC-load efficiency or give delivered watts.

## Critical limits
- Coaxial, parallel circular filaments only; **no lateral displacement or angular tilt**.
- No skin effect, wire resistance, self-inductance, core/ferrite coupling, metal shielding, tuning, matching, rectification, regulatory power controls, thermal behavior, or nonlinear loading.
- The turn multiplier assumes all turns share the same radius and location. Real multilayer coils require a more detailed geometry.
- Filament pairs closer than 0.5 mm are rejected because real wire size is unspecified and the ideal integral is singular at coincidence.
- Numerical quadrature is allowed only over a bounded separation range, with 2048- vs 4096-panel convergence check. This check is not independent verification of physical assumptions.
- Do **not** conflate theoretical mutual inductance or a relative power proxy with a measured efficiency, energy generation, or a practical free-energy device.

## Example *model-only* sweep
Input: transmitter radius 25 mm, receiver radius 15 mm; 2 nominal transmitter and 3 receiver turns; equal coil centers, coaxial.

| Axial separation | Mutual inductance (model, μH) | Illustrative normalized M² power proxy vs 20 mm |
| --- | ---: | ---: |
| 10 mm | 0.08680 | 3.54258 |
| 20 mm | 0.04612 | 1.00000 |
| 30 mm | 0.02498 | 0.29348 |
| 40 mm | 0.01438 | 0.09719 |
| 60 mm | 0.00569 | 0.01521 |
| 80 mm | 0.00271 | 0.00346 |

**These values are model-generated, not laboratory observations.** A normalized ratio above 1 here (at 10 mm) is NOT >100% electrical efficiency. It means larger relative coupling than the chosen 20 mm normalization reference.

## Software validation
```bash
node --test systemia/research/historical-tech/*.test.mjs
```

Coupling model tests: reciprocity, monotonicity with separation, turn scaling, far-field dipole-limit comparison, normalization, and rejection of unsupported inputs.

## How to use this on a first safe physical benchmark
1. After separately approved hardware/safety/metrology review, document actual coil center-to-center spacing, coil radii and turns.
2. Use [BENCH_PROTOCOL.md](BENCH_PROTOCOL.md) to capture complete **DC input/output** observations independently.
3. Compare the **shape** of the measured distance trend with this model, documenting discrepancies from real winding dimensions, losses, cores, resonance and electronics. Do **not** compare absolute DC efficiencies to theoretical `M²` numbers.
4. If measured behavior diverges, investigate assumptions and instrument reliability rather than labeling it evidence of a new physical mechanism.
5. Preserve raw measurements, calibration, uncertainty bounds and independent replication before any public claim.

**Release gate:** A passing CI run validates code against known software checks, not a validated scientific experiment. No physical bench or Systemia-agent runtime work is claimed.
