# HAVENLY private quote intake boundary

**Status: contract-only, not connected to the public website.** This module defines an inert Intake Fabric candidate for a future Evercraft-owned first-party server adapter, using the same trust boundary as EPS.

The public HAVENLY website in PR #1664 currently prepares customer-reviewed SMS/email drafts. It **does not** call this module and does not store, deliver, book, or receive requests server-side.

Before enabling a real customer submission endpoint:
1. Deploy a first-party HTTPS adapter with explicit scoped Passport intake.write.form authority, content-size limits, server-side validation and spam/rate limits.
2. Keep customer names, phone numbers, property details, and special needs in authenticated private storage. Never publish records or raw request bodies to GitHub, public receipts, browser analytics or diagnostic logs.
3. Pass validated payloads through buildHavenlyIntakeCandidate and the authorized Intake Fabric ingress, with deduplication and a real storage receipt.
4. Provide owner-authenticated lead review and verified notification delivery, an opt-out and a retention/deletion policy.
5. Test a voluntary real-device submission from start to private inbox, acknowledgment and follow-up. Only then switch the website from text/email handoff.
6. Keep quote request, price approval, appointment acceptance and payment as separate explicit steps. No automatic booking or payment claim.

The draft receipt helper explicitly returns accepted_for_intake:false and delivery_verified:false. Do not expose its output as evidence that a lead was received.

Run: `node --test systemia/havenly/public-quote-intake.test.mjs`
