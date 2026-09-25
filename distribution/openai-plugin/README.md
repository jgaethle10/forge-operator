# OpenAI public plugin submission packet

This directory packages the existing Evercraft Machine Commerce remote MCP for OpenAI's public Plugins Directory review.

The source of truth for actual tool behavior is the deployed MCP plus the public Evercraft machine-commerce and CHUM contracts. This packet must never be used to advertise a tool or payment authority that is not live-verified.

## Prepared

- public listing copy
- universal remote MCP URL
- website/support/privacy/terms URLs
- starter prompts
- five positive review cases
- three negative review cases
- release notes
- current commercial and safety boundary

## External platform steps that remain

OpenAI requires submission through the Platform plugin submission portal, with the appropriate Apps Management permission and a verified developer or business identity. If the portal requests domain verification, it generates the exact token that must be hosted at the specified `/.well-known/openai-apps-challenge` URL.

Do not invent that token ahead of the portal challenge.

After OpenAI approval, publication is a separate protected action in the portal.

## Review doctrine

- Tool annotations must match real behavior.
- Public discovery is not payment authority.
- Do not submit a stale MCP snapshot.
- Scan Tools against the production endpoint immediately before submission.
- Provider publication or directory listing is not evidence of user conversion.
