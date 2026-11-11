# Evercraft MicroSeed: on-node signed evidence field proof

The canonical field tool is `systemia/saban/microseed-local-field-proof.mjs`. It builds on the **existing** native MicroSeed agent, durable private signed-receipt store, Saban Ambient Device Registry and Systemia evidence bridge. It introduces **no new agent service, listener, remote dispatch route, grants, jobs or payment authority**.

## What the operator can validate

The **default is read-only**. It inspects an already bootstrapped native-agent manifest and local public identity (never the private key), requires strict loopback HTTP, verifies the resident native agent's declared signed-health state, then fetches one signed telemetry report and verifies its Ed25519 signature and freshness using the locally pinned public key.

The explicit `--hash-probe` flag additionally sends **one locally registered `systemia.content-hash.v1` workload** with a fresh one-time key and non-sensitive test string. It recomputes the request hash and expected result hash, verifies the device signature, then reopens the exact signed receipt in the device's existing private journal and verifies signature and content match. It does not dispatch through the Saban Gateway, modify mission goals or contact any remote server.

If `--ambient-registry-root` is given, the tool also checks that the signed device is currently active, authorized, not revoked, has a fresh approved heartbeat, and matches an approved device manifest and signer key. No Ambient Registry entry or authorization is created or modified by this tool. Without this option the output explicitly marks current registry trust as **not checked**.

It returns one redacted JSON object. It excludes token values, private keys, raw device identifiers, private receipts and filesystem paths. Output never treats code execution as independent real-world effect, delivery, financial settlement, Passport access or physical hardware attestation.

## How to run on a REAL owner-controlled device

Requires the exact Evercraft-owned source tree from this review branch or the CI-generated portable **evercraft-signed-field-kit** artifact, Node.js 22, and an **already installed, running and authorized** native MicroSeed agent bootstrapped with a local loopback endpoint. Do not bootstrap/rotate credentials or launch a new agent as part of this check.

From the directory containing the kit's `systemia/` folder, on **Penguin's Linux terminal** or **NextGen's Ubuntu WSL terminal**, run:

```bash
node systemia/saban/microseed-local-field-proof.mjs \
  --root "$HOME/.local/state/evercraft/microseed"
```

If the signed-telemetry check returns `"ok":true` and the machine has owner authorization for one harmless registered hash, run:

```bash
node systemia/saban/microseed-local-field-proof.mjs \
  --root "$HOME/.local/state/evercraft/microseed" \
  --hash-probe
```

For a trust-registry-backed proof on a node where you KNOW the authorized registry path, add:

```bash
--ambient-registry-root "/actual/owned/ambient-registry"
```

Never guess or fabricate the registry directory, create a new trusted entry for the sake of passing, or use a live provider token from a chat. If the agent root is different from the default, replace `--root` with its actual native bootstrap root. The tool only allows the native agent's registered `127.0.0.1` or IPv6 loopback endpoint; it will not probe a LAN host.

**If the node has no MicroSeed agent running, the result is a HOLD.** A healthy Node001 broker, NodeSeed worker, or Saban service does not automatically mean the **MicroSeed native-agent** service is installed. This probe must not claim those components are equivalent. Bringup is a separate owner-authorized deployment task.

## Results and evidence

The redacted output reports `signed_telemetry_verified`, `content_hash_probe_verified`, `private_signed_journal_reopened` and `ambient_registry_current_trust_verified`. It also explicitly sets `actual_physical_hardware_attested:false`, `downstream_effect_verified:false`, `passport_access_verified:false` and `delivery_verified:false`.

Run once on each machine with its own trusted bootstrap state. Share **only the printed summary JSON**, not `agent-token`, private keys, full manifests, raw signed receipts or their source directories. A real on-device run plus independently checked operator/device provenance is needed before claiming physical-node acceptance.

The CI package is only a **synthetic native-agent test**, even though it creates an actual loopback HTTP server inside a GitHub-hosted runner. CI must never be described as evidence from Penguin or NextGen.

## Safety and failure response

If the tool prints `"ok":false`, treat the check as **held**, not as a partial production success. It never auto-restarts, rotates keys, grants authorization, replays business workloads, or modifies the resident broker. The local code may have executed a harmless content-hash before a journal read failed; missing journal evidence must not be silently replaced or reported as verified.

Do not merge or deploy the stacked drafts until the existing runtime Identity/Passport boundaries and current signed-device trust are reviewed. Actual Systemia work completion, customer delivery and payments require independent authoritative receipts, not just a device signature.

## CI

`node --test systemia/saban/microseed-local-field-proof.test.mjs`

The isolated workflow `.github/workflows/systemia-on-node-field-proof.yml` also runs the native agent/Gateway and Passport evidence regressions, and packages a portable field kit with a SHA-256 checksum. It runs only test fixtures. No physical devices are contacted.
