# Condensed-matter task candidate: audit critical-temperature generalization

**Status:** internal benchmark candidate, NOT approved for a paid task.

**Source:** Kam Hamidieh (2018), UCI *Superconductivty Data*, DOI 10.24432/C53P47, CC BY 4.0. Use observed measurements only. The authentic source ZIP must pass the pinned SHA-256 check.

## Scientific scenario

A laboratory claims that a random 80/20 train/test split reliably estimates superconducting critical-temperature generalization to new chemical compositions. Assess this claim rigorously using the original measured material records. Important: an elemental formula is not a complete specification of crystal structure, synthesis, phase, pressure, doping or measurement conditions.

## Deliverable specification

Output two JSON reports compatible with the schemas in the reference scripts, plus a scientifically careful interpretation. The fully blinded benchmark must keep expected answers, reference code, and hidden grading separate from task input.

1. Fetch and authenticate the observed UCI data, check target alignment, and preserve every measured critical temperature (Tc).
2. Group by normalized elemental-count vector rounded to 10 decimal places. Compute unique/repeated-group counts, discordance, and affected observation counts.
3. Prove the in-sample squared-error minimizing predictor constrained to one Tc per group is the within-group mean, then compute its root mean squared error. Explicitly limit this claim to the given dataset and representation.
4. Using NumPy generator seed 20261029, compare an 80/20 row-randomized holdout with a composition-group-aware holdout of matching row counts. Quantify exact composition overlap between train and test, and independently verify that group-aware holdout blocks this exact overlap.
5. Distinguish identity leakage from a numeric estimate of an ML model's accuracy inflation. Explain why a same-composition label disagreement need not imply invalid experimental data.
6. Identify a source-observed large Tc disagreement and state what physical experimental provenance (phase, pressure, synthesis, structure, etc.) must be investigated before drawing a physical conclusion.

## Evaluation boundaries

- Numerical results are checked by verify_candidate.py against independently cross-checked, actual-data-derived receipts. The verifier tests nine mutated, deliberately wrong submitted claims; these are **not fabricated physical measurement datasets**.
- Independent physical-sciences expert review is still necessary for the scientific interpretation.
- The challenge has **not** yet been administered to Sunny's required frontier systems, demonstrated to defeat them, or shown to meet the private handoff rubric.
- No acceptance, credentials, payment, or external model failure is claimed.

See run.py, split_integrity.py, verify_candidate.py, and SPLIT_INTEGRITY_FINDINGS.md.
