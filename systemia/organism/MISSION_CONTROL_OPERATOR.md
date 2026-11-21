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

## Build 04: automatic local-only viewing

An operator who has permission to read an existing Systemia goal state or health-watch file can launch the view on that **same machine**. No JSON import is needed; the browser refreshes sanitized summaries from the local read-only server every 30 seconds.

```bash
node systemia/organism/mission-control-local-server.mjs \
  --state "/absolute/path/to/private/goal.json" \
  --node001-watch "$HOME/.local/state/evercraft/organism/health-watch.json" \
  --node001-id "EXACT-OWNER-VERIFIED-NODESEED-ID" \
  --port 8766
```

Open `http://127.0.0.1:8766/mission-control.html` on that same device. To inspect only a goal or only an existing node watcher, omit the other source flags. For NextGen, supply `--node002-watch` and `--node002-id` only when an actual compatible watcher exists. The viewer reads only explicitly selected regular files, never scans directories, never overwrites them and never binds to the LAN. There is no public hostname, startup automation or write/exec endpoint. Its HTTP server allows a fixed list of local UI assets and the sanitized `GET /v1/snapshot` endpoint. Other paths, cross-origin browser requests, unsafe methods and Host-header rebinding are denied. No raw goal files are served.

The local server does **not** authenticate the human sitting at the device: any local account/browser process able to connect to that loopback port can see its limited, privacy-filtered status. Use only with an approved owner-controlled desktop session. Do not port-forward it or place it behind a reverse proxy. Node health is **local self-report**, not an independently signed device attestation. Even a successfully served status does not establish runtime access, customer payment, fulfillment, external routing or an execution grant. A source parse or permission failure returns an explicit held/error state instead of serving cached good data.

The ordinary public GitHub Pages version of Mission Control does not call this local adapter. It continues to show public development receipts and optional manually imported local snapshots. No public website can discover private node files through this addition.

Verification: `node --test tests/systemia-mission-control-local-server.test.mjs`. The new local loopback server is opt-in and is not installed as a service.


## Build 06: operator-pinned signed NodeSeed identity challenge (private, opt-in)

This verifies **key possession only**, using the repository's existing `verifyNodeAttestation` Ed25519 routine, an **owner-pinned public key from a previously verified enrollment**, a matching exact node ID, and an exact locally supplied challenge. A signature is considered valid for at most 60 seconds from the signed observation time. There is no network request, remote device discovery, admission, execution, payment action or automatic enrollment.

A PINNED SIGNATURE is **not** an authenticated remote health feed. In particular, an imported JSON claim in the browser is not independently authenticated there. The public top-row Penguin and NextGen health labels must remain `HEALTH UNKNOWN`.

Use only if an already authorized NodeSeed challenge/attestation exchange has produced a matching signed attestation. Keep all three selected files **outside the repository**, on an owner-controlled machine:

- `/private/node001-attestation.json`: the signed NodeSeed attestation envelope obtained from the approved exchange
- `/private/node001-owner-pinned.pem`: public key pinned from prior trusted enrollment, never copied from the attestation being checked
- `/private/node001-challenge.txt`: exact owner-issued challenge (at least 16 random-safe characters); never trust an attacker-chosen challenge as an authorization

Review locally via:

```bash
node systemia/organism/mission-control-local-server.mjs \
  --node001-id "EXACT_PREVIOUSLY_VERIFIED_NODE_ID" \
  --node001-attestation "/private/node001-attestation.json" \
  --node001-public-key "/private/node001-owner-pinned.pem" \
  --node001-nonce-file "/private/node001-challenge.txt" \
  --port 8766
```

Then open `http://127.0.0.1:8766/mission-control.html` on that machine. The same flags work with `mission-control-export.mjs`, plus `--out /private/unused-snapshot.json`; export remains create-only with mode 0600. Use `node002` variants only against an actually enrolled Node002. The identity check may be selected alone, or alongside approved goal and watch files.

The adapter fails closed for mismatched node ID, invalid signature, changed signed statement, mismatched owner-pinned key, wrong challenge, expired observation, duplicate inputs, symlinks or unbounded files. Successful proof exports only the selected node slot, a summary of the verification and observation time, never raw keys, fingerprint, nonce, signed statement or private file paths.

**Important limitations:** A locally selected challenge is not by itself evidence of a fresh remote challenge-response ceremony or a replay-resistant broker session. A valid signature proves possession of the matching private key at the signed observation time, not that the node is online now, that a network path is authenticated, or that a payment or job completed. Do not copy the attestation's key into the pin file or put this loopback viewer behind public ingress.

Tests: `node --test tests/systemia-mission-control-identity.test.mjs tests/systemia-mission-control-local-server.test.mjs`.
