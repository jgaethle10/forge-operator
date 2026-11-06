# Observed model-evaluation sensitivity | 2026-10-29

A real `HistGradientBoostingRegressor` was trained with identical hyperparameters and sample counts under two holdout protocols using the **21,263 original UCI superconductivity measurements**. No synthetic scientific measurements were generated. The original archive SHA-256 is pinned to `87f4490d73390ff94ee01dbf0d7d32abc80b22f2c803d471765cfc46a9f6371e`.

| Metric | Random row split | Exact-composition-group split |
|---|---:|---:|
| Train rows | 17,010 | 17,010 |
| Test rows | 4,253 | 4,253 |
| Exact composition groups shared | 1,065 | 0 |
| Held-out rows with composition identity in training | 1,556 | 0 |
| RMSE | 12.678609 K | 12.826133 K |
| MAE | 8.408971 K | 8.703824 K |

Reproducibility: seed `20261029`; normalized elemental-count vectors rounded to 10 decimals; `HistGradientBoostingRegressor(max_iter=100,max_depth=4,learning_rate=0.1,l2_regularization=1.0,random_state=20261029)`.

The two holdout schemes select **different test populations**, so the small score difference cannot be causally attributed to repeated compositions. One seed and one estimator are insufficient for broad model-generalization claims.

**GitHub Actions run:** `40983753735`, success. Complete source audit, split-integrity audit, answer verifier (9/9 wrong claims rejected), and real-data model training all passed. The workflow uploaded a three-file evidence artifact.

**Critical partner requirements, not yet met:** The 2026-10-29 handoff recording specifies human-authored `README.md` and `instruction.md`; no synthetic experimental data or data generator even for a private difficulty screen. Sunny's private repo and complete rubric remain unreadable by the connected GitHub app, though the user's account has access. No expert scientific review, qualified human-written final task, frontier-model failure, compliant partner submission, or payment.

**Provenance limitation:** the 2018 UCI dataset identifies NIMS SuperCon as upstream, but its CSV records do not have per-row original-paper citations or physical phase/pressure provenance. The dataset-level DOI alone does not establish original experiment provenance for each row. See https://archive.ics.uci.edu/dataset/464/superconductivty%2Bdat and https://doi.org/10.1016/j.commatsci.2018.07.052.

**Status:** research evidence, NOT a paid Terminal-Bench-Science submission. Do not use our LLM-produced `TASK_CANDIDATE.md` as a purported human-authored partner submission.
