# Evercraft Aqua Field Notebook RC14

This is an **offline, experimental HTML tool** for recording a single cumulative water meter totalizer daily. It uses original first-party HTML/CSS/JavaScript and performs no network requests. It does **not** connect to hardware, save measurements to a server, authenticate readings or establish conservation outcomes.

## Use

1. Open `Evercraft_Aqua_Field_Notebook_RC14.html` and enter a short meter alias, such as `WELL-A`, and the actual displayed units.
2. Enter one cumulative reading per calendar date, approximately the same clock time. First reading has no pump kWh; subsequent optional values refer to the preceding interval. Future dates and missing days are rejected; do not invent readings.
3. **After each entry**, choose `Download notebook backup` or `Show copyable backup` and store the full JSON outside the preview (for example in a private note or Files). Confirm that you actually saved it. CSV export is also available, but JSON is needed to restore the in-app journal.
4. If the file preview loses local state, before starting a new notebook choose **Import notebook file** or **Paste saved backup** on the first screen. The app validates journal schema and the SHA256 of its normalized CSV. That checksum detects accidental modification, **not** actual meter provenance.
5. At 15 dates, download a provisional 14-calendar-interval water withdrawal audit. It is not calibrated 24-hour flow if reading times varied; it is not a leak or savings report.

## Rebuild and test

```sh
python build.py
node --test tests/test_core.mjs tests/test_journal.mjs
python tests/qa_rc14.py
```

The browser QA requires Python `playwright` and a headless Chromium executable. Native iOS/WebKit testing not available in this environment. Source files, receipts and screenshots are in this package. The only screen recording provided for review showed RC13 in iOS file preview, not persisted state or RC14.

## Safeguards

- JSON/CSV backup is unencrypted user data; keep it in a trusted location and never commit customer files to a public repository.
- Browser-managed localStorage may be blocked, cleared or unavailable in ChatGPT/iOS file previews. A copy message never proves that backup safely reached another app.
- Site consent, water-right and treatment review, calibration, system boundary and plant/energy context must be verified separately. No valves, irrigation controllers or pumps are actuated.
- The UI uses no tracking and no hosted analytics. Running a local static file is not the same as a robust deployed, owned application.
