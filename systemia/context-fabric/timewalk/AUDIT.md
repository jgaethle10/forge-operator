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
2. A **server-clock** Passport-authorized snapshot of only visible records, using both namespace read scope **and the fact's entity/record resource reference**. No caller-supplied `authorization_at`; time travel never revives revoked/expired access.
3. Source refs, evidence labels and hash receipts for each returned claim. SHA-256 here is **tamper evidence**, not a digital signature or proof that the underlying statement is true.
4. Historical supersession only after a correction was actually recorded; active contradicting claims are shown together.
5. Retractions recorded after this change have a second clock (`created_at`) separate from the user-provided `retracted_at` event time.
6. **Legacy retractions** lacking creation time are marked `retraction_time_unverified`, never silently assigned a fictitious learning date.
7. Bounded internal snapshot (5000 authorized matching records) and bounded projection. Overflow fails closed at the snapshot layer; display truncation is disclosed with `complete: false`.
8. No new database, third-party code, network ingress, agent execution power or production rollout.

## Verified source-to-Context receipt projection inventory

As inspected in `systemia/context-fabric/receipt-bridge.mjs`:

| Receipt family | Explicit existing projection handler | Nature of evidence |
|---|---|---|
| `evercraft.execution-gate.lease-event.v1` | `projectExecutionCompletion` | Completed execution lease with outcome evidence reference |
| `evercraft.intake.systemia-admission-packet.v1` | `projectIntakeAdmission` | Accepted intake packet with no execution authority |
| `evercraft.systemia.mission-admission-receipt.v1` | `projectMissionAdmission` | Mission admitted or held, not proof of execution |

`coverage.mjs` measures **currently authorized visible Context records** by
the schemas above. It checks the Context record/retraction SHA-256 hashes,
but it **does not re-fetch or independently verify** original upstream source
receipts, nor measure the completeness of those upstream ledgers. The unit
test reads the actual bridge switch cases to catch source/manifest drift.

These domains have documented evidence contracts but **no handler in this
particular Context Receipt Bridge** as currently inspected: Payments,
Shipping, Lineage, Interaction Ledger and Notification Fabric. Their lack
of a handler is **not a claim that the domain lacks its own historical
storage, receipts, activity or a separate data route**.

A complete commercial or operational history requires an explicit source
inventory, bounded retrieval and independent validation of its originating
receipts. A company-wide coverage ratio **cannot be computed** from this
Context-only view because its global denominator is unknown.

## Origin attestations are a NEW signing contract, not recovered history

Timewalk's optional `origin-attestation.mjs` verifier checks Ed25519
signatures over the receipt object's **JSON.stringify serialization/digest** using operator-pinned
public keys, issuer ID, schema allowlist, key validity and revocation.

Status tiers must remain separate:

1. **Context record hash valid**: stored memory bytes are internally
   consistent with their recorded digest. No external origin claim.
2. **Receipt digest and projection consistent**: Context fields and exact
   summary match receipt bytes returned by a read-only adapter. The
   adapter's source identity has not been independently authenticated.
3. **Signed under an operator-pinned key**: a signature is valid for an
   attestor key in the supplied registry and binds that receipt object.
   This demonstrates key possession, not independently proven ownership
   of a legitimate production service or the truth of the receipt.
4. **Authoritative origin verified**: NOT IMPLEMENTED. Requires
   separately reviewed service identity, trusted key issuance/custody,
   rotation/revocation, protected read-only ledgers and production canary.
5. **Historical event truth and full coverage**: NOT PROVEN even at
   level 4. Requires independently verified event completion receipts
   and source-ledger coverage reconciliation.

Historical Context receipts without a separately issued attestation
remain **unsigned/unattested**. No synthetic backfill or private-key
material is committed. Unit tests generate ephemeral Ed25519 keys in
memory using synthetic receipts only.

## Physical read-only source adapter: Execution Gate

Inspected existing source: `systemia/execution-gate/gate.mjs`.

- `EvercraftExecutionGate` uses the **existing** state file
  `execution-lease-events.jsonl` under its configured state directory.
- The internal `#append` stamps receipts and appends them to this JSONL.
  `completeExecution` emits a `completed` lease event with an
  `outcome_evidence_ref` and `outcome_state`.
- The read-only `timewalk/execution-ledger-reader.mjs` can reconstruct
  the **serialized receipt object** for a matching digest, without writing
  to the source file or calling a remote service.
- The reader checks the whole bounded input for tampering and torn writes
  before serving a lookup. It snapshots at most 16 MiB / 20,000 events and
  requires a private, nonsymlinked regular file.
- Its source data is provided only after Context Fabric's current-time,
  per-resource Passport authorization; results from the reconciler are
  aggregate counts, never the private raw source records.
- A consistent hash is not an independently authenticated receipt origin.
  No production source was read in this research PR.

**Intake/mission limits:** The inspected Intake Fabric builds a Systemia
admission packet by combining a candidate and an admission decision. This
packet is not directly persisted as the same unified source receipt in
`admission-decisions.jsonl`. The Control Plane constructs a mission admission
receipt in memory. Neither has a verified read-only source receipt adapter
in this PR. We must not claim corresponding source validation until
reconstruction, authorization and origin-equivalence tests exist.

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
| Tenant isolation and resource grants | Timewalk's new snapshot checks each entity/record resource; existing general Context Fabric readers require a separate resource-grant audit | Security review authenticated identity binding, older read paths, tenant and retention policy |
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
node --test systemia/context-fabric/timewalk/timewalk.integration.test.mjs
node --test systemia/context-fabric/timewalk/coverage.test.mjs
node --test systemia/context-fabric/fabric.test.mjs
```

See `README.md` for the query contract and semantics.
