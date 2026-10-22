# Evercraft Company-Wide CRM: relationship intelligence for KAIDANCE

**Stage:** draft, source-adapter-required. This is a private operational data system. No customer data, email, phone, notes, or payment secrets belong in the public Forge Operator repository, its CI logs, its artifacts, or public Fabric.

## One organism, not another sales app

The CRM is the relationship and operational memory projection across **every** Evercraft division. HUDSON preserves canonical institutional memory and lineage; Systemia admits and sequences work; KAIDANCE performs 300-second reads; the existing Interaction Ledger and Passport govern whether a specific message can be sent. Payments/Raven Nexus/Shipping independently govern checkout, provider-verified payment, refunds, entitlements, fulfillment, settlement. The CRM references those proofs; it does not assume their authority.

**Private relationship model:** identities, people, organizations, company branches, parent/subsidiary and employment edges, referrals, shared households (when consented), multiple roles across divisions, leads/prospects/clients/partners/vendors/talent, contact permissions, replies, last touch, source evidence, promises, appointments, meetings, contracts, proposals, opportunities, quote options, renewals, invoices, payment and delivery references, service histories, field jobs, support cases, issues, campaigns, attribution, risks, ownership, consent and deletion requests, source-sync cursors, dedup candidates, audit decisions and documented next steps. Evidence states remain `verified`, `reported`, `modeled` or `unknown`.

**Division scopes:** EPS, Havenly, Fabric/CHUM, Evercraft Payments, Systemia/Compute, RIVET, Rewards, EventWave/EveryStage, Guardian/Evernest, EverMaps/FAIE/TOWI, Journal/Clip and future products. The same party can have distinct relationships and visibility in multiple divisions; that must never become permission to cross-purpose their sensitive data.

Every meaningful entity needs a stable opaque ID, tenant and division scope, accountability owner, event/source reference, source timestamp, evidence state and lineage, privacy/retention class, actual status, decision history, last activity, next step, due date and proof of resolution. Never silently merge records because an address or surname resembles another. Merge candidates require evidence, human or properly governed authority, and reversible history.

## The heartbeat contract

The private source adapter writes a mode-0600 file named by `EVERCRAFT_CRM_HEARTBEAT_INPUT` on the **owned resident host**, with schema `evercraft.crm.heartbeat-input.v1`:

```json
{
  "schema": "evercraft.crm.heartbeat-input.v1",
  "tenant_id": "evercraft",
  "generated_at": "2026-10-17T19:59:00Z",
  "source_revision": "private-event-watermark-42",
  "connectors": [
    {"source_key":"interaction-ledger","state":"current","checked_at":"2026-10-17T19:59:00Z","evidence_ref":"private:checkpoint-123"}
  ],
  "signals": [
    {"signal_key":"opaque-commitment-id","domain":"relationships","kind":"commitment_overdue","state":"open","severity":"high","evidence_state":"verified","observed_at":"2026-10-17T19:58:00Z","due_at":"2026-10-17T18:00:00Z"}
  ]
}
```

The signal feed is a **bounded, private, incremental projection**, not a full customer export. It includes only opaque keys and review metadata, maximum 50,000 signals and 150 connectors. Supported domains include relationships, revenue, payments, fulfillment, service, support, partnerships, talent, marketing, compliance, operations. Supported kinds include overdue commitments/replies, stalled deals, invoice/checkout/payment verification gaps, service and delivery deadlines, support escalations, renewal/contract deadlines, partner followups, handoff gaps, consent blocks and attribution issues.

Every KAIDANCE field cycle runs `writeCrmHeartbeatArtifacts()`, then includes the generated CRM mission snapshot as a **required** mission-fabric source. The output includes only aggregate per-domain counts, source health, evidence-state counts, hash of revision, counts of overdue/open/review-held signals, and a receipt hash. It never includes raw subject references, contact data, individual amounts or message bodies.

Missing, stale, incorrectly permissioned, oversized, invalid or unavailable private inputs produce explicit holds. There is no implicit zero when a source has not been connected. Source status `current` requires a fresh source timestamp and evidence reference. No CRM signal is `admitted` for autonomous action: Systemia/Passport/Interaction Ledger and the relevant product authorization layer must independently authorize each action.

## Pre-production source sequence

1. Wire the existing Interaction Ledger and Passport as authoritative interaction and consent projections, without copying message bodies.
2. Connect canonical Payments, Raven Nexus and Shipping states with provider-signed evidence; checkout-open never means paid, and verified-paid never implies settled.
3. Connect separately authorized Gmail/Calendar metadata and replies, EPS/Havenly job ledgers, proposals, support and service cases, Rewards, RIVET, Fabric partner and developer flows.
4. Preserve partner-approved attribution baselines. If incremental value cannot be independently explained, claim **no** revenue share.
5. Move read models to a private tenant-isolated PostgreSQL deployment with encryption, backups/restore drills, least-privilege credentials, indexed queries and incremental sync. Add audited data-access policies before any real customer data enters it.
6. Prove consecutive 300-second resident heartbeat reads and recovery on Evercraft Compute with independent timestamp/receipt verification. A scheduled GitHub CI run is not proof of live resident CRM access.

## Testing and safety

`node --test systemia/crm/heartbeat.test.mjs`

Run the KAIDANCE field cycle without `EVERCRAFT_CRM_HEARTBEAT_INPUT`: it must report `source_not_configured` while other mission sources are still processed. Run with a private current file: it must report `read_only` (or `degraded` if a source fails) with no side effects. Change the source file between two cycles: the next read must reflect the change. Audit CI artifacts to ensure **only sanitized files** are uploaded.

The heartbeat does not send emails, call prospects, mutate payment statuses, merge identities, publish offers or enable device autonomy. Sensitive health, child and household data stays purpose-limited in segregated, consent-gated systems; at most minimally authorized references may appear in an appropriate private CRM view. Authority checks and retention rules belong at every read and every action boundary.

## Implemented first private source adapter (staged, not production deployed)

A private Evercraft Interaction Ledger state directory, bound by `EVERCRAFT_INTERACTION_LEDGER_STATE_DIR`, can now feed the CRM reader directly. It reads **the existing** `interaction-events.jsonl` ledger with read-only filesystem access and validates event schema, unique event/idempotency keys and existing SHA-256 event receipts before generating private signals. It never copies an email address, person's name, message body or raw subject reference to the KAIDANCE artifact.

- Overdue open commitments are `commitment_overdue` signals, closed by matching `commitment_fulfilled` or `commitment_cancelled` evidence. Future promises are not overdue.
- An inbound message later than the last outbound on a channel can produce a **reported, review-only** `reply_waiting` signal after four hours. This is a signal for human/context review, not proof that the person expects another message. A channel with an opt-out does not create a new outreach opportunity.
- The adapter never grants permission to email, SMS, DM, phone, charge, invoice or modify the Interaction Ledger. Live sends still require Passport scope, the Interaction Ledger's own contact preflight, exact-message one-time permit and the actual provider receipt.
- Until canonical Payments, EPS, Havenly and partner pipelines are connected, their connectors explicitly report `unavailable`. The aggregate remains `degraded`, even if the Interaction Ledger is current.
- Missing, insecure, corrupt or tampered ledger state yields a classified hold. The current adapter is intended for one trusted local private ledger volume, not general filesystem reads by arbitrary network callers.

**Resident ordering guarantee:** `SystemiaMissionPublisher.syncOnce()` calls the CRM refresh hook **before** reading the CRM snapshot for each resident publication. If that refresh fails, the publisher pushes a new `source_refresh_failed` hold and does not reuse an older snapshot that happens to exist. The independent resident CRM cycle can still emit its own liveness receipt. The GitHub field workflow uses the same CRM resolution path but is not itself proof of a production resident machine or access to the private ledger.

`node --test systemia/crm/*.test.mjs` covers ledger event integrity, meaningful state transitions, privacy, two consecutive KAIDANCE cycles, and publisher fail-closed behavior. The real private service binding, backup/restore, consent audit, tenant-purpose policy, cross-division adapters and live 300-second external observation are still separate release gates.

## Relationship-level memory and contact boundaries

Two common business scenarios are covered by the new relationship policy:

1. A prospective community partner explicitly asks to resume discussion after a busy season. Preserve the exact source thread, what they asked about, the acknowledged no-contact-before window, unresolved questions, meeting status, who owes the next move, and what example or deliverable was promised. When the window opens, emit a **review-needed** signal, never an automatically authorized outreach.
2. A person already involved in live product delivery, financial reconciliation, or operational incident response must NOT enter generic lead-gen flows. Contact intent is constrained to the exact division and purpose; a RIVET billing context cannot authorize Home promotion, for example. Do not guess customer sentiment or infer payment success from someone's promise to process it.

The private `evercraft.crm.relationship-ledger.v1` records relationship-specific stage, kind, effective outbound policy, allowed purposes, not-before and next-review timestamps, evidence-linked timeline events, and owner/decision context. They are read from a protected local file through `EVERCRAFT_CRM_RELATIONSHIP_LEDGER_FILE`. Code and CI contain **only synthetic cases**, not real people's correspondence or email addresses. Public heartbeat outputs have counts and opaque hashes, not the source relationship graph.

A policy result of `allow_to_existing_preflight` **does not permit a send**. Passport, Interaction Ledger, provider and current consent checks are still mandatory, and a paused/manual-review contact stays blocked. The `preflightGovernedContact()` composition entrypoint is staged, but **not yet installed as a mandatory boundary on every production outbound connector**. A future merge and verified executor-by-executor binding must be completed before the company can claim accidental contact is technically prevented everywhere.

Gmail and similar connectors are evidence discovery inputs, not permission for indiscriminate sync, retention or cross-division sharing. Every imported fact must preserve source, date, purpose, consent/retention classification and audit trail. Reconcile later replies before contact. A meeting proposed in October is not a meeting booked unless the calendar or an acceptance reply confirms it.

## Intake contract and contact gate (staged)

Relationship observations are **append-only, source-linked evidence** inside the private ledger, not auto-promotions to the sales funnel. The owner-only \`persistPrivateRelationshipEvidence({file,initial,event,now})\` helper creates protected 0600 state, takes a directory lock, fsyncs and atomically replaces the file, deduplicates repeat event IDs, rejects conflicting event identities, and leaves the existing contact policy intact. No contact names, addresses, raw conversations or approvals are committed in this repository.

New relationships always start \`manual_review_only\` with an empty allowed-purpose set, even if an ingested source claims otherwise. Store exact scheduling requests, source message IDs, material questions, promises, context, and review decisions as private evidence, preserving the original communication. Reconcile provider threads before claiming a meeting was scheduled, a payment settled, or a follow-up completed. A terminal review status requires a separately stored dated evidence reference before its reminder disappears.

\`evaluateGovernedOutreach\` and \`prepareGovernedContactPermit\` enforce this staged sequence for discretionary email/SMS/DM/phone outreach:

1. Match the intended \`target_ref\` to the subject, division and stated purpose; require the exact content to be reviewed.
2. Require the existing operator-gates approval bound to that exact action, **plus independent** \`approvalVerifier\` bound to a protected authority record (identical action fingerprint, approval ID, expiry and \`approved:true\`). Untrusted client-supplied \`human_approval_state\` alone does not suffice. The verifier is trusted backend code, not a request field.
3. Reload the private relationship record from a safe local source on every attempt. Reject absent, paused, manual-review-only, conflicting, out-of-window, wrong-purpose and opt-out relationships.
4. Recheck the existing Passport and Interaction Ledger preflight (including channel opt-outs, unanswered-message ceilings and duplicate send fingerprint). Denial cannot be overridden by CRM notes.
5. Only after all checks, prepare the existing action permit. The CRM **never dispatches** a message. Actual transport, idempotency, permit consumption and provider receipts remain separate mandatory gates.

**Coverage caveat:** the new guard is a source module and is tested with real Passport + Interaction Ledger interfaces; it is not yet wired into every active or third-party outbound transport. Never describe it as global protection until each existing sender and connector is inventoried, wired, and proven to fail closed. The independent People email verification route is account-verification traffic with its own scoped consent, not generic relationship outreach, and must not be casually broken by sales-policy changes. The generic \`systemia/operator-gates/external-action.mjs\` gate is currently called by proofs, not demonstrated as the exclusive outbound transport.

**Private installation still needed:** bind \`EVERCRAFT_CRM_RELATIONSHIP_LEDGER_FILE\` and \`EVERCRAFT_INTERACTION_LEDGER_STATE_DIR\` to the same owner-controlled admitted compute environment as the KAIDANCE publisher. Wire a trusted approval verifier and every discretionary delivery adapter to the governed permit entrypoint; verify authorization revocation, backup/restore, clock skew, stale snapshots, source sync, contact-merge collisions and a real read-only 300-second production observation. Do not put any real prospect/customer relationships into GitHub, logs, or public Fabric.

## Evidence versus operator decisions

\`relationship-ingest.mjs\` appends source-tethered events into the private ledger. Its default is **manual-review-only** with zero automatically allowed outreach purposes. Event duplication is idempotent; a conflicting replay cannot overwrite history. The protected writer requires a private parent directory and writes atomically under a lock.

\`relationship-decision.mjs\` handles restricted operator decisions as a **separate path**. Closing/snoozing a due follow-up or changing the policy requires an independently checked, unexpired approval tied to the exact decision fingerprint, the actor, original ledger revision, relationship reference, and evidence. The resulting change appends an auditable \`relationship_changed\` timeline event. A decision only changes private CRM policy; Passport contact authority and approval for the exact outbound message are still independently required.

A completed review drops from the heartbeat only after a recorded terminal state, timestamp and evidence. A follow-up date passing does NOT turn an entity into a cold lead. A no-contact event remains a hard relationship-policy hold even if another record attempts to widen allowed purposes.

The remaining production integration work is to mount an owned private CRM store, reconcile actual Gmail/thread and other authoritative sources into records with scoped retention, bind an operator-controlled verifier to the decision/intake services, wire every discretionary sender through \`prepareGovernedContactPermit\`, and verify real-world receipt and rejection behavior. **No real-world partner record or outreach event is created merely by landing this code.**

## Local private intake and independent approval verification (staged October 22)

**No real people, companies, or their correspondence are seeded in source control.**
The only safe place for those records is an owner-controlled private state
directory on admitted Evercraft Compute.

A trusted operator or ingestion worker can prepare a private 0600 evidence file
with one \`evercraft.crm.source-evidence-envelope.v1\` object containing
\`initial\` (opaque relationship/subject IDs, division, type, initial status,
source reference and review window) and \`event\` (unique source event reference,
event type, actual occurrence time, evidence reference and optional private
context/source message reference). The enclosing directory must be 0700. Run:

\`\`\`bash
node systemia/crm/relationship-ingest-cli.mjs \
  --evidence-file /private/evercraft/source-evidence.json \
  --relationship-ledger-file /private/evercraft/relationships.json
\`\`\`

The CLI reads its input from the verified private file descriptor, appends one
event under a private mutation lock, writes an atomic 0600 CRM ledger, and
prints only a schema, state, opaque hash, and no-contact-authority flags.
Replay of the same event is idempotent; changed content on the same event ID
is a conflict. A newly discovered relationship is **manual_review_only**,
without automatically allowed purposes. Unsafe permissions or invalid
evidence emit only a redacted hold receipt and exit nonzero.

**Signed operator approvals** are read by
\`createPrivateApprovalVerifiers({approvalFile,keyFile})\`. The protected approval
file must have schema \`evercraft.crm.private-approvals.v1\`, tenant
\`evercraft\`, a list of individually HMAC-SHA256 signed
\`evercraft.crm.approval.v1\` grants, explicit revocations, and a second
signature covering the entire ledger (including revocations). The owner-held
key file must be 0600, contain 32 to 256 key bytes, and live in a protected
directory. The key is never put in logs, public artifacts or the repository.
An approved record is not a permit and is never sufficient without fresh
relationship review, Passport and Interaction Ledger. Approved action
fingerprints bind division, purpose, actor, target, subject and exact content.
A replay of an **older but authentic signed approval-ledger snapshot** is
not yet prevented by an independently anchored monotonic version: prevent
rollback using locked-down backend access and add a durable trusted watermark
before production. Creation/signing of approval entries must be implemented
behind authenticated operator identity, not a public/agent endpoint.

\`prepareContactWithPrivateAuthority\` is the trusted-backend entrypoint.
Unlike lower-level proofs, it accepts **no caller-supplied approval callback**;
it uses a private signed authority verifier and then calls the governed
relationship, Passport and Interaction Ledger checks. It only prepares a
permit. No email/DM/SMS transport currently consumes these permits in this
PR. Existing provider-specific verifications such as People account email
proofs have different authority and must be separately audited, not
automatically treated as discretionary CRM outreach.

**Release remains blocked on:** real private-state bind, authenticated
approval issuance and protected anti-rollback watermark, explicit ownership
and retention policy, source coverage for every Evercraft division, actual
sender-by-sender enforcement, real recipient resolution at transport, exactly
once send/permit/provider receipt reconciliation, cross-device/restart
verification, encrypted backup/restore, and a 300-second live-system proof.
