# Evercraft Graphics Department MCP RC001

**State:** review-branch preview prototype, **not deployed** and **not a paid MCP service**.
Systemia founder directive: evercraft-graphics-department-mcp-20261015. Canonical admission and independent specialist dispatch are **not** implied by this code.

## Purpose

Wrap the existing Evercraft Graphics Command commercial renderer in a guarded MCP boundary. Another model can discover preview capabilities, request branded SVG previews in four aspect ratios, and inspect an HTML exact-frame motion stage. The renderer is deterministic and local. No external image/video model is called; no MP4 is created.

### Tools

- graphics_get_capabilities: reports available preview scope.
- graphics_preview_commercial: SVG in feed, square, story or hero-wide, with SHA-256 receipt and synthetic/unverified labels.
- graphics_preview_motion_stage: HTML motion-stage source, not a finished video.

The first candidate is intentionally Evercraft-branded, and **not yet a white-label production service**.

## Local private demo

Requires Node 20+ and a locally supplied token of at least 32 characters.

    export EVERCRAFT_GRAPHICS_MCP_TOKEN="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")"
    node systemia/mcp/graphics-department-server.mjs

Binds to 127.0.0.1:8766 only. A strong bearer secret is mandatory. No public hosting, external-agent entitlement or buyer charge is activated by running it.

Send POST requests to http://127.0.0.1:8766/mcp/graphics with Authorization: Bearer TOKEN and Content-Type: application/json. Use MCP initialize, tools/list and tools/call.

A tool-call JSON-RPC request:

    {
      "jsonrpc": "2.0",
      "id": 1,
      "method": "tools/call",
      "params": {
        "name": "graphics_preview_commercial",
        "arguments": {
          "product": "Evercraft Visuals",
          "offer": "Creative preview",
          "audience": "Small businesses",
          "offerUrl": "https://example.org/evercraft-offer",
          "priceUsd": 49,
          "sourceRefs": ["https://example.org/evidence"],
          "hook": "A clearer picture",
          "subhook": "A source-labeled synthetic concept",
          "cta": "See what is possible",
          "visualMetaphor": "A visible path from confusion to clarity",
          "format": "feed"
        }
      }
    }

Sources, prices, brands and offers are seller-supplied and **unverified**. Outputs do not claim official source verification, customer outcomes, real video, paid work, autonomous specialist execution or publication authority.

## Tests

    node --test systemia/mcp/graphics-department.test.mjs

The test suite covers deterministic hashes, four formats, motion-stage classification, invalid input, markup/URL rejection, bearer authentication, HTTP bounds and no payment/publication authority.

## Release holds

1. Systemia canonical admission/deduplication and authorized worker leases; separate evidence from Forge, Saban, Raven, Graphics, QA and Payments. This branch alone never proves team participation.
2. Fresh-clone runtime tests and independent client MCP conformance, secure remote authentication, tenant isolation, quotas and worker limits.
3. Rights/licensing checks, allowed asset storage, real source verification, and proof of output fidelity.
4. Actual commerce contract: quote, buyer approval, verified provider payment, entitlement, fulfillment, refunds and disputes. Nothing here moves money.
5. Independent art-direction QA, actual video export and authorized model-provider integration. HTML motion is not an MP4. 3D world tools still need adapters.
6. Owner-reviewed deployment, verified HTTPS endpoint, correct marketplace account ownership and CHUM discovery testing. Do not deploy or publicly market as ready just because unit tests pass.

No secrets are stored in GitHub. External models cannot trigger arbitrary shell commands, network fetches, hardware operations, third-party publishing or outbound messages.
