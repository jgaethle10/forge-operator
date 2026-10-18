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
