# Evercraft Aqua Baseline RC10

Research-stage offline water-meter evidence viewer. It accepts source/irrigation totalizer meter records and pump-energy readings to produce a limited, clearly **unverified** audit. It does not claim leak detection or avoided water withdrawal.

## Start

Open `Evercraft_Aqua_Baseline_RC10.html` in a capable desktop browser. Select **Explore synthetic demo** to see the UI with fictional data; exported demo JSON is also labeled synthetic. Use **Download CSV template** for your own data shape; do not repurpose demo numbers as field records. All data stays within the opened browser page; neither application code nor tests make a network request.

Native iPhone Safari has not been independently tested. Files.app viewers may refuse active HTML; if so, open on a desktop or in a trusted local browser. Never use a public file-conversion website for private operator records.

## Files
- `Evercraft_Aqua_Baseline_RC10.html`: standalone HTML with bundled JS and CSS.
- `app/core.mjs`, `app/index.template.html`, `build.py`: editable sources.
- `tests/aqua-core.test.mjs`: Node.js 30-case validation suite.
- `python/field_audit.py`, `python/test_field_audit.py`: cross-language source patch and test.
- `tests/parity_qa.py`: synthetic numeric parity.
- `browser_qa_rc10.py`: Chromium desktop/mobile viewport QA.
- `FIELD_PILOT_PRECHECK.md`: approval and data contract precheck, no operator committed.
- `RC10_ENGINEERING_DECISION.md`: defect correction, QA, limitations and research direction.

## Repeat tests
```bash
node --test tests/aqua-core.test.mjs
python -m unittest -v python/test_field_audit.py
python tests/parity_qa.py
python browser_qa_rc10.py  # when Chromium + Playwright are installed
python build.py
```

## Release status
No customer, field trial, real-world readings, production hosting, commercial approvals, completed live-action film or public launch established here. The NOAA multi-year/weather and crop baseline research remain tracked separately in the same draft GitHub research PR.