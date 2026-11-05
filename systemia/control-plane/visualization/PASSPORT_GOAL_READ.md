# Systemia Passport-Gated Goal Visual Read v0.1

This is a **trusted-runtime internal module**, not an HTTP endpoint or a production deployment. It reuses Evercraft Passport and Systemia goal-store to authorize **one** goal-state read and produce a redacted Living Graph snapshot. It does not grant access to the original mission record.

## Intended trusted call

Import readPassportScopedGoalVisualSnapshot from passport-goal-read.mjs into a future owned, authenticated Systemia service.

The caller must supply passportStateDir and goalStateDir from **trusted server configuration**, verifiedSubjectRef from the **existing authoritative Identity boundary**, a validated goalKey and a trusted clock. Never accept those directory arguments, a claimed subject, or a forged identity header directly from clients.

The module only opens goalStateDir/GOAL_KEY.json, with a bounded ID and file size, after Passport checks:

- product = systemia
- scope = mission.visual.read
- resource_ref = goal:GOAL_KEY
- currently active grant covering the **exact** resource

The additional resource check rejects unrestricted Passport grants even if the general authorize() method would permit them. Recheck authorization immediately before returning to reduce revocation races.

## What a successful response proves

Only that the local Passport state authorized the subject reference supplied by the caller for that exact mission at the evaluated time, and that a locally persisted Systemia goal file was projected into the Living Graph's existing schema.

It does **not** prove the caller's identity (that occurs upstream), independent execution success, signature authenticity, production health, payment, fulfillment or revenue. The response retains zero verified receipts and execution_authority_granted=false.

The projection excludes raw goal/mission IDs, agent names, objectives, contacts, user data, raw blockers and evidence or receipt identifiers. It contains ordinal task nodes, statuses explicitly marked as reported or held, timestamps, and counts of missing/reference-only evidence.

## Review before any network deployment

The module must be invoked only inside a hardened owned service that binds authenticated identity and fixed configuration. Do not serve it as a direct unauthenticated HTTP endpoint. Test on Node001 and NextGen with a dedicated service account, confined private state directories and no untrusted local file writer. Add independent signed receipt and effect verification separately; do not promote caller claims.

## Verification

    node --test systemia/control-plane/visualization/passport-goal-read.test.mjs

The CI fixture issues synthetic local test grants; it does not create production Passport grants or exercise a live identity session.
