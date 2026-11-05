# Evercraft Aqua Baseline RC09

**Research-stage, offline-first customer-facing prototype.** Does not connect to or control irrigation equipment. No production checkout, deployment, field trial or measured savings claimed.

## Open without installation
Download `Evercraft_Aqua_Baseline_RC09.html` and open it in a browser that permits local HTML. On some mobile apps this requires saving to Files and opening in Safari or another browser; a sandboxed chat preview may block scripts. The delivered HTML includes all CSS/JavaScript and has no third-party dependencies or network endpoints. It is not presently hosted on a public URL.

Use **Explore synthetic demo** to see a clearly labeled fictional example. For actual data, use **Download CSV template** and provide 14 or more consecutive days in liters and kWh. The program never verifies whether a reading or calibration attestation is truthful; the output is for preliminary research review only.

## For developers
- `app/core.mjs` contains pure validation and calculations (runs on Node 22 and current browsers).
- `app/index.template.html` is a standalone UI template with `__CORE_SCRIPT__` injection marker.
- `build.py` inlines tested core into `/mnt/data/Evercraft_Aqua_Baseline_RC09.html` (edit output path if elsewhere).
- `node --test tests/aqua-core.test.mjs`
- `python tests/parity_qa.py` (requires extracted older RC08 source in `src/` as in this package)
- `python tests/browser_qa.py` (headless Chromium + Playwright, available in test environment)
- `python -m unittest discover -s src/aqua_rc08/tests -p 'test_*.py'`

## Protection against misleading scientific claims
**No proven leak, measured savings, ROI, legally permitted reuse, water-quality determination, or site certification.** Confirm meter calibration and hydraulic boundary independently. The current file is not intended to process customer data until a confidentiality/privacy agreement and an independently supervised pilot protocol are in place. No customer data is bundled.

See `RC09_ENGINEERING_DECISION.md` for exact test receipts, limitations and next scientific steps. The real-camera marketing film remains a separate, incomplete production lane.