# Observed SuperCon data split integrity audit

**Source:** Hamidieh (2018), UCI Superconductivty, DOI https://doi.org/10.24432/C53P47; CC BY 4.0.
**Exact source SHA-256:** `87f4490d73390ff94ee01dbf0d7d32abc80b22f2c803d471765cfc46a9f6371e`.
**GitHub Actions audit:** run `40871145572`, job `observed-supercon`, passed; output artifact `supercon-observed-receipts`.
**Data:** 21,263 original observations; no synthetic source measurements or fabricated labels.

## Independently checked results

Split selection uses NumPy RNG seed `20261029` and the exact same UCI data, with material identity approximated by normalized elemental-count vectors rounded to 10 decimal places.

| Measure | Random row split | Group-aware split |
| --- | ---: | ---: |
| Train rows | 17,010 | 17,010 |
| Test rows | 4,253 | 4,253 |
| Composition groups shared by train and test | 1,065 | 0 |
| Held-out rows whose exact composition appears in training | 1,556 | 0 |
| Test-set exact-composition overlap | 36.5859% | 0% |

The group-overlap computation is cross-checked with an independent `np.intersect1d` computation. The original audit separately verified within-composition label inconsistency using independent residual calculations.

## Scientific interpretation and limitations

This is a **data leakage diagnostic**, not a measured accuracy inflation percentage. A held-out sample sharing a normalized composition with training may be physically distinct because crystal structure, phase, doping, pressure, synthesis, and experimental conditions are incompletely represented. A group-aware split eliminates exact-composition identity leakage under the defined normalization, **not** broader compositional-family correlation or all forms of scientific confounding.

The simple composition memorizer baseline is for diagnosis only: its random-holdout RMSE is **27.415276 K**. It must not be cited as an apples-to-apples comparison to a trained ML model under group split.

The published 3DSC study specifically discusses random-split overconfidence and structural incompleteness:
- *3DSC - a dataset of superconductors including crystal structures*, Scientific Data (2023), https://doi.org/10.1038/s41597-023-02721-y

## Readiness gate

The scientific audit and split checks are executable and successful in CI. Still missing for a paid Terminal-Bench-Science task: verified private handoff specification, independent domain expert validation, a task whose answer requires substantial physical-sciences judgment, and empirical failure on Sunny's target frontier models. Do not claim acceptance, payments, or model failure based on this audit alone.
