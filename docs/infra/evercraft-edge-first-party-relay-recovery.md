# Evercraft Edge recovery: first-party relay, not an assumed public route

**State:** engineering/review only. This document grants no host, DNS, payment, or publishing authority.

## Observed incident (2026-10-20 Pacific)
- Penguin Fabric `127.0.0.1:8787/health` worked; Caddy on `:8443` answered with hostname-bound local HTTPS.
- Independent Chromebook Operator Public Edge Canary run [39536943303](https://github.com/jgaethle10/forge-operator/actions/runs/39536943303) observed public TCP 80/443 timeouts and did **not** verify public MCP.
- ChromeOS update turned off Linux port forwarding; Chromebook Wi-Fi IP changed from `192.168.88.3` to `192.168.88.5`. The resident router mapping still targeted the old address. Restarting Penguin did not make an external HTTPS canary green.
- A separate, green **Specialist Edge External Canary** skipped the HTTPS/MCP test because its required specialist origin was not configured; it cannot substitute for the universal Fabric external canary.
- Evercraft Payments remained `held_owned_payment_endpoint_unconfigured`. Restoring network ingress is not a payment receipt.

## October 21 verified recovery and separate readiness gates

**Field fix, operator executed:** the router's UPnP entries WAN TCP 80 and TCP 443 had still pointed at `192.168.88.3`, although ChromeOS Wi-Fi was at `192.168.88.5`. The bounded operator-confirmed repair updated only the precisely named Evercraft web entries to `.5:18080` and `.5:8443`. The router read them back successfully. Do not rerun this old-address repair or blindly delete mappings after they are corrected.

**Independent witness:** GitHub run [39635483612](https://github.com/jgaethle10/forge-operator/actions/runs/39635483612) on the recovery branch passed the new `scripts/fabric-ingress-external-canary.mjs` with `public_dns`, TCP80/443, trusted TLS, runtime health, ChatGPT-style GET/SSE, signed device attestation, MCP initialize, read-only tools/list and a real nontransactional tools/call all true. This is an externally witnessed **ingress-and-read-only-MCP** receipt, not blanket platform launch readiness.

**Separate remaining holds:**
- The *full operator public-edge canary* still fails at `journal_live_edition_missing`. The current `public/journal/index.json` intentionally says `live_edition:false` with no current stories. Never fabricate freshness, reactivate expired articles, or bypass editorial approval to make the full canary green.
- The dedicated installed `Evercraft_Fabric` connector reported provider probe HTTP 429 while another `Evercraft` connector successfully served read-only capabilities. Investigate the connector/provider binding separately from the now-proven public endpoint.
- Customer payment/fulfillment and complete product publishing are not attested by ingress success.

**Prevention and operations:**
1. Reserve `192.168.88.5` for the Chromebook's **actual ChromeOS Wi-Fi MAC address** in the gateway DHCP settings; record the reservation without posting MAC addresses publicly. Do not assume Crostini's internal `100.115.*` address is the router target.
2. Keep ChromeOS Linux forwarding TCP `18080` and `8443` enabled.
**Lease-renewal caution (October 21 patch):** a correctly owned UPnP mapping is not necessarily permanent. The resident v2 script records its last successful owned renewal by LAN host/scope, uses a six-hour upper interval rather than re-adding on every ten-minute tick, and also renews verified finite leases when the router reports one hour or less remaining. A router response reporting lease `0` is treated as nonexpiring. All renewals require readback of the expected Evercraft description, exact ChromeOS Wi-Fi host, internal port and enabled state. If ownership changes, renewal fails closed without deleting the entry. If a same-owner renewal is rejected, public ingress might still work until lease expiry; do not reset the router or delete entries automatically. Fix or confirm with a scoped external ingress check and operator review.

**Deployment boundary:** changes to `scripts/evercraft-public-edge-map.mjs` and `scripts/install-fabric-router-map-resident.sh` are on draft PR #1511 only until merged or explicitly staged on Penguin. The currently installed 253-byte `/usr/local/sbin/evercraft-refresh-router-map` does **not** persist receipts and does not pass `--renew-owned`; do not claim six-hour renewal is running on the live machine. A field cutover must preserve `/etc/evercraft/router-map.env` and compare actual ChromeOS IP to `192.168.88.5` before installing. A DHCP reservation for ChromeOS Wi-Fi MAC remains pending.

3. The independent ingress workflow `.github/workflows/evercraft-fabric-public-ingress-monitor.yml` is configured for a 20-minute cadence **when merged into the default branch**. It records real failure stages and artifacts; the PR run passing does not establish that default-branch scheduling is installed.
4. Preserve the full strict canary alongside the ingress monitor. A journal hold and a network outage must have different incident owners and release semantics.
5. If external ingress fails again, inspect actual router target with UPnP GetSpecificPortMappingEntry and compare ChromeOS Wi-Fi IP before any mutation. Never remove unrelated mappings or enable Saban relay solely based on a stale content/publication failure.

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

## Fastest zero-spend recovery attempt: correct stale Chromebook LAN target

**Operator-confirmed** ChromeOS Wi-Fi address on October 20: `192.168.88.5`, previously `192.168.88.3`. The installed router mapping reads `EVERCRAFT_ROUTER_LAN_HOST` from `/etc/evercraft/router-map.env`. A resident timer can faithfully **repeat a wrong address** indefinitely.

Run this only on the **Chromebook Penguin** node after confirming its current ChromeOS Wi-Fi IP is still `192.168.88.5` and the Linux TCP 18080/8443 forwarding switches are enabled:

```bash
sudo cp -a /etc/evercraft/router-map.env /etc/evercraft/router-map.env.before-ip-fix
sudo sed -i 's/^EVERCRAFT_ROUTER_LAN_HOST=.*/EVERCRAFT_ROUTER_LAN_HOST=192.168.88.5/' /etc/evercraft/router-map.env
grep '^EVERCRAFT_ROUTER_LAN_HOST=' /etc/evercraft/router-map.env
sudo systemctl start evercraft-router-map.service
cat /var/lib/evercraft/router-map/latest.json
```

A `systemctl start` failure or an `AddPortMapping` conflict is **not** proof that the external route has recovered. Do not broaden mappings or blindly remove existing rules: old 80/443 entries owned by the former `.3` target may require an exact, owner-confirmed replacement. The update should target `192.168.88.5:18080/8443` only for Fabric web mappings; DNS 53 is a separate service scope. If the ChromeOS IP moves again, update the DHCP reservation and refresh the target rather than assuming the in-guest `100.115.*` address is the router-facing host.

Observe the independently scheduled **Chromebook Operator Public Edge Canary** (not the specialist canary) for actual trusted HTTPS, signed device identity and MCP. If externally unreachable after correcting the mapping, pivot to the authorized Saban outbound architecture below; repeated `19090` phone tests and Crostini self-hairpin curls do not establish customer reachability.

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

## Penguin operator-only v2 timer upgrade

A GitHub PR or a passed external canary is **not** evidence that new router code
is installed on Penguin. The old resident helper is a 253-byte wrapper with no
latest.json receipt. The new upgrade must be staged in a **durable checkout**
because the systemd helper references its repository path after installation.

**Phase A: stage and inspect without modifying the live service.**

```bash
cd ~/.local/share/evercraft/forge-operator
git fetch --no-tags origin fix/fabric-edge-mapping-truth-20261020
RUNTIME="$HOME/.local/share/evercraft/router-map-v2"
# Use a fresh path; never silently reuse a stale worktree.
test ! -e "$RUNTIME" || { echo "STOP: staged worktree already exists"; exit 1; }
git worktree add --detach "$RUNTIME" FETCH_HEAD
bash "$RUNTIME/scripts/upgrade-fabric-router-map-resident.sh" \
  --repo-root "$RUNTIME" --preflight
```

This creates only a durable candidate checkout and performs a read-only
configuration/systemd observation. It does **not** change UPnP, services, DNS,
or router settings. Review the commit and preflight output. Independently
confirm the Chromebook's current **ChromeOS Wi-Fi IP** in ChromeOS settings
and that Linux forwarding for TCP 18080/8443 remains enabled. Do not substitute
Crostini's 100.115.x.x address for the ChromeOS Wi-Fi host. If the target IP
has changed, stop and investigate before proceeding.

**Phase B: separate operator-authorized promotion (only after review).**

```bash
RUNTIME="$HOME/.local/share/evercraft/router-map-v2"
bash "$RUNTIME/scripts/upgrade-fabric-router-map-resident.sh" \
  --repo-root "$RUNTIME" \
  --apply --confirm-ip 192.168.88.5
```

The script requires an interactive `UPGRADE` confirmation. It backs up the
saved router configuration, refresh helper, and systemd service/timer units;
pauses the old timer; runs the web-only installer; demands independent readback
of **both** exact Evercraft labels, internal ports, ChromeOS Wi-Fi target,
`scope=web`, and `public_ingress_verified=false` in its local receipt.
If installation/receipt validation fails, its EXIT trap restores the old
files and the prior timer state without deleting router mappings. Backup
snapshots are retained for operator rollback even after success.

**Final gate:** check the independent outside-in HTTPS/SSE/signed-attestation/
MCP monitor *after* the field upgrade. The local UPnP readback alone cannot
prove public access. Keep the strict Journal canary and payment/fulfillment
gates independent. Do not auto-merge or auto-publish.

## Release gate

**Updated October 21:** the field router repair restored both Evercraft TCP web mappings to the Chromebook Wi-Fi host, and the independent ingress monitor passed HTTPS, SSE, signed device attestation, and real read-only MCP discovery. The v2 **timer hardening remains draft and not installed on Penguin**. The full strict canary remains blocked by `journal_live_edition_missing`, and dedicated installed ChatGPT Fabric provider probing remains separate. No commissioned outbound relay or verified production checkout is implied. Do not mark Evercraft commercially online until separately verifying offer checkout, settled payment and fulfillment.
