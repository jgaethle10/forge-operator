# Rogue Agent 003: Owner-device field identity activation

Status: REAL_HARDWARE_PENDING_OWNER_EXECUTION. GitHub CI proved two official NodeSeed OS processes and Spider quarantine on hosted runners. It DID NOT contact the owner's HP, Chromebook or deployed Spider Society.

## Actual Systemia registry observation, October 17
Collider app 694612db777e391542fd0333: Founder Chromebook NodeRegistry entry personal:chromebook:opportunistic:v1 is challenged/not_ready, with no approved public fingerprint or verified heartbeat. Primary runtime/browser workers are pending/not_ready. Zero NodeHeartbeatReceipt and ComputeWorkerAdmissionReceipt rows were returned. Connected DigitalOcean returned zero droplets. These are scoped readbacks only.

## What the on-device command does
field-node-selfcheck-cli.mjs starts official startNodeSeed on a randomly allocated LOOPBACK ONLY port, disabled multicast and random in-process allocator bearer token. It creates or reuses a persistent private candidate key in --root, challenges the live local NodeSeed via nonce-bound Ed25519 attestation, verifies its signature, fingerprint and exact node ID, then CLOSES the local test server before printing public candidate JSON. No private PEM, bearer secret, local root or IP endpoint is exported. Never dispatches a job or touches deployed Node002, Spider Society, CHUM or Systemia. A candidate public key is NOT independently owner-enrolled and does not prove actual distinct hardware.

## Operator steps, review PR #1364 source first
On EACH actual physical Linux/WSL laptop separately, with Node 22 installed, clone the review branch:

```bash
git clone --single-branch --branch feature/blackbox-signed-incident-ingest-20261017 https://github.com/jgaethle10/forge-operator.git evercraft-field-check
cd evercraft-field-check
```

On the HP in WSL, from that checked-out folder:

```bash
node systemia/agent-continuity/field-node-selfcheck-cli.mjs --node-id evercraft-node002-nextgen --root "$HOME/.local/share/evercraft/field-candidates/node002" > "$HOME/node002-public-field-candidate.json"
```

On the founder Chromebook Linux container, from its own checkout:

```bash
node systemia/agent-continuity/field-node-selfcheck-cli.mjs --node-id evercraft-founder-chromebook-field --root "$HOME/.local/share/evercraft/field-candidates/chromebook" > "$HOME/chromebook-public-field-candidate.json"
```

The Chromebook name is a NEW LOCAL CANDIDATE and not the canonical NodeRegistry identity mapping. If an owned official NodeSeed identity already exists, do not replace it: use field-node-readback-cli.mjs against the existing localhost NodeSeed and supply BLACKBOX_LOCAL_NODESEED_TOKEN through a secure local environment, never as CLI args or chat text. The self-check command MAY create a persistent new private identity in the requested candidate directory. The commands should NOT be run twice on one computer as a substitute for two physical nodes.

Public JSON contains fingerprint, public key, nonce, and signed NodeSeed statement. Review it before sharing; NEVER upload private PEMs, bearer tokens, machine passwords, env files or profile secrets.

## Canonical admission after separate operator observations
1. Independently tie the two candidate public keys to distinct actual owned devices and approved operator custody. NodeSeed self-signatures alone are not an owner-managed trust anchor.
2. Reconcile the real NodeRegistry with admin-authorized enrollment receipts; acquire fresh independently verified NodeHeartbeatReceipt and ComputeWorkerAdmissionReceipt. Do not fabricate them from this self-check.
3. Resolve actual canonical mission lineage first. The current Command Center signed issuer only supports two older mission keys; the 19k founder continuity directive remains awaiting_canonical_admission. Preserve it intact and admit separately with real server receipt.
4. Only with explicit sandbox scope, actual HTTPS NodeSeed identities, live Spider test consumer and separately approved credentials, run a bounded nondestructive cross-physical-node containment drill, verify queues/callbacks/successors with independent readback, and prove rollback.
5. All ten PipelineEdges remain unverified until actual production or authorized staging source, transit, consumer and no-regeneration evidence exists. Unknown means HOLD.

No automatic machine enrollment, hardware reboot, network/firewall change, production credential provision, rogue production LLM, spend, customer operation or service release is authorized.
