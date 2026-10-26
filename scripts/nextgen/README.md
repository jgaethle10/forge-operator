# NextGen: secure local-to-remote admission

**Goal:** move beyond Node002 shadow telemetry to founder-authorized, receipt-backed Systemia operations on the physical HP's Ubuntu WSL2. This code **does not remotely connect to NextGen by itself**, enable remote jobs, or approve an unknown device.

## Reuse the existing Evercraft stack

- `systemia/compute/remote-operator.mjs`: bounded node operations, named roots, receipt ledger
- `systemia/network/outbound-node-agent.mjs`: outbound encrypted transport
- `systemia/network/outbound-capacity-broker.mjs`: exact node/device admission and control grant
- `systemia/remote-operator/mcp-gateway.mjs`: independent client token and restricted MCP tools
- `systemia/compute/enable-remote-operator-user.sh`: existing canonical local NodeSeed installer

The connected Evercraft and Evercraft Fabric ChatGPT apps currently expose only public-safe read-only capability discovery. The distinct `/mcp/evercraft-remote` operator app must be deployed and connected independently. A GitHub route or source file does not prove a live deployment.

## Read-only diagnostic on the actual NextGen WSL2 machine

From a reviewed Forge checkout:

```bash
npm run nextgen:doctor
```

The diagnostic reports **readiness classes only**, never a broker URL, device fingerprint, credential or private file content. A local startup receipt claiming `connected` is not accepted as live control proof. The existing separate Node002 agent can remain in shadow mode.

## One-time local, explicitly owner-authorized enablement

Only if the machine, broker URL, Node 22+, user systemd and source checkout have been independently verified:

```bash
bash scripts/nextgen/enable-authorized-operator.sh --apply --approval-ref owner:nextgen-local-enrollment
```

This runs the existing reviewed user-mode installer, not an arbitrary remote shell or privilege escalation. It may change local Evercraft user services; inspect the installer first. It does **not** change the pre-existing Node002 shadow agent, authorize Yard, or open inbound ports. Machine-level setup requires the owner to run this once on the real host or use another separately authorized existing computer-control path.

## Trust and connected tool activation

1. NodeSeed generates its own attestation and pending enrollment request.
2. Yard approves **that exact** device fingerprint / node ID after independent verification and an explicit owner grant.
3. The outbound session connects and authenticates the actual NodeSeed.
4. The remote MCP endpoint is published at a verified Evercraft HTTPS origin and connected with a dedicated *client* credential, never the broker grant.
5. A read-only status or file probe from this ChatGPT session confirms current live access.
6. **Before writes or executions**, the Remote Operator gateway requires a trusted server-side scoped-approval verifier. It must atomically consume an approved, exact operation/root/payload digest. The new draft gate fails closed if no verifier exists; a client-supplied `approval_ref` string is insufficient.
7. Only then may separately owner-approved bounded jobs be executed with receipts and uncertainty holds on partitions.

## Laser Foundry: first approved product operation

The previously created exact ZIP is pinned with SHA256:

`bef6b86a0494b04f6823928e5f784c100f188b4aba51f363fe6a4e55e9e6b151`

Once file-write authority is independently verified, a scoped authorized operation may stage **those exact ZIP bytes** at:

`~/.local/share/evercraft/staging/laser-foundry-v2-approved.zip`

After separate owner approval, the existing restricted `npm run` maintenance program within the reviewed Forge checkout can invoke:

```bash
npm run nextgen:laser:extract
```

This is an offline archive extraction **only**. It requires the exact digest and allowlisted 12 filenames, refuses duplicate ZIP members, non-files/symlinks, unsafe paths, oversized decompression and existing destinations; it writes its receipt into the installed source tree. It **does not** install Python dependencies, start a network service, or claim a successful live NextGen installation. Those require separate trust, approval and positive local service tests.

## Evidence

```bash
node --test systemia/compute/nextgen-remote-doctor.test.mjs
python3 -m unittest discover -v -s scripts/nextgen -p 'test_*.py'
node systemia/remote-operator/mcp-gateway.test.mjs
node systemia/network/remote-operator.proof.mjs
```

CI exercises synthetic local fixtures and an ephemeral loopback NodeSeed + broker. **Neither proves physical HP reachability or current remote-control entitlement.** Keep all production mutation approvals off until the real scoped approval ledger verifier is wired.
