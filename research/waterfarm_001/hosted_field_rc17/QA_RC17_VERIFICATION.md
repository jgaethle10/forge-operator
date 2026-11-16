# Aqua RC17 verification receipt | November 15, 2026

## Actually executed in isolated local runner
- `node --test tests/*.test.mjs`: **79 / 79 PASS**. Includes fixed-point decimal rejection/difference, previous cache retention and listed asset cache-miss HOLD.
- `python -m unittest discover -s tests -p 'test_*.py' -v`: **4 / 4 PASS** using mock HTTPS responses. No live domain was contacted.
- `python tests/browser_injected_qa.py`: **14 / 14 PASS**, phone 390px and desktop 1365px, with mocked IndexedDB, 15 fictional readings, audit and backup recovery. No page errors.
- Direct `page.goto` to a local HTTP server and to a route-fulfilled synthetic HTTPS address both returned `ERR_BLOCKED_BY_ADMINISTRATOR`. Therefore real hosted-origin IndexedDB, service-worker installation, network caching, offline/relaunch and native Safari **were not tested**.
- Container attempt to retrieve full Yakima 2022/2023 daily NOAA records failed at DNS resolution, and an independent web reader did not provide complete audited station source bytes. The previously documented 2025 missing station observation remains unresolved. **No newly verified multi-year water design result**.

## Release truth
The static ZIP and SHA256 manifest represent exact locally packaged bytes only. No first-party site was staged or deployed, no signed acceptance, no consenting operator measurements, no equipment, laboratory validation, leak detection, water savings, partnership outreach, purchases or real-camera film produced.

## Change notes
- Preserve older offline shell caches when a new worker activates. Increment cache version; never replace an asset from an unpinned network fetch after cache failure.
- Parse cumulative meter values as exact decimal scaled integers and subtract before any floating-point conversion. Reject >6 fractional digits or unsafe scaled magnitudes.
- Preserve original string precision in journal/exports and expose unrounded audit readings plus a display-resolution warning for values below 0.001 L. These do not establish sensor resolution or physically measured accuracy.
