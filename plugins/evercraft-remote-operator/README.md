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
- `remote_list_files`
- `remote_read_file`
- `remote_write_file`
- `remote_exec`

Read operations still require the client credential. File writes and program execution also require an explicit `approval_ref`, and the node enforces its own filesystem/program policy after the gateway authenticates.

## Trust boundary

Installing this plugin does not authorize a device. The node must separately be admitted through the Evercraft remote-device trust loop. Revoking that device invalidates its live session and remote control grant.

The node opens every network connection. The plugin creates no inbound port on the user machine.
