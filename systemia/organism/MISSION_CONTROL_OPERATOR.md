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
