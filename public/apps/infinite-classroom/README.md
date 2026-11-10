# Infinite Classroom | Owned learning foundation v0.1

Status: source prototype, NOT a live product, AI tutor, data migration, or legacy cutover.

This is a runnable Evercraft-owned learning slice with no provider SDK, sign-in, analytics, cookies, external calls, or learner data store.

## Local preview
Serve the repository public directory from a local HTTP static server. Open /apps/infinite-classroom/. An HTTP server is needed for ES modules; raw file:// launching can be blocked by browser security.

Run the deterministic challenge tests with: node --test tests/infinite-classroom-owned.test.mjs

## What is working
- Evidence, Water Science and Systems.
- Foundation, Builder and Frontier learning depths.
- Nine newly authored choice-based challenges, guided hints, explanations, completion counter and reset.
- Keyboard-operable accessible labels and mobile responsive layout.
- Temporary in-page progress only; refreshing the page discards it.

These exercises are inspired by the Evercraft Nepal Deep Learning Academy approach. They are not a claim of restoring or republishing the historical curriculum or source tree.

## What is not yet implemented
- Complete source and course parity inventory; migrated historical learner data.
- Approved Luma artwork and guide behavior.
- Auth, educator console, parental consent, stored learner progress, retention/deletion.
- AI tutor, model adapter or model quality/safety evaluation.
- Owned staging deployment, independent route verification and rollback receipts.

## Safeguards
- Do not collect minor profiles, safety disclosures or household data in this source prototype.
- All emergency/infrastructure exercises are hypothetical classroom examples.
- Authored feedback is not a live model response.
- Never route development, build, runtime, data, payments, hosting or fallback through Base44.
- Keep registry/infinite-classroom discovery-only until independent production proof exists.
