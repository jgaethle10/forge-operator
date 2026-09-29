# Evercraft Remote Operator

Evercraft Remote Operator is the first-party remote filesystem and bounded terminal lane for authorized Evercraft-owned or user-owned compute.

It exists to remove the need for third-party remote desktop/terminal relays when ChatGPT, Raven Nexus or Systemia needs to inspect or maintain an authorized Evercraft node.

## Architecture

```
Raven / ChatGPT / Evercraft Fabric
  -> Systemia + Passport / explicit approval
  -> Yard remote control grant
  -> Evercraft remote-capacity broker
  -> AES-256-GCM secure envelope
  -> outbound-only NodeSeed agent
  -> loopback Evercraft Compute
  -> Remote Operator
```

The private node opens the network connection. Remote Operator does not open SSH, RDP, VNC or another inbound port.

## Authority boundary

Remote Operator is disabled unless explicitly admitted when the NodeSeed starts.

When enabled:

- every operator request through the remote broker requires the exact node's private remote control grant;
- the node requires its local allocator authority before invoking Remote Operator;
- unknown device fingerprints cannot self-enroll;
- revoking the remote device authorization invalidates the live session and control grant;
- write and execution operations additionally require an explicit `approval_ref`;
- there is no interactive TTY and no password prompt channel;
- commands run as the ordinary user that owns the local organism, never as a synthetic root service.

## Filesystem

The node exposes named roots, never arbitrary absolute filesystem paths.

The Chromebook local organism admits three roots when enabled:

- `home` — the normal Linux user's home directory;
- `evercraft` — the installed Forge/organism source tree;
- `state` — the local organism state tree.

Filesystem routes:

- `GET /v1/operator/status`
- `POST /v1/operator/fs/list`
- `POST /v1/operator/fs/read`
- `POST /v1/operator/fs/write`

Absolute paths, parent traversal and symlink write targets are rejected. Common high-risk secret locations and key files are blocked from the direct read/write API, including `.ssh`, `.gnupg`, `.aws`, `.kube`, provider credential custody, Identity/Passport state, `.env*`, private keys and token-bearing dotfiles.

## Command execution

`POST /v1/operator/exec` is a bounded non-interactive program runner, not a raw public shell.

The initial execution surface is deliberately a maintenance console rather than an arbitrary shell:

- `git`: status, fetch, pull, log, diff, rev-parse and branch
- `npm`: install, test, run and start
- `systemctl --user`: status, restart, start, stop, is-active and daemon-reload, restricted to `evercraft-*` units
- `journalctl --user`: restricted to `evercraft-*` units

There is no `bash`, `sh`, `sudo`, arbitrary Node evaluation, package-exec lane, or generic file-reading command in the execution profile. File inspection uses the separately policy-checked filesystem API. Git configuration/work-tree overrides, global npm scope overrides, system-level systemd control and journal source overrides are rejected. Execution has a hard timeout and output cap. Ambient environment variables are not forwarded wholesale, so API keys present in the service environment are not automatically exposed to commands.

## Receipts

Receipts persist operation type, hashes, timing, exit state, root key and approval reference. They do not persist file contents, stdout, stderr, command arguments in plaintext, API keys, passwords or other operation payloads.

## Chromebook enablement

The local organism stays secure-by-default. If the Chromebook already has its Evercraft remote broker configured, enabling Remote Operator is one command from an updated Forge checkout:

```bash
bash systemia/compute/enable-remote-operator-user.sh
```

For a first-time node, supply the independently verified Evercraft broker origin once:

```bash
EVERCRAFT_REMOTE_BROKER_URL="https://<verified-evercraft-broker>" \
bash systemia/compute/enable-remote-operator-user.sh
```

The enable script reuses the normal local-organism installer, preserves existing private configuration, restarts the user service, and verifies that the loopback NodeSeed advertises Remote Operator as ready. It does not print the allocator token, broker control grant, device private key or any provider credential.

The node remains outbound-only.

## Acceptance

Run:

```bash
node systemia/compute/remote-operator.test.mjs
node systemia/network/remote-operator.proof.mjs
```

The end-to-end proof starts a real local NodeSeed, broker and outbound agent, requires a remote control grant, exercises remote read/write/exec, rejects unauthenticated access, rejects sensitive-path reads, and verifies operation payloads do not land in the receipt ledger.
