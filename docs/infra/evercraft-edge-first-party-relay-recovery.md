# Evercraft Edge recovery: first-party relay, not an assumed public route

**State:** engineering/review only. This document grants no host, DNS, payment, or publishing authority.

## Observed incident (2026-10-20 Pacific)
- Penguin Fabric `127.0.0.1:8787/health` worked; Caddy on `:8443` answered with hostname-bound local HTTPS.
- Independent Chromebook Operator Public Edge Canary run [39536943303](https://github.com/jgaethle10/forge-operator/actions/runs/39536943303) observed public TCP 80/443 timeouts and did **not** verify public MCP.
- ChromeOS update turned off Linux port forwarding; Chromebook Wi-Fi IP changed from `192.168.88.3` to `192.168.88.5`. The resident router mapping still targeted the old address. Restarting Penguin did not make an external HTTPS canary green.
- A separate, green **Specialist Edge External Canary** skipped the HTTPS/MCP test because its required specialist origin was not configured; it cannot substitute for the universal Fabric external canary.
- Evercraft Payments remained `held_owned_payment_endpoint_unconfigured`. Restoring network ingress is not a payment receipt.

## Preferred architecture: Evercraft Network + Saban + Evercraft Edge

Do **not** create an independent fourth networking stack.

- **Evercraft Network (control/observation):** collect node/route health, failure domains, reachability, identity freshness, durable receipt references, offline/partition classification and router-address drift. Discovery never grants execution or authorizes a production DNS route. Its mesh/aircraft/offline continuity proofs are not evidence of a deployed public gateway.
- **Saban / Evercraft Compute (admission + data path):** use the existing `systemia/network/outbound-capacity-broker.mjs`, `outbound-node-agent.mjs`, `federated-service-bridge.mjs`, authorized NodeSeed identities and Yard lease/relay APIs. The agent connects **outward** to an already reachable broker; a short-lived single-service relay handles Fabric requests. No inbound Penguin or Node002 shell is granted, and the gateway never gets allocator authority.
- **Evercraft Edge (public ingress):** place Caddy with valid HTTPS/TLS and a loopback-only Saban federated bridge on a **real externally reachable node**. The gateway has a stable service identity, route and health/rollback receipts independent of which compute node runs the read-only Fabric.
- **Systemia (authority and recovery):** route creation/renewal and promotion require admission, external canaries and explicit operational authority. Handle broker restarts by reconstructing scoped relay authority from attested identity and deployment receipts, not persisted relay tokens (track #852).
- **Payment authority remains separate:** public access does not confer payment capability or proof of checkout, settlement or delivery.

Existing source-level software proof: `systemia/saban/fabric-edge-relay.proof.mjs` performs a two-node Fabric -> outbound broker -> federated bridge -> signed attestation -> MCP initialize/tool roundtrip. It is a **local proof only**, not an operating public endpoint. The related #719 PR must be reconciled against main before production promotion; do not assert it is merged.

### Route admission decision

| Condition | Permitted status |
|---|---|
| Penguin Fabric healthy; no verified external host | `local_only_public_held` |
| Authorized Saban broker + outward agent, but no trusted public HTTPS | `private_relay_only` |
| Trusted public HTTPS host + scoped broker relay + fresh identity/route receipt | `external_canary_required` |
| Exact production hostname verified externally for TLS, health, signed identity and read-only MCP | `public_route_verified` |
| Provider checkout/settlement/fulfillment unverified | `commerce_held` regardless of route |

The SSH `-R` reverse-relay scripts remain a narrowly scoped **fallback** transport for an already authorized relay host. Do not run both against the same production hostname without a supervised migration/rollback. Saban's logical capacity or local mesh alone does not remove the requirement for a public ingress host.

## Why a first-party outbound relay

Our existing assets:
- `scripts/install-fabric-outbound-relay.sh`: outbound SSH reverse forward from Fabric loopback to a **loopback-only** port on a separate relay node.
- `scripts/install-fabric-relay-node.sh`: public Caddy HTTPS reverse proxy from relay-node loopback to its local reverse socket.
- `tests/fabric-outbound-relay.test.mjs`: source-level security checks.
- PR [#786](https://github.com/jgaethle10/forge-operator/pull/786) covers relay SSH enrollment hardening (currently not merged); PR [#719](https://github.com/jgaethle10/forge-operator/pull/719) covers an alternative Saban federation path (not deployed by this work). Reconcile rather than combining unreviewed authority paths.

**Critical external requirement:** an independently reachable, authorized public HTTPS host is necessary. Hosting it on Node001/Node002 behind the same blocked home WAN does not magically create public ingress. No new server or bill is approved by this runbook.

```text
External client -- trusted HTTPS:443 --> authorized public relay node/Caddy
                                               |
                                  loopback 127.0.0.1:18787
                                               |
                                 SSH -R, initiated outbound by Penguin
                                               |
                                 Fabric 127.0.0.1:8787 (read-only MCP)
```

## No-cutover sequence

1. Identify an **existing** independently reachable host, its owner, SSH host-key fingerprint, real external IP and upstream TLS/ACME capability. If absent, **hold**: do not manufacture a public URL, pay for hosting, or silently use a third-party intermediary.
2. Review/merge the scoped relay account controls from #786 or independently establish equivalent restrictions: dedicated unprivileged account, public-key-only auth, `AllowTcpForwarding remote`, `GatewayPorts no`, `PermitListen 127.0.0.1:18787`, no shell, no agent/X11 forwarding, no password login, pinned known hosts, and safe key custody.
3. Stage the public relay node and reverse-SSH client using the *existing* scripts after explicit owner approval. Confirm that the relay-node Caddy sees the SSH socket **only on loopback**. Do not expose port 18787 to the internet.
4. Prove from the **public host itself**, independently of the home router, that `127.0.0.1:18787/health` reaches the expected read-only Fabric instance and preserves the signed NodeSeed identity/attestation. Review the exact deployment and source SHA receipts.
5. Stage a **new test hostname** in an approved DNS zone, with real trusted HTTPS. Run an external canary that executes (rather than skips) TLS, `/health`, MCP initialize, `tools/list`, and a read-only `tools/call`, plus negative tests for forbidden write/payment authority. A passing source build or router acknowledgement is insufficient.
6. Only with those receipts, owner approval, rollback DNS TTL/previous target and monitored canary, cut over `fabric.systemiacommandcenters.com`. Keep product checkout disabled until Evercraft Payments proves its own separate authoritative flow.
7. Add uptime/failure alerting for host availability, tunnel reconnects, peer fingerprint, TLS expiry, exact production origin, stale signed attestations and external MCP. Never classify `workflow success` as `external_verified` if the verification step was skipped.
8. Retire the old WAN/UPnP web forwarding only **after** proven relay cutover; remove temporary test port 19090 and any obsolete rules. Preserve the ability to roll back safely.

## Router control-plane truth (this change)

`scripts/evercraft-public-edge-map.mjs` now assesses **all selected non-diagnostic mappings**, including HTTP 80 and HTTPS 443, not just production-labeled DNS 53. It reports separate `web_mapping_control_ok`, `dns_mapping_control_ok`, and `missing_production_mappings` fields. Its `public_ingress_verified` field is always `false` because only the independent external canary can verify that fact.

An accepted UPnP/NAT-PMP/PCP mapping proves configuration acknowledgement, **not** host forwarding, trusted TLS, live public MCP, or payment. Host-forward self-probes from Penguin are advisory because Crostini-to-ChromeOS hairpin behavior is not authoritative.

## Release gate

**Current:** local Fabric healthy, public HTTPS/MCP failed external verification, relay node not commissioned, payments held. Do not mark Evercraft commercially online until independently verified exact-origin ingress **and** separately verified offer checkout, settled payment, and fulfillment.
