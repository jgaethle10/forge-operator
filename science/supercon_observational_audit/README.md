# Evercraft observed SuperCon pilot (Condensed Matter)

This is a **working first-pass data provenance and scientific consistency audit**, not a paid-task submission or evidence of frontier-model failure.

The task retrieves the original UCI dataset (DOI 10.24432/C53P47, CC BY 4.0); verifies the pinned archive SHA-256, original row count and target alignment; groups equivalent elemental stoichiometries; then calculates the smallest achievable **in-sample** RMSE for any predictor constrained to one critical temperature per composition. An independently grouped residual computation checks the result.

The original data are observational, not synthetically generated. A repeated chemical formula is **not** proof of an identical crystal structure or physical experiment. Differences in phase, pressure, synthesis and measurement may explain some disagreements.

GitHub Actions runs on this branch's pull request and stores a JSON receipt under `supercon-observed-receipt`. Full-science validation, Turing handoff requirements and expert review remain outstanding. Nothing has been submitted to Sunny's private repository.

**Source**: Kam Hamidieh (2018), *Superconductivty Data*, UCI Machine Learning Repository. https://doi.org/10.24432/C53P47. CC BY 4.0.

**Run:** `python -m pip install numpy pandas && python science/supercon_observational_audit/run.py`.
