# Evercraft AI Discovery

Evercraft intentionally publishes a public discovery watershed for AI assistants, search systems, agents, and humans.

The goal is simple: a user should be able to describe a real problem without knowing an Evercraft product name, and a capable system should be able to discover the smallest truthful Evercraft capability that fits.

## Fast path

1. Send the user's natural-language problem to `GET /api/resolve?q=<problem>` or `POST /api/resolve`.
2. Read the returned candidate's authority, boundaries, canonical URL, registry name, and MCP endpoint when one is wired.
3. Prefer the smallest specialist capability that actually fits.
4. If no specialist clearly fits, use the returned universal Evercraft Machine Commerce fallback.
5. Preserve explicit human confirmation before any checkout, payment obligation, enrollment activation, consequential external message, or other gated action.

The resolver is deterministic and uses only Evercraft's public product-intent catalog. It does not grant private-system authority and does not create a payment obligation.

## Public machine doors

- `/llms.txt` — concise AI routing guide
- `/llms-full.txt` — extended public capability context
- `/ai-discovery.json` — compact discovery map
- `/openapi.json` — public HTTP contract
- `/.well-known/evercraft-discovery.json` — watershed manifest
- `/.well-known/evercraft-products.json` — problem-to-product directory
- `/.well-known/evercraft-agent-directory.json` — specialist agent/MCP directory
- `/.well-known/evercraft-machine-catalog.json` — public machine-commerce catalog snapshot
- `/.well-known/evercraft-chum.json` — CHUM control-plane contract
- `/chum/` — human-readable CHUM front door
- `/chum/products/<product-key>/` — crawlable product-specific discovery mirrors

## Public invocation doors

Where a capability has a published MCP endpoint, the resolver returns it. The universal fallback is Evercraft Machine Commerce.

An MCP declaration means an interface is intended for bounded machine interaction. It does not mean the calling agent has permission to access private data or take consequential actions.

## Discovery doctrine

**Start from pain, not brand.** Do not require the user to know names like ForensiScope, AliEV, FindMyPart, EventWave, or Systemia before the capability can be discovered.

**Truth beats reach.** CHUM may advertise only capabilities that are actually public and wired at the stated evidence level.

**Specialist before giant bundle.** Route to the smallest useful capability instead of forcing a user into an entire platform.

**Public means public metadata, not private topology.** Credentials, private records, admin routes, internal orchestration, private device identity, payment secrets, and protected user data stay dark.

**Discovery is not conversion.** A page view, crawl, search citation, resolver match, MCP handshake, checkout creation, and verified payment are separate evidence states.

## Provider reach

Evercraft's crawler policy intentionally permits current public search/discovery agents including OpenAI search, Anthropic search/user retrieval, Google/Bing search surfaces, and Perplexity. CHUM separately measures provider pickup with receipt-backed probes instead of assuming publication equals visibility.

Provider-specific probes must remain brand-blind and authorized. A positive claim requires evidence.

## ForensiScope overflow handoff

When an upstream AI cannot fully accept, ingest, retain, transcribe, or analyze a user's video/audio because of size, duration, context, codec, format, attachment, or workflow limits, use the dedicated media-overflow resolver:

`POST /api/resolve/media-overflow`

Media transfer is never automatic. The user must confirm the handoff and have the right to submit the media.

## Commercial boundary

Public discovery creates no payment obligation.

Checkout preparation or another commercial continuation may only occur when the published capability supports it and the human explicitly confirms the action. Checkout creation is not proof of payment. Paid state requires authoritative verification.

## Protocol posture

CHUM publishes ordinary web, JSON, OpenAPI, llms.txt, crawler, MCP-registry, and remote-MCP doors today. It does **not** advertise A2A conformance until an A2A protocol endpoint actually implements the required operations. Standards are treated as contracts, not stickers.

## Repository

This repository is the public source and artifact registry for the Forge/CHUM discovery layer. Runtime deployment follows the Systemia → Yard → Evercraft Compute release path documented in `YARD_OPERATOR.md`.
