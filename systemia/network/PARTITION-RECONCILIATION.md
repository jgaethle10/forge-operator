# Evercraft Partition Reconciliation v1

A resilient network has to survive the moment after the outage too.

Partitions create a dangerous recovery condition: nodes reconnect with different memories, delayed messages arrive twice, stale state can look fresh, and an action that was already executed may return in a queue.

The reconciliation layer therefore treats reconnection as an evidence problem, not a race.

## Checkpoint lineage

Critical checkpoints use:

- mission ID;
- monotonically increasing generation;
- parent checkpoint hash;
- origin node;
- committed timestamp;
- state;
- checkpoint hash.

A checkpoint is eligible for automatic recovery only when its own hash is valid and its parent lineage is available and valid.

### Stale state

A stale but valid checkpoint does not win over a newer valid lineage. It is marked for refill from the canonical state.

### Corrupt state

A checkpoint whose content no longer matches its recorded hash is rejected.

### Forked state

If two valid checkpoints share the same mission, generation, and parent but contain different state, the system returns **HOLD_CONFLICT**. It does not choose a winner based on timestamp or whichever node reconnected first.

That is intentional. A partition can create two locally reasonable histories. Automatic selection is unsafe when the histories represent different decisions.

## Secure delayed-delivery envelopes

Store-and-forward payloads use authenticated encryption.

The v1 envelope uses AES-256-GCM with authenticated metadata covering:

- message ID;
- key ID;
- source;
- destination;
- kind;
- created time;
- expiry;
- irreversible-action flag.

Any modification to authenticated metadata or ciphertext causes decryption failure.

The envelope contract also supports destination checking, expiry, and a local replay guard keyed by stable message ID.

Key distribution and rotation are separate trust-layer responsibilities. The proof uses local test key material and is not a claim of production key management.

## Recovery rule for delayed actions

When a partition heals:

- already executed message ID -> discard;
- duplicate recovered message ID -> discard;
- expired message -> discard;
- reversible/idempotent valid message -> eligible for automatic resume;
- irreversible message with uncertain post-partition execution state -> **hold for review**.

This preserves the standing rule that restored connectivity does not expand authority or cause consequential work to replay simply because a queue became reachable again.

## Physical evidence still required

The automated proof covers reconciliation semantics and authenticated local envelopes. Field evidence is still needed for transport-specific loss, real persistent replay ledgers, key rotation under long partitions, tamper-resistant identity material, removable-media courier flows, radio/BLE fragmentation, and reconciliation after real device power loss.
