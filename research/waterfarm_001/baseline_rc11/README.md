# Evercraft Aqua Baseline RC11

**Not live, not a field trial, not proof of water savings or a licensed engineering design.** Research prototype. All real farm/site data must stay private, not in the public GitHub repository.

## Run locally

Open `Evercraft_Aqua_Baseline_RC11.html` in a modern browser. It contains all its computation, styles, and UI and requests no network resources. Explore the synthetic demo or upload your own consented CSV only on a trusted device. The audit export includes SHA-256 of the exact input and all measured daily rows, which may be sensitive. The hash allows later integrity checks but is not proof of measurement provenance.

Rebuild the one-file HTML from source: `python build.py`. Run JS tests: `node --test tests/aqua-core.test.mjs`. Run Python meter suite: `python -m unittest discover -s python -p 'test_*.py' -v`. Run the new pilot preflight tests: `python -m unittest discover -s tests -p 'test_pilot_gate.py' -v`. Browser smoke test requires Chromium and Playwright: `python browser_qa_rc11.py`.

## Field pilot preflight (local, private, no network)

`pilot/PILOT_MANIFEST_TEMPLATE.json` is intentionally incomplete and fails validation. After the operator has given and documented permission and a qualified reviewer has assembled the genuine private evidence references, run:

`python pilot/pilot_gate.py /path/to/private_manifest.json /path/to/private_meter_readings.csv --out /path/to/private_preflight.json`

This checks documents for consistency and confirms none are missing. It cannot verify signatures, instrument calibration, legal authorization, scope diagram accuracy or real-world savings. No real pilot records were used in this release.

## Evidence controls

The paired water meters measure two different physical boundaries. Their difference can be storage, authorized consumption, diversion, return flow, instrument discrepancy or many other causes. Even a genuine and source-hashed reading does **not** establish leaks, crop benefit or water savings. Read the accompanying `RC11_ENGINEERING_DECISION.md` and `PILOT_FIELD_INTAKE.md` before any external use.