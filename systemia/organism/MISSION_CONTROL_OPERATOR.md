# Systemia Mission Control: local goal-state export

Build 01 is a read-only operator visibility surface, not an agent dispatcher.

Run on an authorized Evercraft machine with a known existing persisted `evercraft.goal.state.v1` file:

```bash
mkdir -p ~/.local/state/evercraft/mission-control
node systemia/organism/mission-control-export.mjs \
  --state /absolute/path/to/approved/private/goal.json \
  --out ~/.local/state/evercraft/mission-control/goal-snapshot.json
```

Open the generated JSON with **Open local snapshot** in the companion page `public/live/mission-control.html`. Repeat `--state` for up to 80 explicit goal files. This command neither scans files automatically nor uploads a snapshot. It refuses overwriting existing exports and refuses output inside the source repository. Output permissions are mode 0600.

**Provenance and privacy:** Only opaque goal ID, generic title, operational lane, interpreted state, recorded update time, revision and counts are exported. Raw objective, customer identifiers, unredacted blockers, receipt refs, and filesystem paths are not included. A local `completed` state means the goal file contains task evidence references, not provider-verified payment/delivery. A local `running` state means the persisted heartbeat is recent, not a proven living worker. Stale execution is held.

**Still missing:** authenticated, Passport-scoped private read API for Systemia / Node001 / Node002; source-verified payment/fulfillment reconciliation through Raven; exact execution leases through Execution Gate. Do not expose internal goal files or raw node status publicly or count GitHub PRs as executed missions.

Checks: `node --test tests/systemia-mission-control-export.test.mjs tests/systemia-mission-control.test.mjs`.

## Build 03: local NodeSeed health-watch receipts

Use the existing read-only health-watch output, **not** a new monitoring daemon or a public API. On Penguin, the expected source is `~/.local/state/evercraft/organism/health-watch.json`. The Node002 option may be used only if that node actually runs the same watcher and writes its own matching receipt.

```bash
node systemia/organism/mission-control-export.mjs \
  --node001-watch "$HOME/.local/state/evercraft/organism/health-watch.json" \
  --node001-id "OWNER-VERIFIED-NODESEED-ID" \
  --out "$HOME/.local/state/evercraft/mission-control/penguin-observation.json"
```

The exact node ID is required and must be checked against an existing trusted, owner-controlled enrollment record. Do not infer it from arbitrary imported JSON, and do not use a demo ID. Optional `--node002-watch` / `--node002-id` work identically. `--state` inputs are optional when at least one node watch is supplied, so the operator can export node-only, goal-only, or combined snapshots.

The watcher produces `evercraft.local-organism-health-watch.v1`, with a SHA-256 self-hash. The adapter checks that hash, expected node identity, local service/NodeSeed probe and 3-minute freshness. **The hash is not a signature**: another actor who can change the file can recompute it. Therefore the dashboard always says **LOCAL SELF-REPORT / UNVERIFIED**, including when the reported state is healthy. A stale report is explicitly downgraded to unknown current health. Raw fingerprints, network addresses, private keys and raw receipt data are never exported.

The public top-row node cards stay **HEALTH UNKNOWN**, because local receipt inspection is not independent authenticated remote status. This does not approve Node002 remote jobs, authorize Yard enrollment, or prove externally reachable infrastructure.

Run tests with `node --test tests/systemia-mission-control-node.test.mjs tests/systemia-mission-control-export.test.mjs tests/systemia-mission-control.test.mjs`. The next step, if operator-authorized, is a separately scoped signed private status read API using existing Passport/NodeSeed/Yard identity anchors; never host that raw feed in public GitHub Pages.
