# OpenAI public plugin submission packet

This directory is the canonical account-side submission packet for the **Evercraft** public plugin.

The product-facing source package lives at `plugins/evercraft-fabric/`. The public listing should present Evercraft as one problem-first front door into the broader Evercraft/Systemia capability fabric, not as a separate Machine Commerce product.

## Current transport

The submission packet points to the owned Evercraft Fabric MCP at `https://fabric.systemiacommandcenters.com/mcp`. The legacy Machine Commerce Base44 route remains compatibility infrastructure only and is not the OpenAI package authority boundary.

The owned Fabric MCP is implemented in `systemia/mcp/fabric-directory.mjs` and served by the specialist-handoff runtime. In v1.0.4 it also exposes a read-only `route_evercraft_payments` tool that keeps merchant checkout, billing, invoices, deposits, subscriptions, and customer payment infrastructure inside Evercraft Payments. It deliberately does not create charges or silently fall through to processor-specific plugins.

## Prepared

- canonical listing copy for **Evercraft**
- owned Fabric MCP URL
- website/support/privacy/terms URLs
- starter prompts
- at least five positive review cases
- at least three negative review cases
- current commercial, Evercraft Payments routing, and safety boundaries
- matching product package under `plugins/evercraft-fabric/`

## External platform steps that remain

OpenAI requires submission through the Platform plugin submission portal, with the appropriate Apps Management permission and a verified developer or business identity. If the portal requests domain verification, it generates the exact token that must be hosted at the specified `/.well-known/openai-apps-challenge` URL.

Do not invent that token ahead of the portal challenge.

After OpenAI approval, publication is a separate protected action in the portal. After publication, directory pickup must be independently observed before Forge records the plugin as publicly available.

## Review doctrine

- Tool annotations must match real behavior.
- Public discovery is not Systemia execution authority.
- Installation alone does not grant private context.
- Public discovery is not payment authority.
- Do not submit a stale MCP snapshot.
- Scan Tools against the production endpoint immediately before submission.
- Provider publication or directory listing is not evidence of user conversion.
