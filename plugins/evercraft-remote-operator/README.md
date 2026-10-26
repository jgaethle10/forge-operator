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

- `remote_operator_status`
- `remote_network_status`
- `remote_list_files`
- `remote_read_file`
- `remote_write_file`
- `remote_exec`

`remote_network_status` is read-only and returns the authorized node's current network observation: interfaces, routes, listeners, Evercraft service state, router-map configuration, loopback Fabric health, hostname-aware local TLS health, and the explicit ChromeOS/Crostini host boundary. It does not toggle forwarding or mutate the network.

Read operations still require the client credential. File writes and program execution also require an explicit `approval_ref`, and the node enforces its own filesystem/program policy after the gateway authenticates.

## Owner Passport approval for mutations

A client bearer credential is authentication for **read-only** inspection; it
is not owner approval for writes or execution. A caller-supplied
`approval_ref` cannot approve itself.

`registerRemoteOperatorMcp(app, options)` has an optional, trusted server-only
`options.passport` and `options.ownerSubjectRef` configuration. Those must
be supplied by the authenticated Systemia owner-control plane from its
protected durable Passport state. When provided, the gateway internally
binds exact one-time Passport action permits to the node ID parsed from
its **server-owned** `/nodes/<node-id>` capacity endpoint. It does not
accept a node identity from MCP arguments.

The permit must be minted through an independently authenticated owner
workflow, with product `evercraft.remote-operator`, scope
`remote_operator.remote_exec` or `remote_operator.remote_write_file`,
resource `node:<node-id>/root:<root-key>`, and request fingerprint
`sha256:` plus SHA-256 of the **exact JSON request argument payload**.
Its ID must be a `permit_...` reference. Exact content, command args,
named filesystem root, and approval reference are all included in that
digest. Passport checks grant state/expiry, cancels, exact scope and
actor; then atomically consumes that permit **before** any remote call.
A second attempt requires a fresh independently approved permit.

The default `registerRemoteOperatorMcp(app)` used by `server.ts` injects
**no owner Passport authority**. It therefore permits authenticated
reads when separately configured but **fails closed for both mutations**.
Installing this plugin, adding environment bearer tokens, or deploying
a broker does not activate writes/exec on its own.

Do not expose the Passport state directory, mint/grant operations, owner
subject management, or server-only approval injection to MCP clients. The
synthetic proof permits in CI are not production owner authentication.
Until the HTTPS broker, Yard exact-device trust, authenticated Passport
issuer and independently connected Remote Operator are verifiably live,
the physical NextGen HP remains local-only.

## Trust boundary

Installing this plugin does not authorize a device. The node must separately be admitted through the Evercraft remote-device trust loop. Revoking that device invalidates its live session and remote control grant.

The node opens every network connection. The plugin creates no inbound port on the user machine.
