# Evercraft Web v0.3 upgrade record

Date: 2026-09-25

## Goal

Make Evercraft Web substantially easier for humans, search systems, LLMs, MCP clients and agents to discover from the problem itself while upgrading the verified Fetch slice without overstating held search/browser execution.

## Production truth before this candidate

- Official registry identity: `io.github.jgaethle10/evercraft-web`
- Receipt-backed published version: 0.1.1
- Single-URL public Fetch: externally canary-verified
- Search: held
- Browser automation: held
- Authenticated browser: held
- Public-web pickup: not yet independently observed as reliable

## v0.3 source/build candidate

The Evercraft AI Suite source now contains a v0.3 candidate with:

- structured HTML extraction: title, meta description, canonical URL, H1-H3 headings and bounded outbound links
- SHA-256 content hash plus a separate evidence-receipt hash
- declared content-length metadata when available
- bounded `fetch_urls` batch retrieval for up to five public HTTP(S) URLs
- independent URL validation and result isolation inside a batch
- XML and CSV text retrieval support in addition to the existing bounded HTML/plain/JSON lane
- MCP exposure for `get_web_capabilities`, `route_web_request`, `fetch_url` and candidate `fetch_urls`
- canonical neutral Evercraft AI Suite public edge
- widened problem-language discovery around URL-to-text, structured extraction, evidence-backed retrieval, RAG ingestion and multi-URL research

## Build evidence

The full Evercraft AI Suite build passed after the upgrade:

- machine-commerce catalog sync: pass
- machine-commerce catalog consistency: pass
- Evercraft Web discovery test: pass
- Systemia release-policy test: pass
- Vite production build: pass

The release tests explicitly require:

- v0.3 source/manifest coherence
- the official registry identity
- `route_web_request` and `fetch_urls` discovery
- `fetch_many` in OpenAPI
- stale pre-canary Fetch wording to be absent
- Search and Browser to remain held
- batch Fetch to remain external-canary-pending until independently observed

## Release boundary

This branch stages v0.3 discovery and registry metadata. It does not rewrite the historical 0.1.1 production receipt. Do not call `fetch_urls` production-live, and do not call Search or Browser live, until their independent public-edge gates pass.

A public discovery surface is not evidence of indexing, recommendation, invocation, conversion or payment.
