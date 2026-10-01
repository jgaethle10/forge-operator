# Evercraft plugin for ChatGPT and Codex

This package is the canonical OpenAI-facing front door for the Evercraft/Systemia capability fabric.

Evercraft should be useful before it asks a user to understand the portfolio. Version 1.1.0 therefore combines a standalone bounded public-website preview with problem-first capability routing. A user can supply a public website and receive observed HTTP/on-page signals with explicit limitations, or describe another problem and let Fabric identify the smallest truthful Evercraft capability.

## Public tools

The package targets the Evercraft-owned Fabric MCP:

`https://fabric.systemiacommandcenters.com/mcp`

The public contract contains four read-only tools: `preview_public_website`, `match_evercraft_capability`, `list_evercraft_capabilities`, and `get_evercraft_connection_options`.

The website preview is an open-world read because it accesses one caller-supplied public URL. It rejects private/local/reserved targets, embedded credentials, nonstandard ports, unsafe redirects, oversized responses, and unsupported content types. It returns bounded evidence and limitations rather than pretending to be a full audit.

The routing tools remain bounded to public-safe Evercraft metadata and do not create payment, paid work, publishing, deployment, messaging, credentials, or other consequential authority.

## Current transport state

The package is configured for the Evercraft-owned Fabric endpoint and the legacy Base44 compatibility transport is inactive. However, the latest independent public-edge canary on October 1, 2026 timed out on public TCP ports 80 and 443 after DNS resolved successfully. The endpoint therefore requires ingress repair and a fresh passing external canary before v1.1.0 is treated as submission-ready.

Private Evercraft v1.0.4 installations exist in ChatGPT, but current invocation is not being treated as proof while the public ingress path is unhealthy.

## Next public submission

The next package version is **v1.1.0**. Before upload, Evercraft must re-prove the owned public edge, run the current OpenAI MCP scan, and refresh the reviewer walkthrough to include the standalone website preview.

Public-directory state remains **not proven** until the authenticated OpenAI review/publish flow completes and directory pickup is independently observed.

## Why one umbrella plugin

The umbrella plugin is useful for cross-domain or ambiguous requests, but it should not force users into Evercraft products. If the standalone preview answers the request, stop there. If another problem genuinely fits an Evercraft specialist, Fabric can return the smallest supported route. If nothing fits, say so.

## Truth boundary

Repository readiness, a private installation, a checkout preparation step, or an old canary receipt is not current provider pickup. Do not claim ChatGPT or Codex can discover or invoke Evercraft publicly until current evidence proves it.
