# Evercraft Demand Command | November 19, 2026

**Committed to GitHub:** `sites/demand-command/index.html`, first backend canary, engineering README and tests on feature branch. Draft PR #2261 remains open. **Not merged or deployed.**

### New in this push
- Private token-gated loopback SQLite API at an independent port, leaving existing NextGen services unchanged.
- Deduplicates repeated business/problem signals, regardless of matched offer.
- Requires separate verification evidence fields before a record may be labeled reviewed/verified.
- Uses append-only event timeline with chained hashes and lost-update protection.
- Produces heartbeat and contact-check endpoints without sending, charging, or fabricating provider receipts.
- API smoke tests against a disposable local database and HTTP port.

### Remaining production work
- Real authenticated web UI and data migration, encrypted storage and reviewable retention.
- Live Revenue Desk schema inspection, safe two-way integration, Kaidance/Systemia ingestion.
- Provider-confirmed message delivery + thread-level deduplication and approval policies.
- Real NextGen deployment receipt + private Evercraft URL.

### Private-console extension
- Added `backend/console.html` hosted by the loopback API on `/` and `/console.html`.
- Captures/edits buyer dossiers against SQLite with bearer authentication in session memory only, not localStorage.
- Interactive queues, follow-ups, activity receipts, draft copy, contact-conflict check.
- Added an advisory check for outreach already recorded on the same opportunity or matching business, even where the status was never manually changed to `contacted`.
- Browser JavaScript syntax checked with Node 22. Local HTTP/test harness verified; automated Chromium visual QA was blocked by this environment's browser policy, so no claim of visual acceptance is made.

## v5: Revenue Desk bridge (November 19, 2026)

- Added `backend/revenue_desk_bridge.py`: local read-only Revenue Desk intake, schema checks and explicit dry-run/apply modes.
- Real source ids are retained for idempotency; missing business or concrete pain are blocked for review rather than invented.
- Every imported record is an **unverified signal**. Historical contact is logged as reported activity, not a verified send receipt. Repeating an import does not create duplicate contacts or messages.
- Added five-minute `systemd --user` **dry-run** monitor templates; neither installed nor enabled.
- Added direct bridge integration tests against the Demand API; no changes to Revenue Desk, existing jobs, production workers, or live customer data.