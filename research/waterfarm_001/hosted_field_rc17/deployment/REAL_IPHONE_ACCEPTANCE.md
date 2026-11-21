# Owner/operator iPhone acceptance card (NOT YET PERFORMED)

Complete **only after** an approved Evercraft-owned HTTPS site is serving a hash-verified RC16 release. Use synthetic, non-customer meter readings.

1. Open the exact approved `/aqua/` URL in Safari; check that the hostname and HTTPS certificate are correct.
2. Open **Device and offline readiness**. Save the text-only report. An API presence check does not certify storage safety.
3. Install to the Home Screen through Safari's supported share action. Record exact Safari/iOS version, date and host.
4. Create a notebook with a fictional test meter, enter 15 consecutive test readings; export and inspect both CSV and JSON in Files outside the app.
5. Close the app and Safari; reopen from the Home Screen. Verify all 15 entries and the same audit SHA-256.
6. Disconnect the network and force-quit the app; reopen from the Home Screen. Check the full shell loads, the same 15 entries remain and exporting still works.
7. Restore the downloaded backup into a separately clean test profile after checking it is not corrupted. Confirm exact parity and no silent overwrite of existing data.
8. Open two tabs to the same approved app with the same test notebook and attempt conflicting writes. Later write must HOLD until compared, not silently overwrite earlier data.
9. Test one broken/static asset release and service worker update/rollback only in a staging origin, never with real customer records.
10. Sign the acceptance record **only with direct device evidence**. If any item fails, status is HOLD, not production-ready.

Do not record customer names, real meter readings or farm location in this public acceptance record.

## RC17 additional acceptance, NOT done in this research environment
- While an RC16-installed tab is offline, stage an RC17 update to the same owned origin. Verify the older tab can still load its old static assets, finish a test reading, and export backup; then close old tabs and confirm RC17 activation without deleting previous shell cache.
- Simulate one missing RC17 allowlisted cache asset and confirm explicit 503 rather than a mixed new/old/network code load. Restore only from a reviewed release.
- Import 15 fictional cumulative readings with deliberately small positive decimal steps under an independently simulated instrument range. Confirm original reading strings survive CSV/JSON and that unrounded audit fields and the reporting-precision HOLD are present. Do not interpret software precision as instrument precision.
- Record real screenshots, exact host URL, browser/iOS versions, timestamp, and locally exported QA receipt, redacting all meter/site data. Device completion must be explicitly approved before field use.
