# Evercraft Aqua RC03: evidence-first water intelligence

A runnable, **research-only** code package for water-use evaluation; not a deployed treatment or control system and not a claim of verified freshwater production.

## Run
From the package directory (Python 3.10+):

    python -m unittest discover -s tests -p 'test_*.py' -v
    python science/evidence_gate.py

All demo observations are **synthetic**. No NOAA daily data or greenhouse samples are supplied.

## New science files
- `science/evidence_gate.py` requires actual paired readings and strict evidence gates, caps candidate water-offset signals at safe physically reused volume and conservative uncertainty bounds, and estimates crop-water requirements using ETc=Kc×ETr. Candidate results are **never causal proof**.
- `science/greenhouse_trial.py` was **corrected** to produce `HOLD_LEGACY_REQUIRES_PREREGISTERED_CAUSAL_REVIEW` and zero verified water savings. Its old field name is retained for compatibility only; it should be replaced by a versioned evidence contract before production.
- `tests/test_evidence_gate.py` adds 18 new cases. RC02's 12 original tests remain.
- `SCIENCE_DECISION_RC03.md` records honest evidence, value/energy break-even, site/permitting gates and source references.
- `film/` remains the RC02 **real-footage gated compiler**, not an uploaded actual film. No acquired camera video in this package.

## Liability and claims
Never connect experimental condensate to crops, municipal/potable supplies or irrigation without permits, qualified design and demonstrated quality. Require owner approval for equipment costs, partner outreach, publication or active deployment. Input flags are supplied assertions, not authenticated records. Do not build hardware or issue customer water advice solely from this software.
