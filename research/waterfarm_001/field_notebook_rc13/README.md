# Evercraft Aqua RC13 | Field Notebook

**Research stage. Offline-only. Not a licensed water engineering design or field-verified water-savings product.**

## What changed from RC12

RC12 could evaluate an existing CSV. RC13 allows a consenting operator to enter one cumulative source-water totalizer reading per day, without constructing a spreadsheet. It keeps a private device-local draft, supports JSON backup/restore, exports the RC12-compatible CSV, and calculates a *provisional withdrawal baseline* after 15 consecutive observations. All fields are self-reported and unauthenticated. Energy can be omitted; missing is never zero.

The application can be opened directly from `Evercraft_Aqua_Field_Notebook_RC13.html`. It uses no external scripts, HTTP requests, database or cloud account. **LocalStorage is browser-managed, unencrypted and not guaranteed persistent** across file-preview/restart on an iPhone. Export CSV/JSON backups after readings and store privately. Browser testing used injected HTML in Chromium because the current environment blocks local file/localhost navigation; native iPhone Safari wasn't tested.

## Build / tests

From this directory:

```sh
python build.py
node --test tests/test_core.mjs tests/test_journal.mjs
python tests/browser_qa.py
```

Tests are fixture-only. Browser QA uses local injected HTML in headless Chromium and verifies CSS width, CSV/backup/report downloads, a full 15-reading trial and rejection of a corrupted JSON backup. Does not prove Safari persistence, sensor authenticity, physical water conservation or crop performance.

## Data contract

- Required: one real meter alias (letters, digits, hyphen, underscore), fixed units `L`, `US_GAL`, or `M3`, 15 consecutive `YYYY-MM-DD` readings with nondecreasing cumulative totalizer.
- Optional: kWh since *previous* reading. First row blank, no estimated zero substitution. True readings should be collected at consistent local time and carry operator permission.
- Missing day, changed meter, reset/rollover, duplicate date, unsafe precision, fictional meter ID -> HOLD. A qualified analyst must resolve uncertainty rather than fabricating entries.
- Output: documented `OPERATOR_SUPPLIED_UNVERIFIED` source CSV plus JSON report, not a leak alert or savings estimate. A 15-reading interval contains **14 days**, not 15 days of use.
- Existing two-meter RC11 and climate/greenhouse research remain independent.

## Publication and field safety

This is an independent Evercraft-owned prototype, not an authorized connection to a farm. Do not upload identifiable farm records to public GitHub, place instrumentation without permission, connect to pumps/valves, or reuse condensate on crops. Qualified site review, actual customer benefit assessment and applicable regulations remain outstanding.
