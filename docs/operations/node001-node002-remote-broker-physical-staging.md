# Node001 → Node002 remote broker: physical staging gate

Date: 2026-10-27. Canonical implementation tracking: #1332.

## Physical observations, not assumed production success

- Chromebook Penguin: system NodeSeed is active with installed Compute source at \`/opt/evercraft/forge-operator\`. Operator preflight reports broker workload source support, but public Fabric \`/v1/remote/health\` and local Fabric \`127.0.0.1:8787/v1/remote/health\` both returned HTTP 404. Caddy has the existing Fabric proxy to \`127.0.0.1:8787\`, but no visible broker paths.
- Chromebook \`evercraft-remote-admission.service\` was skipped by \`ExecCondition\`: \`EVERCRAFT_REMOTE_BROKER_URL\` is absent in its private NodeSeed configuration. Do **not** fill this prematurely: the service would then attempt outbound admission.
- Node002 HP: resident organism and NodeSeed local health are good, previous local Yard/Browser proof passed, production identity not authorized; the legacy agent remains shadow-only, remote jobs disabled, telemetry ingest HTTP 402.
- Two integration proofs executed on actual HP returned \`ok:true\` using **temporary local node identities**: \`remote-capacity-broker-proof.mjs\` and \`remote-device-trust-loop.proof.mjs\`. They verified source/runtime protocol behavior, *not* a live two-device dispatch.

## Stage gates

1. **Physical live-capacity proof (read-only).** On Chromebook from reviewed source, run \`sudo node scripts/remote-broker-physical-preflight.mjs\`. It reads no credential values and binds its local capacity GET to 127.0.0.1 even when the receipt advertises a LAN host. It cannot declare public readiness.
2. **Broker supervisor design (review required).** Deploy \`systemia.remote-capacity-broker.v1\` via Yard against the existing NodeSeed, with stable private broker/Yard state roots, an immutable actual installed source reference, receipt binding, a lease-renewal keeper, a fixed loopback listener and systemd ownership/lifecycle. Runtime source supports broker workload, but there is currently **no independently verified resident broker deployment**. A transient interactive Node process is not production supervision. Verify lease expiry handling and restart/recovery before promotion.
3. **Ingress isolation (review required).** A distinct HTTPS hostname is preferred over stealing the working Fabric route. If path-based routing is necessary, preserve \`/mcp\` and all existing product handles and add only exact \`/v1/remote/*\` and \`/nodes/*\` proxy matches, backed by a healthy loopback broker. Stage and validate Caddy configuration first; never restart the running public edge on a speculative config. Prove independent external TLS + broker instance/receipt health, then record Yard public-route verification.
4. **Device trust.** Before configuring either actual machine for remote admission, use Yard pending-device review with the expected node ID and opaque candidate ref. Require explicit current owner approval and a broker lease-gated authorization receipt. Enrollment-request files alone grant no authority.
5. **Real workload canary.** First authenticated read-only remote operator status/health call and identity binding. Next, one owner-approved, bounded inventory-only job on the actual HP and a fresh Node002-origin receipt. Reconcile separate production shadow telemetry HTTP 402; never treat it as authority to bypass the broker.
6. **Rollback.** Revoke exact enrolled device, stop only the broker workload, release lease and route independently; verify Fabric \`/mcp\` stays healthy. Protect the pre-change Caddy configuration and restore only by explicit review if modification was made.

## Rules

No new tower, cloud host or paid provider required for local proving; no broad SSH/TTY, public HP listener or arbitrary remote execution. Caddy public health and installed feature strings must never be reported as live remote admission. RIVET/AliEV legal holds remain in effect.

### Acceptance

- Durable supervised broker process and bound Yard deployment receipt;
- fresh independent HTTPS health with matching instance ID and deployment receipt;
- exact explicitly approved physical Node002 device;
- live outbound-only connection and a new, real signed execution result;
- unchanged existing Fabric customer/MCP endpoints;
- verified revocation and rollback.
