# Emergency Base44 evacuation: Saban batch 001

Founder directive: Move Evercraft production off Base44 without paying to reactivate that platform.

**Scope:** the authenticated metadata snapshot covers four urgent applications and 132 observed *schema definitions*, **not** 132 data rows or extracted application source files. This is not a full inventory of the 100+ app estate. No production websites, databases, domains, customer data, authentications or payment flows have been moved by this branch.

The Saban source factory in this branch comes from existing draft PR #653 rather than an unrelated design. It is isolated to the factory's contract, runner, adapter and proof and avoids merging #653's stale control-plane/workflow changes wholesale. The active Base44 exit policy in main remains canonical.

Run `node systemia/migrations/base44-exit/factory/proof.mjs`, `node --test systemia/migrations/base44-exit/factory/urgent-batch.test.mjs`, then `node systemia/saban/multiplier.mjs --software base44-evac --fixed --agents 40 --workers 4 --execute --reconcile`.

This fans out ten bounded specialist roles per observed application in parallel. The resulting receipt is **planning and verification of blockers**, not an execution of extraction, deployment, source decommission, or a claim that remotely enrolled Saban compute nodes executed jobs. GitHub runners supply this batch's physically bounded execution. All intents are denied by default except local plan/receipt creation.

## Next actual delivery gates

- **Immediate public availability:** Roman's campaign site currently returns HTTP 402 to independent probes. PR #1380 captures route/headers. Site restoration requires an owned-hosted replacement with exact public parity, independent browser tests, safe DNS control, and explicit cutover receipt. No changing political content.
- **EPS and Havenly:** preserve public service/contact pages and quote/lead submissions first, then rehome storage, auth, subscriptions, payment records and the internal command centers. Record confirmed source assets and endpoints before declaring an owned staging build.
- **Systemia:** port the core orchestration, KAIDANCE cycle, receipt ledger, identity/data boundary, and release authority before upgrading worker permissions or retiring old state.
- **Source recovery:** Direct Base44 sandbox source access was rejected by the provider due to plan level. Do not assume schema reads contain source code or user records. Search authorized local, Drive and GitHub archives, obtain approved source/export where available, or rebuild from authorized evidence without claiming parity.
- **Private data:** never place leads, users, payment records, credentials, private Base44 IDs or source archives in this public repository. Private encrypted backups and row-by-row reconciliation must precede live migration.
- **Production:** keep public domain and any functioning legacy route unchanged until an owned replacement is independently verified, then perform separately authorized cutover and rollback verification.

Readiness is fail-closed. End goal is a fully owned runtime, not more diagrams.
