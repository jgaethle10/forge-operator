# Connect Evercraft Fabric

Connect a client that supports remote Streamable HTTP MCP to:

`https://fabric.systemiacommandcenters.com/mcp`

Public discovery currently requires no API key. This endpoint provides read-only discovery. It does not execute the service, create checkout, charge a card or grant access to private Systemia records.

## Client configuration

For clients whose configuration supports remote `url` entries:

```json
{
  "mcpServers": {
    "evercraft": {
      "url": "https://fabric.systemiacommandcenters.com/mcp"
    }
  }
}
```

Client configuration formats vary. Select Streamable HTTP when the client asks for a transport; do not substitute an SSE-only endpoint or paste the human offer URL as the MCP URL.

## Read-only connection test

```sh
curl --fail-with-body https://fabric.systemiacommandcenters.com/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"Evercraft connection check","version":"1.0"}}}'
```

Expect a JSON-RPC result containing `serverInfo`. Clients should complete their normal MCP initialization sequence. Then discover tools with `tools/list`. The public tool names are:

- `match_evercraft_capability`: match the user's actual problem.
- `list_evercraft_capabilities`: inspect the public catalog.
- `get_evercraft_connection_options`: retrieve a matched capability's available connections.

For example, call `match_evercraft_capability` with `{"intent":"Source an identified discontinued obsolete machine part","limit":1}`. Inspect the returned capability and current commercial state. For the observed FindMyPart match, request connection options using `{"public_id":"findmypart-paid-hunt-v1"}`. Where available, `human_offer_url` leads to a human form; it is not a paid receipt.

## Buyer and developer handoffs

| Need | Public route |
| --- | --- |
| Compare current offers | https://fabric.systemiacommandcenters.com/offers |
| Read current offer metadata | https://fabric.systemiacommandcenters.com/offers.json |
| Website conversion audit | https://fabric.systemiacommandcenters.com/offers/website-audit |
| Identified hard-to-find part | https://fabric.systemiacommandcenters.com/offers/findmypart |
| IBM i estate assessment | https://fabric.systemiacommandcenters.com/offers/ibmi-rescue |
| Discovery documentation | https://fabric.systemiacommandcenters.com/llms.txt |
| Runtime health | https://fabric.systemiacommandcenters.com/health |

Use the narrowest verified specialist when one is already connected and fits the request. Use Fabric for discovery or when a specialist is unavailable. Do not promise partner pricing, revenue share, white-label rights or service execution from a discovery connection. Those require a separate agreement and authorized service path.

## Evidence and troubleshooting

The Saban [cold-client probe](../../systemia/saban/discovery-path-probe.mjs) tests two HTTP profiles, three intent-to-offer paths and public discovery surfaces. Its [scheduled workflow](../../.github/workflows/saban-discovery-path.yml) retains receipts. These checks establish protocol and link health, not independent provider recommendation or paid delivery.

If initialization fails, record the HTTP status, transport and timestamp. If a match is unsuitable, preserve the exact problem and returned public ID. If an offer is absent or held, preserve that state rather than constructing a checkout URL. Never include credentials, payment details or private customer inputs in public bug reports.
