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
