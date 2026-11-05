# Systemia historical-memory source audit | 2026-11-05

**Status:** repository-source audit + draft implementation, **not** a production-data audit or live deployment verification.

**Boundary:** all files cited here are already in Evercraft's own `jgaethle10/forge-operator` repository. This audit does not fetch Base44 or move private records into GitHub. No invented business events, payment receipts, or customer histories are used.

## The architecture already documented

| System / canonical source | Evidence available in source | Historical question it can help answer | Boundary |
|---|---|---|---|
| `systemia/identity/README.md` | Opaque subject identities, session authorization/revocation | Who was the authenticated actor? | Identity proves actor; does not grant scopes |
| `systemia/passport/README.md`, `passport.mjs` | Scoped grants, delegations, revocations, action permits | Who has access **now** to view historical evidence? | Historical grants are evidence, not renewed current authority |
| `systemia/context-fabric/README.md`, `fabric.mjs` | Append-only claim records, observation/validity windows, source refs, retractions, supersession, conflicts, hashes | What claims were recorded and when? | Source content is not trusted instructions or authenticated truth |
| `systemia/context-fabric/receipt-bridge.mjs` | Verified projections for completed Execution Gate leases, accepted intake packets, mission admission | Which independently checked machine receipts were projected to shared context? | Only implemented receipt types; projection does not grant execution |
| `systemia/lineage/README.md`, `core.mjs` | Immutable artifacts, tree/commit DAG, transaction receipts, actor/rationale/authority metadata | What changed in an artifact or workflow release? | A commit is not proof of public deployment |
| `systemia/interaction-ledger/README.md`, `ledger.mjs` | Opt-outs, duplicate suppression, channel preferences, commitments and contact receipts | What outreach/promise did the relationship ledger actually record? | Contact preflight is not sending permission |
| `systemia/execution-gate/README.md` | Prepare/start/complete leases, exact request fingerprints, outcome evidence | What execution was authorized and then evidenced? | Prepared != started; started != completed |
| `systemia/organism/README.md` | Shared mission state, fresh-memory checks, work receipts, reconciliation | Why was work held, admitted or considered complete? | Coordination proof != live outcome |
| `systemia/payments/README.md` | Evercraft payment orders, provider boundary, settlement and reversals | Was there an authoritative order/paid provider receipt? | A checkout URL or Stripe response is not proof of payment |
| `systemia/shipping/README.md` | Frozen manifest, send acceptance, sent-copy readback, delivery receipt | Was an exact customer-safe package verified delivered? | Provider acceptance != customer acceptance |
| `systemia/research-service/README.md` | Source captures, evidence states, conflict ledger, verified digest, draft reports | What evidence supported a research conclusion? | Capture verification is not truth verification |
| `systemia/notification-fabric/README.md` | Recipient notifications, inbox states and receipts | Was an event routed, seen or acknowledged? | Gateway acceptance != human delivery |

These are **documented source contracts**, not a claim that every adapter is deployed or every event ingested.

## What Timewalk v0.1 adds

1. Two separate clocks: `known_at` = Context Fabric `record.created_at`, and `valid_at` = explicitly declared effective time or conservatively `observed_at`.
2. A **server-clock** Passport-authorized snapshot of only visible records. No caller-supplied `authorization_at`; time travel never revives revoked/expired access.
3. Source refs, evidence labels and hash receipts for each returned claim. SHA-256 here is **tamper evidence**, not a digital signature or proof that the underlying statement is true.
4. Historical supersession only after a correction was actually recorded; active contradicting claims are shown together.
5. Retractions recorded after this change have a second clock (`created_at`) separate from the user-provided `retracted_at` event time.
6. **Legacy retractions** lacking creation time are marked `retraction_time_unverified`, never silently assigned a fictitious learning date.
7. Bounded internal snapshot (5000 authorized matching records) and bounded projection. Overflow fails closed at the snapshot layer; display truncation is disclosed with `complete: false`.
8. No new database, third-party code, network ingress, agent execution power or production rollout.

## Unresolved gaps worth documenting, not guessing away

| Gap | Present state | Consequence / next evidence gate |
|---|---|---|
| Historical coverage | Only events actually projected into Context Fabric can be reconstructed | Index and reconcile source receipt families, track missing source periods |
| True effective time | Many records have no explicit `valid_from` | Label observed-time fallback; do not assert retroactive historical validity |
| Historic legacy retractions | Older `retracted_at` has no independent ingestion clock | Flag uncertain; no made-up correction dates |
| Historical permission snapshots | Never used to grant read access | Require a real present-day Passport identity/session before any external API |
| End-to-end integrity | Context records use unkeyed SHA-256 | Verify against authoritative source receipts; consider signed/anchored checkpoints |
| Concurrency consistency | Context store is append-only JSONL and read refreshes are not transactional across all files | Add consistent snapshot/version watermark, stress tests, and immutable cursors |
| Search scalability | Current Timewalk v0.1 scans authorized history; Context Fabric v1 retrieval is lexical | Introduce indexed/cursor-based bounded queries and measure scale |
| Decisions and causal provenance | Separate mission, Lineage and execution receipts exist | Build explicit typed edges; do not infer causal approval chains from timestamps |
| Tenant isolation | Passport scopes exist, but this is not an externally authenticated service | Security review identity binding, namespace/resource scoping, tenant and retention policy |
| Privacy/erasure | Append-only operational history is not an excuse to retain private data indefinitely | Define minimization, redaction, lawful retention and erasure exceptions before ingest expansion |
| Independent verification | Synthetic tests are useful, not live deployment evidence | Run native Context Fabric + Passport tests, CI and private-machine canaries |
| External data | No Utopia ingestion, DB creds, production logs, private user/customer data | Keep third-party exploration isolated and synthetic |

## Evidence boundaries (anti-false-green)

- A repository file proves **source exists**, not that an agent ran it.
- A unit test proves code behavior under its fixtures, not current production readiness.
- A source reference and digest prove a claimed linkage only after the authoritative source validates it.
- A payment order is not a paid settlement; a verified delivery is not customer approval.
- Context retrieval never upgrades `modeled` to `observed` and never turns retrieved text into an instruction.
- Legacy provider references in historical docs are compatibility evidence, not permission to contact those providers.
- **Never publish** private Systemia topology, mission/user identity, keys, financial details, direct customer records, or actual context snapshots from private machines into this public repository.

## Next implementation sequence

1. Run native Passport + Context Fabric integration tests against temporary synthetic state; explicitly test expired and revoked grants.
2. Repair context-retraction clock migration and receipt integrity regressions without reassigning old timestamps.
3. Add private query adapter tied to authenticated actor; validate current scopes at the call boundary, not an untrusted actor string.
4. Reconcile specific receipt families, beginning with mission/admission/execution, and record coverage percentages with explicit missing spans.
5. Add authorization-aware pagination, deterministic immutable snapshot watermark, archival privacy rules and observability.
6. Only then consider a production-only, read-only canary with a proper deployment receipt.

**Runtime doctrine:** GitHub is canonical source; Systemia routes authorized work; Yard/Evercraft Compute owns production capacity. This draft changes no production target.

## Test commands

```bash
node --test systemia/context-fabric/timewalk/timewalk.test.mjs
node --test systemia/context-fabric/fabric.test.mjs
```

See `README.md` for the query contract and semantics.
