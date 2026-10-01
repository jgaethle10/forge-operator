# Chromebook edge resilience

Evercraft treats the Chromebook as legitimate authorized compute, but not as an infallible datacenter edge.

## Failure domains

The production path is intentionally decomposed into independently observable boundaries:

```
public DNS
  -> router WAN mapping
  -> ChromeOS host port forwarding
  -> Crostini / Penguin
  -> Caddy TLS edge
  -> loopback Fabric runtime
```

A green inner layer does not imply a green outer layer.

The resident node observer can verify the Crostini-visible portion of the chain. It can see Linux interfaces, default routes, listening ports, Evercraft services, router-map configuration, Fabric loopback health and hostname-aware local TLS health. It cannot truthfully inspect or toggle ChromeOS host port-forward state from inside the guest.

The independent GitHub external canary verifies the opposite direction from outside the node: public DNS, trusted TLS, public health, policy pages, MCP transport and device attestation.

Together these two receipts bracket the failure domain instead of forcing a human to reconstruct the topology manually.

## Resident components

- `evercraft-fabric.service`: loopback Fabric runtime.
- `evercraft-public-edge.service`: Caddy TLS edge.
- `evercraft-router-map.timer`: reasserts compatible router mappings.
- `evercraft-network-observer.timer`: snapshots read-only node/network state every two minutes.
- `evercraft-fabric-update.timer`: fail-closed source updater that runs proofs before restart.

The self-updater reasserts the network observer after every healthy update so observability is part of the deployed product, not an optional debugging script.

## Remote operations

The preferred management path is outbound-only:

```
Chromebook local organism
  -> outbound remote-capacity agent
  -> authorized Evercraft broker
  -> bounded Remote Operator
```

Remote Operator status carries the node network observation. The MCP-facing `remote_network_status` tool is read-only and does not require a mutation approval reference.

Write and execution operations remain separately approval-gated.

## Public-edge strategy

Direct residential ingress can remain useful for a field node, but it has a host-level ChromeOS boundary and should not be confused with an always-on public edge guarantee.

Long-term public continuity should use Saban hardware federation: keep stable public ingress on an explicitly authorized edge host and let the Chromebook attach outbound as compute. The Chromebook can disappear, reboot, move networks or sleep without becoming the single point of failure for the public origin.

No discovered machine becomes usable merely because Saban can see it. Enrollment, attestation and explicit authorization remain mandatory.
