# Engineering intake and fencing: isolated pilot (2026-11-26)

Directives: #2260 comment 7204010397; #758 comment 7203979859; release-writer audit #1313.
Audited base 42d1fcfc7004a4347c942e43ea73324825c20621.

- Mission bridge is observe-only; a comment is not a mission admission.
- Intake Fabric already authenticates adapters and admission, but duplicate operation/event IDs do not bind changed payloads. The pilot adapter adds canonical fingerprint and stable identity checks before admission.
- Passport and Execution Gate bind requests and permits, not semantic path conflicts or actual Git ref writes. Existing duplicate start may return dispatch_allowed; pilot rejects duplicate starts and journals intent before gate/writer.
- Durable goal dispatch has a persisted pre-call checkpoint and unknown-effect hold. The pilot uses actual durable goal dispatch for the fixed read-only candidate tree verifier and requires a bound completed receipt at the writer; stateful dispatch is still a separate approval/reconciliation boundary.
- Lineage has local CAS and stale object preservation. The pilot exercises existing CAS separately; Git remains canonical.
- Existing Intake/Gate mutation locks can remove old locks by age. No production safety claim; pilot writer lock has no age-based stealing. Broader writer inventory (#1313), authentication, revocation races, external CI/review, stateful durable goal connection, heartbeat admission and two owned receipts remain blockers.
- No scheduler, remote API, production path, source release or FindMyPart change. The temporary bare Git repository has no remote; fixed synthetic ref, trusted test fixture only. Independent preparation can overlap; actual integration is serial. Stale artifact is retained for rebase/retest. The fixed local synthetic tree check is executed through the durable verifier and repeated at the writer; independent CI/review is not yet bound. Expired reservations/unknown intent hold rather than reclaim.
- This is an initial proof, not authorization to relax single-thread engineering or deploy. Required follow-ups: process-crash/unknown write reconciliation, revocation and rename/deletion negatives, release rollback, complete #1313 writer inventory, authorized durable-goal + Kaidance pilot, independent owned acceptance.
