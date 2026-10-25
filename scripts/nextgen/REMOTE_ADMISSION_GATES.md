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
