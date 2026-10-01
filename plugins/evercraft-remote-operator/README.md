# Evercraft Remote Operator plugin

This plugin connects an MCP-capable AI host to Evercraft Remote Operator.

It does **not** connect directly to a Chromebook, SSH daemon, VNC server or third-party remote desktop provider. The MCP gateway talks to the existing Evercraft remote-capacity fabric, which reaches an exact authorized NodeSeed through an outbound-only encrypted session.

## MCP endpoint

Local development:

```
http://localhost:3000/mcp/evercraft-remote
```

Production uses an independently verified Evercraft-owned HTTPS origin.

## Authentication

The MCP client receives a dedicated Remote Operator **client credential**. That credential authenticates the AI host to the gateway.

The gateway separately holds the NodeSeed **remote control grant**. The control grant is never sent to the AI host, browser or plugin configuration returned to clients.

Required gateway environment:

```
EVERCRAFT_REMOTE_OPERATOR_CAPACITY_ENDPOINT=https://<private-or-protected-broker>/nodes/<node>
EVERCRAFT_REMOTE_OPERATOR_CONTROL_TOKEN=<server-side control grant>
EVERCRAFT_REMOTE_OPERATOR_CLIENT_TOKEN=<client-facing bearer credential>
```

The client bearer and node control grant must be different values.

## Tools

Core node tools:

- `remote_operator_status`
- `remote_network_status`
- `remote_list_files`
- `remote_read_file`
- `remote_write_file`
- `remote_exec`

Host-boundary tools:

- `remote_host_capabilities`
- `remote_host_boundary_status`
- `remote_host_boundary_check`
- `remote_host_boundary_certification`
- `remote_host_capability_admit`
- `remote_host_capability_check`

`remote_network_status` is read-only and returns the authorized node's current network observation: interfaces, routes, listeners, Evercraft service state, router-map configuration, loopback Fabric health, hostname-aware local TLS health, and explicit guest/host boundaries.

`remote_host_capabilities` exposes the typed capability registry, including candidate/admitted state, platform permission scope, mutation authority, privacy properties and node-local field admission.

`remote_host_boundary_check` requests fresh signed evidence from the paired ChromeOS companion for the current compatibility capability. `remote_host_capability_check` is the long-term generic typed path and fails closed until a candidate capability has passed its field gate.

`remote_host_boundary_certification` reconciles the signed host observation with the LAN witness. It never promotes that evidence into a public-route claim.

`remote_host_capability_admit` mutates Evercraft trust state only. It does not mutate ChromeOS. It requires an explicit `approval_ref` and a passing field certification, and the resulting admission is tied to the exact paired observer install ID and cryptographic key fingerprint.

Read operations still require the client credential. File writes, program execution, and host-capability trust admission require their explicit approval semantics, and the node enforces its own policy after the gateway authenticates.

## Trust boundary

Installing this plugin does not authorize a device. The node must separately be admitted through the Evercraft remote-device trust loop. Revoking that device invalidates its live session and remote control grant.

The node opens every network connection. The plugin creates no inbound port on the user machine.
