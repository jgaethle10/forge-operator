# Evercraft Machine Action Manifest

Machine Action Manifest turns CHUM's existing live MCP canary receipt into a machine-readable observation of the **exact tool names** a specialist exposed through `tools/list` at a specific time.

It solves a recurring portfolio problem: discovery copy often proves what a product is for without preserving the exact machine action identifier. Capability contracts should never invent an action name from prose.

## Evidence ladder

The manifest deliberately separates different facts:

```
catalog says an MCP exists
        ↓
initialize succeeds
        ↓
tools/list exposes exact tool name
        ↓
tools/call succeeds with bounded arguments
        ↓
product-specific outcome receipt
```

Each rung is stronger than the one above it. None is silently promoted.

The current Machine Action Manifest records the **tools/list** rung. It sets `tool_call_verified: false` even for observed tools because listing a tool does not prove invocation succeeds.

## Produced by the existing CHUM canary

`systemia/chum/mcp-canary.mjs` already initializes public MCP targets and calls `tools/list`. It now also writes:

```
artifacts/chum/machine-action-manifest-latest.json
```

The normal CHUM watershed already uploads `artifacts/chum/**`, so this receipt rides the existing evidence pipeline.

Each row preserves:

- product key when known
- human name
- MCP URL
- registry name
- exact observed tool names
- commerce-like tool-name signals
- initialize / tools-list verification state
- official-registry observation
- canary timestamp
- SHA-256 of the source canary receipt

Failed or unverified targets expose **zero tool names** even if malformed input data contains names.

## Truth boundary

An observed tool name means only:

> the exact identifier appeared in a live `tools/list` response captured by the CHUM canary.

It does **not** mean:

- `tools/call` succeeded
- the product is paid or entitled
- a checkout was paid
- the tool grants external-action authority
- an LLM provider discovered or invoked it
- the requested business outcome happened

Capability Mesh can use this evidence later to bind an internal Passport scope to an exact observed machine tool without confusing those two concepts.
