# Evercraft Fabric on ChatGPT via Secure MCP Tunnel

This is the fast, zero-Base44 bridge for connecting the native Evercraft Fabric directory to a private ChatGPT developer-mode plugin while the production public edge is still being field-certified.

## What runs locally

Run:

```bash
npm run fabric:local
```

The process binds to `127.0.0.1:8787` by default and exposes:

- `http://127.0.0.1:8787/mcp`
- `http://127.0.0.1:8787/health`

It exposes only the native read-only Fabric directory contract:

- `match_evercraft_capability`
- `list_evercraft_capabilities`
- `get_evercraft_connection_options`

Legacy Base44 MCP connection URLs are filtered out of this runtime's catalog. This bridge does not create checkout, payments, publishing, deployment, private Systemia access, or other consequential authority.

## Secure MCP Tunnel

OpenAI Secure MCP Tunnel can connect this loopback MCP to ChatGPT developer mode through an outbound-only tunnel. The local MCP does not need a public listener.

Create/manage the tunnel in the OpenAI Platform tunnel settings, then run OpenAI's current `tunnel-client` on the same Chromebook/Linux environment using this local target:

```
http://127.0.0.1:8787/mcp
```

Use the tunnel ID when creating the developer-mode plugin in ChatGPT.

Do not commit the tunnel runtime API key. Raven Nexus or another approved private secret surface should hold it.

## Boundary

Secure MCP Tunnel is a private/developer-mode bridge. It does not satisfy public Plugins Directory submission. Public publication still requires the stable Evercraft-owned HTTPS origin and the normal OpenAI review/publication flow.
