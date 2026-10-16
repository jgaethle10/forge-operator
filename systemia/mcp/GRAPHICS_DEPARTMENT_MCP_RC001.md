# Evercraft Graphics Department MCP RC001

**State:** review-branch preview prototype, **not deployed** and **not a paid MCP service**.
Systemia founder directive: evercraft-graphics-department-mcp-20261015. Canonical admission and independent specialist dispatch are **not** implied by this code.

## Purpose

Wrap the existing Evercraft Graphics Command commercial renderer in a guarded MCP boundary. Another model can discover preview capabilities, request branded SVG previews in four aspect ratios, and inspect an HTML exact-frame motion stage. The renderer is deterministic and local. No external image/video model is called; no MP4 is created.

### Tools

- graphics_get_capabilities: reports available preview scope.
- graphics_preview_commercial: SVG in feed, square, story or hero-wide, with SHA-256 receipt and synthetic/unverified labels.
- graphics_preview_motion_stage: HTML motion-stage source, not a finished video.
- graphics_preview_art_directed: an additional deterministic SVG art-direction lane with orbit, architecture and type treatments, four curated palettes, and the same feed/square/story/wide formats. Client-supplied brand text, no logos or source assets, 48 test combinations. It is not an image-model generator.
- graphics_preview_data_story: a governed data-story SVG preview for client-provided numeric series in horizontal bar and ordered-category trend charts, four formats and four palettes. All charts use a zero-based scale and label data provenance as client-provided/unverified. 32 tested combinations. It cannot research or validate the input data.

The original commercial renderer remains Evercraft-branded, with a fixed conversion-leak / "QUICK WIN AUDIT" grammar. The new art-directed lane independently supports limited brand-text customization and alternative visual geometry, but is not a general-purpose image generator, licensed client-logo pipeline or independently art-reviewed white-label production service. The sample offer price is client-provided advertising copy, not a price charged by Evercraft for rendering.

This private adapter deliberately supports the legacy 2025-03-26 MCP HTTP protocol. Remote OAuth and current-generation MCP transport conformance are separately held. To reduce local DNS-rebinding exposure, browser Origin headers are refused, non-loopback Host values return HTTP 403, and the optional MCP-Protocol-Version header must match the supported version. Native clients should send Accept: application/json, text/event-stream and Content-Type: application/json.

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


### Data-story preview example

Use the `graphics_preview_data_story` tool through the same MCP endpoint with a bounded structured brief. It never fetches a URL or treats client-provided source references as verification.

    {
      "brandName": "Evercraft Journal",
      "eyebrow": "Synthetic engineering illustration",
      "headline": "The data should tell the story",
      "subhead": "An example chart of mock observations, never a real-world metric",
      "methodNote": "Three invented readings to demonstrate formatting",
      "chartType": "bars",
      "unit": "count",
      "measurementState": "synthetic_example",
      "format": "feed",
      "palette": "midnight",
      "sourceRefs": ["https://example.org/mock-methodology"],
      "data": [{"label":"First","value":10},{"label":"Second","value":28},{"label":"Third","value":17}]
    }

The source labels and numbers originate only from the caller. Bar charts limit input to 6 groups; ordered trends support 2 to 8 short-label points with categorical equal spacing. Percentage graphs always scale 0-100. Long text fails closed when it cannot safely fit the canvas. Browser/device visual QA is still an uncompleted release gate.

## Tests

    node --test systemia/mcp/graphics-department.test.mjs systemia/mcp/graphics-mcp-client-conformance.test.mjs systemia/mcp/graphics-art-directed.test.mjs

The test suite covers deterministic hashes, 48 art-directed format/treatment/palette combinations, 32 bar/trend data-story variations, zero-based scale assertions, SVG escaping, motion-stage classification, invalid input, source-reference validation, bearer authentication, HTTP bounds, Origin/Host/protocol spoofing, no payment/publication authority, and a genuinely separate Node process acting as a native MCP HTTP client. It does not establish ChatGPT/Claude/Gemini acceptance, public HTTPS service readiness, or authorization to ship.

## Release holds

1. Systemia canonical admission/deduplication and authorized worker leases; separate evidence from Forge, Saban, Raven, Graphics, QA and Payments. Read-only inspection of Systemia's existing mission bridge found it presently routes two integration missions, not the graphics distribution lineage, and only accepts draft/held states, not the current awaiting-admission state. Extend the signed admission contract through the official review process, do not rename the graphics mission to slip through. This branch alone never proves team participation.
2. Fresh-clone runtime tests and independent client MCP conformance, secure remote authentication, tenant isolation, quotas and worker limits.
3. Rights/licensing checks, allowed asset storage, real source verification, and proof of output fidelity.
4. Actual commerce contract: quote, buyer approval, verified provider payment, entitlement, fulfillment, refunds and disputes. Nothing here moves money.
5. Independent art-direction QA, actual video export and authorized model-provider integration. HTML motion is not an MP4. 3D world tools still need adapters.
6. Owner-reviewed deployment, verified HTTPS endpoint, correct marketplace account ownership and CHUM discovery testing. Do not deploy or publicly market as ready just because unit tests pass.

No secrets are stored in GitHub. External models cannot trigger arbitrary shell commands, network fetches, hardware operations, third-party publishing or outbound messages.
