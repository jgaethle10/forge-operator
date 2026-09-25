# Evercraft Durable Continuity State v1

A network that survives a partition but forgets its replay history after a reboot can repeat the exact irreversible action it was designed to protect.

Continuity state therefore has to survive process death and ordinary machine restart.

## Durable replay ledger

The replay ledger is an append-only, hash-linked journal of executed message IDs.

Each committed record carries:

- monotonic sequence number;
- prior record hash;
- message ID;
- mission and kind metadata;
- irreversible flag;
- optional execution receipt hash;
- record hash.

Writes are appended and a filesystem sync is requested before the file descriptor closes.

On restart the ledger reconstructs its in-memory replay set from disk before accepting new work.

### Torn tail

A final incomplete JSON fragment is treated as an interrupted uncommitted write. The committed prefix remains usable and the loader reports tail_recovered true.

### Committed corruption

A complete line with a broken sequence, chain, schema, or hash causes the ledger to fail closed. It is not silently skipped.

## Durable checkpoint journal

Validated evercraft.checkpoint.v2 objects are written into a second hash-linked journal.

The journal enforces:

- valid checkpoint content hash;
- monotonically increasing generation per mission;
- exact parent linkage to the prior committed checkpoint.

After restart it can reconstruct a standard reconciliation replica containing the latest checkpoint plus its lineage history.

## Important boundary

This is a filesystem durability proof, not a power-loss certification.

A filesystem sync improves persistence semantics, but real field evidence is still required for abrupt power removal, filesystem/controller behavior, flash wear, bad sectors, removable storage, and repeated restart cycles on the hardware Evercraft actually deploys.
