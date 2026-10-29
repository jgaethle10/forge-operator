# Verified findings | SuperCon observational pilot 002

**Run:** GitHub Actions job `observed-supercon`, 2026-10-29. SHA-256 of source ZIP matches pinned UCI archive. 21,263 original records, no synthetic benchmark data. Independent grouped residual check passed.

## Observed numerical results

| Quantity | Measured audit output |
| --- | ---: |
| Original source rows | 21,263 |
| Distinct atom-fraction compositions | 15,164 |
| Repeated compositions | 2,422 |
| Repeated compositions with differing Tc | 2,375 |
| Rows in discordant compositions | 8,427 |
| Best in-sample constant-per-composition RMSE | 4.302818789840542 K |
| Largest within-composition Tc range | 125.0 K |

Grouping is by atom fractions rounded to 10 decimals. Each source measurement is retained. The optimal one-value-per-composition predictor is its source-label mean. This mathematically minimizes training SSE *for this data representation*; it is not a bound on physics generally.

## Example worth literature-level investigation

**H2S1** occurs in rows 20,573 and 20,574 with reported critical temperatures of **60 K** and **185 K**. The source dataset does not include enough phase/pressure/synthesis context to identify their actual measurement conditions. The literature demonstrates that compressed sulfur hydrides have strongly pressure- and phase-sensitive superconducting transitions and that H2S can transform into other sulfide stoichiometries under pressure. Do not treat the two labels as a contradiction in physical law or an error without recovering primary provenance.

Useful starting papers:

- Drozdov, Eremets, Troyan et al., *Conventional superconductivity at 203 kelvin at high pressures in the sulfur hydride system*, Nature (2015), https://doi.org/10.1038/nature14964.
- Goncharov et al., *Hydrogen sulfide at high pressure: Change in stoichiometry*, Phys. Rev. B (2016), https://doi.org/10.1103/PhysRevB.93.174105.

Another example: nominal `Tl2Ba2Cu1O6` has 45 source entries spanning a 107 K Tc range. Cuprates can be extraordinarily sensitive to oxygen and hole concentrations, so this observation is a data-provenance investigation target, not proof that the recorded stoichiometry is precise enough to specify each physical sample.

## Readiness boundary

- **Verified:** original-data ingestion, checksum, mathematical audit, independent residual comparison, GitHub Actions.
- **Not verified:** provenance of each original measurement, expert approval, task compliance with the private partner repository, rejection by frontier agents, compensation eligibility.
- **Next scientific work:** retrieve original experimental literature/conditions for the highest-spread examples and build a physically grounded task whose correct output can be validated deterministically.
