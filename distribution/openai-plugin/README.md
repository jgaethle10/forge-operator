# OpenAI public plugin submission packet

This directory is the canonical account-side submission packet for the **Evercraft** public plugin.

The product-facing source package lives at `plugins/evercraft-fabric/`. The public listing should present Evercraft as one problem-first front door into the broader Evercraft/Systemia capability fabric, not as a separate Machine Commerce product.

## Current transport

The submission packet now references the Evercraft-owned Fabric MCP at `https://fabric.systemiacommandcenters.com/mcp`. The owned route has recorded public HTTPS and external-canary evidence, while the legacy Base44 transport is retained only as inactive compatibility history.

The owned Evercraft Fabric MCP is implemented in `systemia/mcp/fabric-directory.mjs` and served by the Fabric runtime. Provider review, approval, publication, and directory pickup remain external states and must never be inferred from source readiness alone.

## Prepared

- canonical listing copy for **Evercraft**
- current universal remote MCP URL
- website/support/privacy/terms URLs
- starter prompts
- at least five positive review cases
- at least three negative review cases
- current commercial and safety boundaries
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
