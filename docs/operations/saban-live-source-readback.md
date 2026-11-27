# Saban live signed-source readback | one-shot, fail closed

This command bridges the existing **Yard → authorized outbound broker → NodeSeed Ed25519 challenge → paged Remote Operator read → Saban SHA-256 verification**. It does not create a second scheduler, deploy code, execute shell commands on the node, or bypass Systemia/Passport authorization.

It is deliberately restricted to one *public-source canary* under the NodeSeed's already-admitted `evercraft` filesystem root:

```text
systemia/saban/attested-remote-source.mjs
```

The expectation is computed from an **explicitly pinned Git commit in the coordinator's existing local repository** using read-only Git commands. No fetch, checkout, pull, or credential retrieval is performed. The exact file bytes and digest must match the admitted remote file. The caller must independently trust the pinned Git commit's origin. Merely naming a commit is not a signed release attestation.

## Preflight: existing authority only

Use on an authorized *coordinator host* that already has both a local copy of `forge-operator` and the private Yard deployment state for an existing outbound remote-capacity broker. This may be NextGen or another authorized owner-controlled coordinator. Do **not** assume Penguin's Crostini instance is a field-certified physical node.

Require all of these facts **before** running: exact broker deployment ID, exact connected/authorized node ID, its independently admitted device fingerprint, a verified HTTPS broker route, and a local pinned Git commit containing the canary. Never copy an allocator token into this command or a chat message.

The CLI verifies a preexisting, owned and non-group-writable Yard state directory with its existing private authority subdirectories. It refuses to initialize an empty Yard state. Only the fixed public canary can be requested. No arbitrary paths, remote commands, sudo, or loopback override are accepted.

```bash
cd "$HOME/.local/share/evercraft/forge-operator"

node systemia/saban/live-source-readback.mjs \
  --repo "$PWD" \
  --yard-state /ABSOLUTE/PATH/TO/EXISTING/PRIVATE/YARD/STATE \
  --broker-deployment EXISTING_BROKER_DEPLOYMENT_ID \
  --node-id EXACT_ADMITTED_NODE_ID \
  --git-commit FULL_REVIEWED_40_CHARACTER_COMMIT_SHA
```

The command prints a JSON receipt to standard output and exits **0 only for** `signed_live_session_canary_matched`; otherwise it exits **3** and reports HOLD. Do not run it from an unreviewed Git checkout. Use the actual pinned commit reviewed for the intended NodeSeed release, not blindly whatever `main` currently points at.

### Evidence semantics

A successful run proves that, **at observation time**, a Yard-authorized broker session for the selected device fingerprint completed a fresh NodeSeed signed challenge, and the authorized node's requested public-source canary returned complete byte-accurate pages matching the pinned Git commit.

The JSON receipt deliberately keeps these independent boundaries:

- `remote_node_identity_attested` and `source_bytes_verified`: only true after signature and complete-source checks
- `live_running_process_verified: false`: the canary is an installed/source file check, **not** proof which source path a currently running systemd process loaded
- `physical_hardware_verified: false` and `field_verified: false`: no Node 001 physical acceptance without separate real field evidence
- `local_git_object_pinned: true`: **not** proof the coordinator committed or signed that source in advance
- `live_workload_or_deployment_mutated: false`: the command does not write remote source files, restart services or dispatch tasks
- `node_and_broker_metadata_receipts_may_append: true`: the existing attestation, control-grant and read endpoints may append **audit receipts** to their ordinary internal journals
- `source_content_returned: false` and `credentials_returned: false`: private payloads/tokens are not included in the displayed receipt

This readback does not establish that model-written code is correct, a task is finished, an arbitrary file is safe to expose, or physical hardware has passed field certification. It cannot bypass missing Yard authority or fix stale releases. A mismatch is diagnostic evidence, not permission to deploy automatically.

## CI and scope

```bash
node --test systemia/saban/live-source-readback.test.mjs
node systemia/saban/attested-remote-source.proof.mjs
```

The first command tests deterministic Git-pinned expectations and fail-closed preflight conditions. The second runs a real **synthetic loopback** Yard/broker/NodeSeed proof, which is intentionally separate from the HTTPS-only live CLI. They are included in the **existing** Saban multiplier CI, not a new workflow or resident heartbeat.

If no existing authorized broker or live Remote Operator is available, the truthful status is **HOLD**. Do not manufacture a control grant, expose a port, substitute cloud compute, install another scheduler or restart the running company machine just to make this proof green.
