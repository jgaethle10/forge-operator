# Evercraft Context Fabric

Evercraft Context Fabric is the portfolio-wide retrieval membrane for Systemia.

It is not merely a global search box. It is designed to answer a harder question:

> What is the smallest context packet this actor is actually allowed to see, with provenance, evidence state, history, and unresolved contradictions still intact?

## Why this exists

Evercraft has specialized evidence graphs, product records, mission receipts, reports, research artifacts, operational state, public discovery surfaces, and institutional memory spread across many domains.

Without a shared context fabric, every agent either receives too little context and repeats old work, or receives too much context and risks leaking irrelevant or unauthorized material.

Context Fabric provides one common retrieval contract across those domains.

## Core properties

### Passport-aware retrieval

Every non-public namespace carries a required Passport scope such as:

```
context.read.rivet
context.read.systemia
context.read.forensiscope
```

Search filters unauthorized records **before ranking and packet assembly**. Hidden titles, snippets, sources, and counts are not returned.

Writes are also Passport-gated through `context.write.<namespace>`.

### Evidence state survives retrieval

Every record must declare one evidence state:

- observed
- public
- licensed
- user_supplied
- inferred
- modeled
- generated

The retrieval layer never upgrades those states. A modeled claim remains modeled after search.

Each record also carries a separate `content_trust_state` such as `trusted_internal_receipt`, `verified_external_evidence`, `untrusted_external`, `derived_summary`, or `unknown`. Retrieval always returns `content_is_instruction: false` and `source_authority_inherited: false`. Remembering content never turns the source into an authority.

### Append-only history

Updates do not overwrite history. A record may explicitly supersede an earlier record only inside the same namespace, visibility boundary, entity, and predicate.

Retractions are separate receipt-backed events. Current queries omit retracted and superseded records by default, while authorized historical queries can still inspect the lineage.

### Conflict preservation

If the authorized result set contains different active claim values for the same entity and predicate, the packet returns an explicit unresolved conflict with the supporting record IDs, evidence states, and source references.

Context Fabric does not vote, average, or quietly select whichever fact was newest.

### Bounded context packets

Queries accept result and character budgets. The fabric ranks authorized records deterministically and returns a compact packet with snippets, provenance, evidence state, match reasons, and internal citation IDs.

This makes the output suitable for LLM context windows and agent handoffs without shipping the entire internal corpus every turn.

## Current retrieval engine

The v1 ranker is intentionally deterministic lexical + metadata retrieval. It uses titles, tags, entity references, predicates, exact phrases, and body text.

It explicitly reports:

```
retrieval_mode: deterministic_lexical_metadata_v1
semantic_embedding_used: false
```

This prevents a future semantic ranker from being implied before it exists. Embedding or learned-ranker adapters can be added later behind the same authority/evidence contract.

## Record model

A context record contains:

- namespace
- kind
- title and text
- tags
- optional entity + predicate + claim value
- evidence state
- visibility
- Passport read scope
- source reference and optional source hash
- source receipt schema and receipt hash when projected from a machine receipt
- content trust state
- hard non-instruction / non-authority-inheritance markers
- content hash
- observation time
- optional validity window
- optional supersession lineage
- receipt hash

## Security boundary

Context Fabric does not establish identity. Passport does that authorization work.

It does not infer that a source is trustworthy merely because it was ingested. The source and evidence state remain visible to the caller.

It does not expose the existence or metadata of unauthorized records in query results.

It does not persist query text or search history.

## Receipt reconciliation

`receipt-bridge.mjs` closes the operating loop by projecting verified machine receipts back into institutional memory.

The bridge currently accepts:

- completed Evercraft Execution Gate lease receipts
- accepted Intake Fabric admission packets
- Systemia mission-admission receipts

Before projection it verifies the receipt hash using the producing component's receipt contract. A tampered receipt fails closed.

The bridge stores **structured summaries**, not arbitrary source instructions. In particular, accepted intake packets do not copy the inbound `intent_excerpt` into institutional memory. The resulting record says what Systemia accepted, where it came from, which capability hints were present, and that no execution authority came from intake.

This creates the loop:

```
Intake / Systemia / Execution Gate
        ↓ verified receipts
Context Receipt Bridge
        ↓
Context Fabric institutional memory
        ↓ authorized retrieval
future planning and execution
```

Receipts can become memory. Memory does not become authority.

## The larger Evercraft stack

```
Sources + product receipts + evidence
        ↓
Context Fabric
        ↓
Passport-filtered context packet
        ↓
Systemia / specialist agent
        ↓
Execution Gate
        ↓
authorized action
        ↓ verified outcome receipt
Context Receipt Bridge
        ↓
Context Fabric reconciliation
```

The point is not to make every Evercraft system know everything. The point is to let every system receive exactly the context it is permitted to know, with enough evidence lineage to reason responsibly.
