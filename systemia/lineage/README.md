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


## Yard transport

Lineage can now run as a lease-bound resident service inside Evercraft Compute and be reached through the existing Yard remote-capacity authority model.

The resident runtime is deliberately narrow:

- it binds to loopback only;
- it exposes health, ref advertisement/read/CAS, and immutable object has/get/put;
- object writes verify canonical Lineage identity before storage;
- ref writes use compare-and-swap;
- it carries no publication, deployment, or payment authority;
- Compute restricts the resident HTTP bridge to the exact Lineage routes instead of granting a generic tunnel.

The Yard session flow is:

```
AUTHORIZED + ATTESTED YARD NODE
        ↓
short-lived remote-capacity grant
        ↓
Compute lease: systemia.lineage-remote.v1
        ↓
loopback Lineage resident service
        ↓
short-lived Yard service relay
        ↓
HttpLineageRemote
        ↓
existing pushCommitGraph / fetchCommitGraph semantics
```

The session wrapper requires connected capacity, verified device identity binding, session attestation, the Lineage workload declaration, and zero-cost capacity by default. It preserves the existing Yard receipts for inventory, grant, service start, public route and relay creation.

Allocator, lease and relay credentials remain in memory only. Closing the session releases the relay and Compute lease, clears the in-memory credentials, and makes the attached remote unusable. No Lineage operation widens the Yard grant or creates downstream release authority.


## Remote large-object replication

Lineage can replicate chunked large assets across direct HTTP remotes and Yard-relayed remotes without resending unchanged content.

Large-object replication preserves the same content-addressed model used locally:

- every chunk is addressed by SHA-256 and verified before it is considered present;
- manifests are addressed by the digest of their canonical JSON content and reverified on read;
- remote `hasChunk` means the stored bytes still match the requested digest, not merely that a filename exists;
- corrupt remote chunks are treated as missing and repaired by the next push;
- pushes transfer only missing chunks and then the immutable manifest;
- fetches verify every chunk and the full reconstructed content digest before success;
- concurrency is bounded between 1 and 16 workers;
- replication receipts report transferred and reused chunk counts/bytes;
- storage replication carries no publication, deployment, payment, or release authority.

Direct-owned remote example:

```bash
node systemia/lineage/cli.mjs large-put ./master.mov video/quicktime
node systemia/lineage/cli.mjs large-remote-push http://127.0.0.1:49152 <manifest-id> 4
node systemia/lineage/cli.mjs large-remote-fetch http://127.0.0.1:49152 <manifest-id> 4
node systemia/lineage/cli.mjs large-verify <manifest-id>
```

The same `pushLargeObject` / `fetchLargeObject` functions operate over a Yard relay remote. The Compute resident-service bridge explicitly allows only the Lineage ref, object, chunk, and large-manifest routes. A Yard session remains short-lived and revocable, so gaining access to remote storage does not grant broader node or application authority.


## Manifest-backed assets inside commits

Lineage does not need to embed giant Studio masters directly into commit objects.

By default, workspace files at or above 8 MiB are snapshotted as `large_blob_ref` objects. Each ref records the immutable large-object manifest id, full-content SHA-256, byte size, chunk count and media type. Smaller files remain ordinary inline blobs, so existing history and lightweight workflows keep the simpler representation.

The threshold can be overridden through `commit({ snapshot: { largeObjectThresholdBytes } })`; passing `null` disables automatic large-object conversion. Chunking parameters can also be supplied through `largeObjectChunking`.

A tree entry can therefore describe either:

```
small file -> blob -> bytes
large file -> large_blob_ref -> manifest -> digest-addressed chunks
```

Restore is transparent across both representations. Large refs are materialized through the local large-object store and their full content hash and byte size are rechecked before the file is written.

Commit graph synchronization is fail-closed: when a graph contains a `large_blob_ref`, `pushCommitGraph` and `fetchCommitGraph` automatically transfer and verify the referenced manifest/chunks before moving the destination ref. A failed large-asset transfer may leave unreachable immutable objects for later garbage collection, but it cannot advance the visible branch head to an incomplete state.

Oversized text/structured assets are not automatically materialized for semantic diffing. Instead, Lineage reports their before/after content digests and sizes with an explicit `semantic_comparison_available: false` reason. Small structured assets retain the existing semantic adapters.

Git export uses `readEntryBytes`, so manifest-backed entries are reconstructed byte-exactly when crossing the Git interoperability boundary.


## Streaming large assets

Lineage's native large-asset path is streaming. A film master, world cache, audio master or dataset does not need to fit in RAM to enter, verify, or restore from Lineage.

`LargeObjectStore.putFile()` reads the source incrementally, maintains the same content-defined chunk boundary state as `putBuffer()`, hashes the full content incrementally, and keeps only the current bounded chunk in memory. For identical bytes and chunking settings, buffered and streamed ingest produce the same manifest id and chunk identities.

`verify()` walks verified chunks sequentially and updates the full-content SHA-256 without concatenating the asset.

`writeToFile()` writes verified chunks to a temporary sibling file, checks the reconstructed full-content digest and byte count, fsyncs, and only then renames the temporary file into the requested target. A corrupt or incomplete object therefore cannot publish a partial final file.

Workspace snapshots inspect file size before reading content. Files above the configured large-object threshold go directly through `putFile()`; only small files use the inline blob path. Restore similarly writes manifest-backed entries through `writeToFile()` instead of materializing the full asset as one Buffer.

The `materialize()` API remains as an explicit in-memory convenience for callers that genuinely want a Buffer. It is not used by the native large-file snapshot or restore path.

```bash
node systemia/lineage/cli.mjs large-put ./master.mov video/quicktime
node systemia/lineage/cli.mjs large-verify <manifest-id>
```

Both commands use the streaming path for file-backed large assets.


## Integrity verification

Lineage treats content-addressed identity as a runtime invariant, not a naming convention.

Every local `readObject(id)` re-canonicalizes the stored envelope and verifies that its SHA-256 still equals the requested object id. Local disk corruption therefore fails the same way remote corruption does.

The read-only integrity walker inspects the complete local store:

```bash
node systemia/lineage/cli.mjs fsck
node systemia/lineage/cli.mjs fsck --fast
```

Full `fsck` verifies:

- every stored Lineage object envelope digest;
- branch refs and commit targets;
- release pointers;
- operation receipt pointers;
- commit/tree/reference structure;
- blob byte counts and internal content SHA-256;
- tree metadata against referenced blob/large-ref metadata;
- large-object manifest identity and declared size;
- large-blob refs against their manifests;
- every stored chunk digest;
- every reachable large object's reconstructed full-content SHA-256;
- reachable vs dangling objects, manifests and chunks.

`--fast` keeps structural/object/manifest/chunk verification but skips reconstruction of every reachable large object's full-content hash.

Dangling immutable storage is reported as a warning, not silently deleted. `fsck` never mutates the repository. Garbage collection must be a separate explicit operation so an integrity check can never destroy evidence or recovery state.


## Bounded buffering and streaming interoperability

Lineage distinguishes between an explicit in-memory read and a streaming materialization.

`readEntryBytes(entry)` is intentionally bounded. The default ceiling is 64 MiB, and callers may supply a smaller `maxBytes` or `null` only when they explicitly accept unbounded buffering. If an entry exceeds the configured ceiling, Lineage fails with `LINEAGE_ENTRY_TOO_LARGE_FOR_BUFFER` before materializing the large object.

`writeEntryToFile(entry, target)` is the preferred path for large assets. Ordinary blobs are written directly; manifest-backed entries stream through the large-object store, verify their full content digest and size, and atomically publish the completed target.

Restore uses `writeEntryToFile`, so ordinary Lineage checkout remains streaming for large assets.

Git export also treats manifest-backed entries specially. Instead of calling `readEntryBytes`, it streams the entry into a temporary file under the target Git directory and lets `git hash-object -w <file>` consume that file directly. The temporary materialization is deleted immediately after Git has stored the blob, and the export workspace is removed in the final cleanup path.

This keeps the normal large-asset path bounded by chunk size even when crossing the Git interoperability boundary. A caller has to opt into an unbounded buffer explicitly rather than receiving one accidentally.

## Reachability and reversible garbage collection

Lineage treats garbage collection as a governed history operation, not a blind filesystem sweep.

The collector marks live state from:

- every branch ref under `.lineage/refs/heads`;
- named release pointers;
- operation receipt roots;
- optional explicit roots supplied by the caller.

Reachability traverses object payload references conservatively. `large_blob_ref` objects additionally retain their manifest and every digest-addressed chunk in that manifest.

GC is staged:

1. `gc-plan` is non-destructive. It inventories objects, manifests and chunks, computes the reachable sets, applies an age/grace window, and reports exact reclaimable bytes.
2. `gc-quarantine` recomputes the plan before moving anything. If roots/candidates changed, the plan is rejected as stale. Candidates are atomically moved into a reversible quarantine and an operation receipt is emitted.
3. `gc-restore` moves a quarantined run back into active storage.
4. `gc-purge` is allowed only after the quarantine retention window has expired. Purge is explicitly irreversible and emits its own receipt.

If roots change during quarantine, Lineage restores every moved file before failing. Named releases therefore protect historical commits even after a branch moves forward.

Defaults:

- plan/quarantine grace window: 24 hours;
- quarantine retention: 7 days;
- purge before retention expiry: rejected.

CLI:

```bash
node systemia/lineage/cli.mjs gc-plan 24
node systemia/lineage/cli.mjs gc-quarantine 24 168
node systemia/lineage/cli.mjs gc-restore <run-id>
node systemia/lineage/cli.mjs gc-purge <run-id>
```

GC never creates publication, deployment, payment, or release authority. It only manages storage reachability underneath already-governed Lineage history.
