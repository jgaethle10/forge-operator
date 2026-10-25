# NextGen remote admission: owner-authorized production checklist

This page is an execution gate, not evidence that the HP is connected.

## Proven local state

As reported by the owner after machine-local authorization, the HP's WSL
`NextGen` user `coach` installed a local organism at the pinned source
commit `c0cdb2bc96ee0adc7b7f24d1d1a685a7ea9f794c`. Its local receipt
reported node ID `evercraft-node002-nextgen`, NodeSeed, Compute, Yard,
KAIDANCE and Core active; remote operator disabled; broker absent;
no live remote MCP session. Do not elevate this owner-observed receipt into
an independent current host check.

## Read-only evidence and local verification

The repo provides `systemia/compute/nextgen-remote-doctor.mjs`.
It is a local, **read-only** program; simply reading the files does not
establish that their processes remain healthy.

- `node systemia/compute/nextgen-remote-doctor.mjs --require-local-prerequisites`
  checks only NextGen WSL, Node 22+ and user systemd. It does not require or
  silently configure remote broker trust.
- `node systemia/compute/nextgen-remote-doctor.mjs --require-local-foundation`
  additionally requires matching local organism/NodeSeed receipts for exact
  `evercraft-node002-nextgen`, matching fingerprint, loopback-only endpoint
  and absent public ingress. These are **historical machine-local receipts**,
  not an authenticated remote session or a live health observation.
- `node systemia/compute/nextgen-remote-doctor.mjs --probe-loopback`
  explicitly makes one bounded HTTP GET to `127.0.0.1` at the endpoint
  derived from verified matching receipts. It rejects public IPs, non-loopback
  origins, credentials, redirects, mismatched node IDs and invalid responses,
  and emits only sanitized booleans. It never accesses control tokens,
  changes services, enrolls devices or creates public ingress.
- `node systemia/compute/nextgen-remote-doctor.mjs --require-live-local-nodeseed`
  runs the same read-only probe and exits nonzero unless the actual local
  NodeSeed responds with the expected Evercraft Compute node identity.
- `--require-live-remote-readiness` is separate and still fails closed
  unless real independent broker/Yard exact-device trust and authenticated
  MCP control evidence are available. Current doctor cannot fabricate those.

No owner is required to run these probes simply for CI or code completion.
The physically installed HP remains at its last owner-observed local stage
until an actual host probe produces a fresh independent receipt.

## Admission order

1. **Independent deployment.** In the actual Systemia Yard deployment state,
   locate the *real* `systemia.remote-capacity-broker.v1` resident. Confirm its
   Compute deployment receipt and instance ID, and independently verify its
   HTTPS public route. Do not assume `fabric.systemiacommandcenters.com`
   is the capacity broker simply because the universal Evercraft MCP exists.
2. **Public health, not authority.** Read a canonical Yard
   `evercraft.remote-capacity.public-broker.v1` receipt using an authenticated
   private management connection. Apply an independent exact-origin allowlist.
   Use `comparePublicBrokerWithYardReceipt` to require matching live
   `/v1/remote/health` response, instance ID, envelope schema and deployment
   receipt. That comparison **cannot** independently authenticate the supplied
   Yard receipt and **never** grants Remote Operator authority.
3. **Device identity.** Obtain NextGen's non-secret enrollment request through
   an authenticated owner-controlled channel. Check node ID
   `evercraft-node002-nextgen`, fingerprint, requested scope and release.
   Never ask a user to paste `.env`, private keys, allocator tokens, or broker
   control grants into ChatGPT.
4. **Owner approval.** Use Yard's explicit authorization operation for exactly
   the approved fingerprint/node ID after obtaining genuine owner consent and
   a valid approval reference. Unknown devices must remain rejected.
5. **Outbound only.** On NextGen itself, enable broker configuration and the
   bounded Remote Operator only through the reviewed machine-local owner
   authorization step. No unsolicited shell, inbound SSH, VNC, RDP or port
   forwarding. The existing Node002 shadow agent must remain isolated.
6. **Independent authenticated probe.** Validate the real broker control
   grant and live MCP session using `remote_operator_status`, then check
   read-only `remote_network_status`. A connected NodeSeed heartbeat or an
   old startup receipt alone is not a successful MCP control proof.
7. **First bounded job.** Only after an independently trusted, atomic,
   one-time scoped approval verifier is configured can an approved exact
   Laser Foundry archive install be submitted. Confirm source hash,
   bounded destination, post-install tests and execution receipts.
   A naked `approval_ref` string is never adequate authorization.
8. **Revocation test.** Confirm Yard can revoke the exact device,
   disconnect its live session and invalidate the associated control grant.
   Do not ship a production remote execution path without this acceptance.

## Passport owner-approval integration

Yard's exact-device `authorize` and `revoke` calls now require a trusted
server-side verifier. The adapter
`systemia/yard/remote-device-passport-verifier.mjs` uses the pre-existing
Evercraft Passport action-permit ledger, NOT arbitrary JSON approval strings.

A trusted identity workflow must independently authenticate the owner and
issue a grant under product `evercraft.remote-device-trust` with only the
specific `remote_device.authorize` or `remote_device.revoke` scope. It
must mint a short-lived `permit_...` for the exact scoped request, exact
Yard broker deployment, node ID, fingerprint, and request payload digest.
The remote agent does not get the ability to grant or mint permits.

The offline manual owner review CLI can optionally open a pre-existing
private Passport state, but it **never** creates grants or permits. It
requires `--passport-state`, `--owner-subject`, and an existing
`--approval-ref permit_...` for authorization. Those private paths
and authenticated subject identities MUST come from an owner-controlled,
independently verified environment. User-supplied flags do not themselves
prove identity or grant trust. Do not expose the CLI as an unauthenticated
MCP or web route. Local OS permissions, authenticated issuance, and the
trusted management deployment are separate requirements for production.

The verifier checks that the permit belongs to the configured owner,
correct product and action scope, exact broker + node + fingerprint,
matching SHA-256 request fingerprint, unexpired active grant, and unused
state. Passport atomically consumes the permit with a fresh idempotency
key BEFORE Yard contacts the broker. Repeated use fails closed, including
across process restarts. If the broker mutation fails after consumption,
a fresh, independently approved permit is required for a retry.

The proof tests use synthetic local grants and permits inside temporary
state roots and do not assert that production identity-provider enrollment
or actual owner approval issuance has been configured.

## Completion states

- `LOCAL_ONLY`: Current last observed HP state. Machine-local organism active,
  remote control disabled.
- `BROKER_VERIFIED`: Independently authenticated Yard receipt and matching
  allowlisted public HTTPS health. No device trust implied.
- `DEVICE_TRUSTED`: Explicit exact-device Yard approval and successful
  NodeSeed challenge/attestation. No operator permissions implied.
- `MCP_READ_ONLY_VERIFIED`: Authenticated live operator status and network
  read checks, non-secret receipt saved.
- `JOB_APPROVAL_VERIFIED`: Independently authorized exact payload approval
  atomically consumed and approved bounded job run and verified.

Never collapse or silently skip a state. Keep production remote writes and
commands **OFF** until the entire chain has been proven.
