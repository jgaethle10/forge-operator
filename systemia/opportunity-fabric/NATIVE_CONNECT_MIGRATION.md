# Evercraft Connect native extraction (phase N0)

**Source-of-truth boundary:** This module is hosted in Evercraft's owned `systemia/opportunity-fabric` source tree and runs under Node, not Base44. It is a **domain kernel**, not yet a deployed production service.

## Audited architectural roles

- **Systemia:** admits missions, actor identity, priority, capacity, authority and sequencing. A Systemia admission receipt must precede hosted routing mutations.
- **Lineage:** immutable versioning, transaction/evidence history, storage handoff. It is *not* the operational HTTP application server.
- **Evercraft Fabric:** capability discovery and interoperability registry; declarative capability presence is *not* runtime verification.
- **Evercraft Compute/Yard:** intended owned host for a future authenticated multi-tenant Opportunity Fabric API. Hosted durable storage, backup, keys, tenant ACLs, migration jobs and network ingress are not yet proven for Connect.
- **Legacy Base44 Opportunity Fabric:** stays online for existing users/records while the native service passes parity and migration tests. Freeze net-new architectural dependencies. Do not silently migrate or delete any customer/owner records.

## What landed

`native-connect.mjs` provides:

1. `normalizeLegacyConnectCase`: explicit, conservative normalization of a legacy Base44 case into a portable, **private** internal record. It is an in-memory adapter, not an export job or live data migration.
2. `nativeProvider`: allowlisted safe provider capability metadata, excluding contact emails, private notes and source details.
3. `planNativeConnect`: metadata-only matching on declared capabilities, explicit source health, owner authorization, DNC/hold and availability exclusions, deterministic proposal identifiers, and explicit unmatched needs. No incidental location/label similarity can create a fit.
4. `reviewNativeConnectProposal`: fail-closed, current-state revalidation of case ownership, case need, member availability/capability and private-node ownership before human review approval. Approval generates **no contact, payment, disclosure, team membership or legal obligation**.
5. `recordSafeNativeConnectTransaction`: writes a minimal, redacted proposed-plan transaction through the existing LineageStore. The Lineage receipt represents a provenance event, *not* deployment, consent or payment authority.
6. `normalizeLegacyConnectNode` and `normalizeLegacyFabricMember`: explicit allowlist adapters that discard contact details and do not infer specialty from a role or tag.
7. `previewNativeConnectMigration`: owner-scoped aggregate preflight to detect invalid records, holds, duplicates and likely cutover blockers without creating exports or migrating private data.

Run:

```bash
node --test systemia/opportunity-fabric/native-connect.test.mjs
node --test systemia/opportunity-fabric/*.test.mjs
```

## Export/migration policy

Before moving a byte of Base44 data:
- inventory actual rows, entity count, field-level ownership and authorized export mechanism;
- define stable IDs, tenant/owner mapping, schema versions, encryption-at-rest and transport, deletion/retention and backup strategy;
- record per-record hash and provenance without writing raw protected details to logs or Lineage receipts;
- stage encrypted exports in an access-controlled environment, *never* a public repository or a static website;
- dry-run importing into an isolated owned backend and prove tenant/consent parity with negative-path tests;
- compare row counts, hashes, relationship links, DNC holds, active consent grants and protected asset access controls;
- cut over only after shadow reads, authenticated user acceptance, rollback tests and explicit approval;
- preserve the legacy production database unchanged until a signed migration and rollback receipt exists.

## Remaining gates

This PR does **not** provide:
- authenticated HTTPS service or tenant persistence;
- encrypted production storage / secrets policy;
- a Lineage release pointer for a deployed Connect service;
- verified Fabric/CHUM publication, runtime health, Systemia admission, or user authentication;
- live Base44 export, import, switch-over or customer outreach.

There is no authority to delete, export or migrate private external data merely because a normalization function exists.

## Prior existing infrastructure

Base44 app ID `6ab85d74fe2093703c6247e0` and its existing governed workflow, including 25+ behavioral tests and source checkpoints, are retained for compatibility. Existing Connect PR #1126 retains source receipts and safety work; this native extraction PR should not duplicate or contradict that active branch.

**Acceptance for phase N0:** owned module and test gates pass; explicit truth boundaries documented; no external mutation.
