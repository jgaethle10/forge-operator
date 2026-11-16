# Evercraft Aqua | RC17 offline reliability + exact meter arithmetic

**Research-only, unmerged, never claims measured water savings.**

This build extends RC16 with two fixed risks:
1. A new service worker must **not delete previous cached shells**: older tabs might still need them during offline operation. Previous Aqua shell caches remain; their eventual cleanup requires an independently reviewed plan. A missing listed asset returns a 503 HOLD; the worker does **not** fetch a different version from the network and mix releases.
2. Cumulative meter arithmetic uses **fixed-point BigInt subtraction** (up to six decimal places, with exactly representable scaled integers). Input with more precision than can be represented is refused. Full unrounded volume is included in the audit alongside the existing three-decimal display. A reporting-precision flag indicates nonzero totals hidden by rounding. Original formatted meter readings are preserved in exports.

A downloaded RC14 file-preview notebook **does not migrate automatically** into an RC17 hosted-origin IndexedDB notebook; use explicit external backup export and verified import.

## What RC17 does not prove

No actual HTTPS hosting, Safari/Home Screen launch, genuine offline restart, local encrypted vault, instrument calibration, rights approval or water-saving result has been demonstrated. Chrome tests in this execution environment use DOM injection and mocked IndexedDB; browser navigation to localhost was explicitly blocked by administrator. A reviewer must perform physical-device acceptance before any production deployment or operator data import.

## Test and packaging

Run from this folder:

```bash
node --test tests/*.test.mjs
python -m unittest discover -s tests -p 'test_*.py' -v
python tests/browser_injected_qa.py
python deployment/verify_hosted.py --url https://OWNER-APPROVED-DOMAIN/aqua/ --expected-host OWNER-APPROVED-DOMAIN
```

The final verification command is **read-only** and should be used only with an owner-approved live HTTPS host. See `RC17_ENGINEERING_DECISION.md`, `deployment/REAL_IPHONE_ACCEPTANCE.md`, and `RC17_RELEASE_SHA256.json`.
