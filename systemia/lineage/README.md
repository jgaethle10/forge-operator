# Evercraft Lineage

Evercraft Lineage is Systemia's universal history and provenance kernel. It takes the durable ideas behind Git and applies them to the broader Evercraft object world: source code, documents, datasets, research packages, media, 3D/world assets, workflows, and governed agent actions.

It is intentionally **not** a Git wrapper. Git remains useful as an interoperability bridge. Lineage's native contract is broader:

- content-addressed immutable objects;
- typed artifact trees rather than code-only assumptions;
- checkpoints/commits with multiple parents;
- branches, diffs, restore, rollback, merge previews, and deterministic non-conflicting merges;
- explicit human/agent actor identity;
- provenance, evidence, rights, rationale, and authority fields on commits;
- first-class immutable transaction receipts for agent and workflow mutations;
- fail-closed merge conflicts instead of silent AI guessing;
- provider-independent storage semantics so Yard can host it without binding the history model to a SaaS vendor.

## Why this belongs in Systemia

Systemia already routes work, permissions, evidence, and execution. Lineage gives that work a durable history grammar. Fallen scenes, RIVET datasets, FAIE/TOWI evidence packages, Journal research, release artifacts, agent edits, and future canonical-world objects can all point to the same primitives without pretending every asset is source code.

A future UI can render different diffs for different artifact types while preserving one underlying lineage model. A `.ts` file may show a text diff, a dataset may show row/schema drift, a Fallen world may show scene-graph operations, a video may show timeline/shot deltas, and an agent run may show typed mutations and receipts.

## Object model

Lineage v1 stores immutable JSON envelopes under `.lineage/objects/` and mutable branch references under `.lineage/refs/heads/`.

Core object types:

- `blob`: arbitrary bytes, base64 encoded in this reference kernel;
- `tree`: stable path-to-object manifest with asset classification;
- `commit`: tree + parents + actor + rationale + provenance + authority + transaction IDs;
- `transaction`: typed human/agent mutation with inputs, outputs, evidence, authority, and reversal contract;
- `receipt`: immutable evidence that a state transition occurred.

The first implementation favors correctness and inspectability over storage efficiency. Large-media chunking, pack files, delta compression, remote replication, signatures, ACLs, and specialized semantic diff adapters belong in later slices without changing the top-level object contract.

## CLI

```bash
node systemia/lineage/cli.mjs init
node systemia/lineage/cli.mjs commit "initial world"
node systemia/lineage/cli.mjs branch experiment
node systemia/lineage/cli.mjs switch experiment
node systemia/lineage/cli.mjs diff HEAD
node systemia/lineage/cli.mjs merge-preview main
node systemia/lineage/cli.mjs merge main
node systemia/lineage/cli.mjs log
node systemia/lineage/cli.mjs rollback <commit>
```

Set `EVERCRAFT_ACTOR_TYPE` and `EVERCRAFT_ACTOR_ID` when a Systemia agent or worker is making the change.

## Integration direction

1. **Systemia admission** issues a mission/work identity and actor authority.
2. The target product writes native artifacts or typed transactions.
3. **Lineage** snapshots the resulting object graph and emits receipts.
4. **Yard** stores/replicates objects and refs, verifies hashes, and enforces workspace/tenant boundaries.
5. Product-specific diff adapters make the same history legible: code, document, table, scene graph, timeline, evidence package, release.
6. Saban can fan out speculative branches safely. Reconciliation merges only admitted results.
7. Releases and publications point to immutable Lineage commit IDs, making "what exactly shipped?" answerable.

## Non-goals for v1

- replacing Git hosting overnight;
- inventing a distributed consensus protocol before the local object semantics are proven;
- auto-resolving semantic conflicts with an LLM;
- granting publish/payment/deployment authority merely because an agent created a commit;
- treating a successful write as proof of public deployment.

## Test

```bash
node --test systemia/lineage/core.test.mjs
```

The current tests cover typed diffs, branching, two-parent merges, conflict detection, rollback, world assets, agent identity, and immutable transaction receipts.


## Phase 2 primitives

The dependent Phase 2 branch adds the first owned distributed-history primitives:

- content-defined chunking for large video, audio, world and dataset artifacts;
- chunk-addressed deduplication across edited versions;
- byte-identical materialization with per-chunk and whole-object verification;
- an owned local remote protocol suitable for Yard adaptation;
- compare-and-swap branch updates so stale agents cannot overwrite newer history;
- immutable commit-graph push with object reuse;
- Ed25519 actor attestations with tamper detection, key-to-actor binding and revocation.

Phase 2 CLI examples:

```bash
node systemia/lineage/cli.mjs large-put ./master.mov video/quicktime
node systemia/lineage/cli.mjs large-verify <manifest-id>
node systemia/lineage/cli.mjs remote-refs ./yard-lineage-remote
node systemia/lineage/cli.mjs remote-push ./yard-lineage-remote main null
```

The local remote is a protocol proof, not the final network transport. Yard should adapt the same immutable-object and compare-and-swap contracts behind authenticated workspace boundaries rather than changing the Lineage semantics.


## Git interoperability

Git is an interoperability bridge, not the canonical Lineage model.

```bash
node systemia/lineage/cli.mjs git-import ../legacy-repo HEAD git/legacy
node systemia/lineage/cli.mjs git-export ../git-export HEAD lineage-export null
```

Git import preserves source commit SHA, parents and author metadata as Lineage provenance. Git export preserves exact artifact bytes and embeds the source Lineage commit ID in the generated Git commit message. The export receipt explicitly lists Lineage fields that cannot be represented losslessly in Git, including richer provenance, authority, transactions, receipts and semantic asset types.

## Universal history view

Lineage can materialize an owned, self-contained history surface without depending on GitHub:

```bash
node systemia/lineage/cli.mjs history main 100
node systemia/lineage/cli.mjs history-export ./lineage-history main 100
```

The bundle contains `graph.json` plus a standalone `index.html` showing multi-parent ancestry, human and agent authorship, change counts, rationale and authority boundaries.

## Release identity

Named releases point to an exact immutable Lineage commit instead of whatever HEAD happens to contain later. A release manifest can carry artifact SHA-256 digests and downstream authority receipt references.

```json
{
  "name": "week-in-motion-42",
  "channel": "production",
  "commitish": "HEAD",
  "state": "released",
  "artifacts": [
    {
      "name": "master.mp4",
      "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    }
  ],
  "authorityReceiptRefs": ["release-policy:approved:42"],
  "actor": { "type": "human", "id": "operator" }
}
```

```bash
node systemia/lineage/cli.mjs release-record ./release.json
node systemia/lineage/cli.mjs release-show week-in-motion-42 production
```

A pointer update is compare-and-swap protected. The `released` state fails closed unless at least one downstream authority receipt is supplied. Lineage records what state was released; it does not create release authority by itself.
