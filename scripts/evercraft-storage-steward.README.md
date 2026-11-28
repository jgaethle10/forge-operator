# Evercraft Storage Steward | bounded inventory v0.1

**Status:** proof-only. Does not move, archive, delete, vacuum, rotate, restart, rebalance, or modify files. All output remains in the invoking terminal unless the operator explicitly redirects it. Never paste output containing private filenames into public issues.

For a Crostini/LXD Btrfs guest suffering I/O pressure or ENOSPC, avoid exhaustive walks: directory reads can intensify contention. Keep production state separate from rebuildable engineering artifacts.

## Manual local invocation

On a healthy engineering host or cautiously on Penguin using a **single narrow candidate directory**, e.g.:

```bash
python3 scripts/evercraft_storage_steward.py --root "$HOME/.local/share/evercraft/storage/engineering" --seconds 6 --entries 1500 --depth 2
```

The JSON summary has explicit `partial`, `entries_examined`, category totals, largest files by apparent size, and top-level group estimates. It reads **file metadata only** and never opens file contents. Symlinks and separate filesystems are not traversed; `.git` and `.ssh` are skipped. Unknown, database, runtime, release, secret, key, backup and journal material is protected from automated recommendations. `REVIEW_REBUILDABLE_CACHE` and `REVIEW_NOT_APPROVED` are **review categories, not permission to delete**. On overload, stop further scans.

## Future verified reclamation (not implemented)

1. Operator selects an exact bounded set of **proven reproducible** build/cache paths, not a glob or age-based sweep; verify no live process references the target and that the current repo checkout/release remains untouched.
2. If evidence or proprietary data is involved, back it up to a physically independent, controlled, appropriately encrypted destination (NextGen or external storage), verify exact content hashes and item membership, and check the destination can read and restore it. The same ChromeOS internal disk is not a separate backup, regardless of mountpoint.
3. Generate a signed/hashed proposed removal manifest and require explicit founder approval. Use strict no-symlink and exact-path checks with fail-closed behavior, and stop on filesystem errors. Preserve receipts outside volatile paths.
4. Recheck physical free space, guest free space, write+fsync+atomic rename across nested state directories, and IO PSI trend **before** coordinated controlled Systemia Core recovery. Do not conflate CI/source heartbeat with live Penguin heartbeat.

Do **not** delete journals, private research, production configs, databases, current/rollback releases, credentials, Git `.git` data or untracked resident configs to make the updater pass. A large apparent size does not guarantee reclaimed physical Btrfs bytes due to copy-on-write, reflinks and open files. Keep FindMyPart deployment release-held until the owner restart/write gates pass.
