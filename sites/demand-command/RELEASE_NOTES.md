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