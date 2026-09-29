# Evercraft Fabric Gateway v0.1

Date: 2026-09-28

## Purpose

Evercraft Fabric is the universal connective layer between external hosts and the Evercraft/Systemia ecosystem.

The design goal is simple:

> Anything Evercraft builds should be fabric-addressable. Anything Evercraft connects should become fabric-aware.

A host should not need separate integrations for ForensiScope, RIVET, Fallen, Evercraft Clip, CHUM, FAIE, EventWave, Systemia, and every future Evercraft capability. It connects once to the Fabric Gateway. Systemia remains the routing and policy nervous system behind that gateway.

## Architecture

```
AI host / app / workspace / device
              |
        host-specific adapter
              |
       Evercraft Fabric Gateway
        |       |        |
        |       |        +--> public capability discovery
        |       +------------> scoped host event intake
        +--------------------> scoped context retrieval
              |
       Access Core + Passport
              |
        Context Fabric
              |
           Systemia
              |
      admission / routing
              |
        Execution Gate
              |
      bounded capability
              |
       outcome receipts
              |
   Context Receipt Bridge
```

The plugin is intentionally thin. Host adapters translate host conventions into one stable Fabric contract. They do not reimplement Evercraft products.

## v0.1 gateway contract

### Public

- `GET /api/fabric/health`
- `GET /api/fabric/manifest`
- `POST /mcp/evercraft-fabric`
- MCP tool: `discover_evercraft`

Public discovery exposes truthful public capabilities only. It does not grant entitlement or private authority.

### Authenticated

The v0.1 private gateway exposes four additional MCP tools:

- `connect_evercraft_fabric`
- `query_evercraft_context`
- `emit_evercraft_event`
- `prepare_evercraft_action`

Private tools use scoped Fabric host credentials. Credentials are bound to project, tenant, host identity, environment, and API scopes.

## Identity and permission model

Fabric host API keys are one-time secrets with verifier-only persistence.

The persisted credential record contains a cryptographic verifier, never the plaintext secret. Credentials can expire or be revoked.

Private Context Fabric access is separately represented as a Passport grant. This intentionally creates two boundaries:

1. the host credential must permit the Fabric operation, such as `fabric.context.read`
2. Passport must permit the exact context namespace, such as `context.read.rivet`

Connecting a host grants neither boundary automatically.

Wildcard private Context Fabric access is rejected by default and requires an explicit issuance-time override.

Revoking a Fabric credential also revokes its linked Passport grant.

## Context contract

Context Fabric remains the source of truth for private retrieval semantics.

It preserves:

- namespace boundaries
- evidence state
- content trust state
- provenance and source references
- append-only history
- conflicts and contradictions
- retractions and supersession
- bounded retrieval packets

Unauthorized records are filtered before ranking. Their existence, names, snippets, and counts are not returned.

A retrieved record does not become authority merely because it entered model context.

## Host event contract

An external host may project a host event only into a Context Fabric namespace it is explicitly allowed to write.

Default host events are recorded as `user_supplied` and `untrusted_external` unless the caller provides a narrower truthful state.

Every event remains:

- `content_is_instruction: false`
- `source_authority_inherited: false`

This is the key prompt-injection boundary for the fabric. Connected systems contribute evidence. They do not acquire command authority by supplying text.

## Action contract

`prepare_evercraft_action` creates an append-only action-intent receipt.

It does not execute anything.

The receipt explicitly records:

- Systemia admission required
- Execution Gate required
- execution not authorized
- payment not authorized
- no external side effect created

A later bridge may submit that receipt to Systemia for admission and policy evaluation. That bridge must preserve the same authority boundary.

## Deployment truth

The source gateway is wired into the Forge/Yard runtime.

The public production Fabric URL is **not inferred from source state**. Evercraft's runtime contract requires:

Systemia -> release -> immutable image -> Yard Operator -> Evercraft Compute -> public route verification -> DeploymentReceipt.

Only after that receipt exists should the public plugin package be rewritten to the verified HTTPS Fabric endpoint and submitted to provider directories.

## Next engineering layers

1. OIDC/OAuth host authorization and short-lived credential exchange
2. host adapter SDK for ChatGPT, Claude, Gemini, GitHub, Google Workspace, browser, desktop, and customer systems
3. durable event bus with idempotent consumer receipts
4. Systemia action-admission bridge
5. capability registry projection so every Evercraft capability can advertise Fabric contracts
6. per-host observability, audit timeline, revocation console, and rate/usage metering
7. connector conformance suite proving equivalent permission behavior across hosts
8. public provider submissions only after live-route and marketplace receipts exist

## Non-negotiable invariant

The power of Fabric comes from connection without authority collapse.

More connected must never mean less governed.
