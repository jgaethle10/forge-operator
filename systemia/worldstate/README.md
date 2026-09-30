# Systemia Worldstate

Worldstate is the commercial read layer over Systemia Context Fabric.

Customers do not buy "Rockies." They define a bounded scope of assets, facilities, routes, geographies, industries, infrastructure dependencies, and topics they care about. Worldstate projects the shared evidence graph into that scope and produces a compact current-state snapshot plus Reality Delta records describing what materially changed.

## Product promise

**Tell us what you care about. We will tell you what changed, what evidence supports it, why it may matter to that scope, what contradicts it, and what remains unknown.**

Worldstate is not an autonomous decision-maker and is not an alarm engine.

- Rockies observe.
- Context Fabric integrates.
- Sentinel correlates anomalies.
- Worldstate projects relevant evidence for a customer or agent.
- Reality Delta compares two projections.
- Signal Fabric remains responsible for notification policy.

## Scope contract

A scope can contain:

- region keys
- domains
- assets and facilities
- routes
- infrastructure dependencies
- industries
- topics

Individual people are not valid monitoring targets. Worldstate is designed for places, systems, assets, organizations, infrastructure, environmental conditions, and other non-personal operational subjects.

## Reality Delta

A delta is not merely "new data." A material delta is a context change that:

1. entered the requested scope,
2. is newer than the comparison boundary,
3. preserves provenance and evidence state,
4. clears the requested materiality threshold.

Each result keeps source-family diversity visible. Multiple observations from one source family do not masquerade as independent corroboration.

## Commercial surfaces

Worldstate is designed for:

- enterprise portfolio monitoring
- physical asset intelligence
- logistics and route awareness
- energy and infrastructure intelligence
- insurance/property context
- AI/agent grounding
- local and regional operating intelligence
- research and newsroom grounding

API/MCP delivery is the intended machine surface. Human dashboards and briefings can be projections of the same contract.

## Safety

Inputs must be public or explicitly authorized. Worldstate does not bypass access controls, conduct person-level surveillance, make autonomous adverse decisions about individuals, move money, publish unsupported conclusions, or trigger emergency/physical actions on its own.

## Shared Context round trip

Worldstate observations do not stop at a private projection store. `context-fabric-adapter.mjs` writes normalized observations into the existing Passport-aware Evercraft Context Fabric under the `worldstate` namespace. `context-reader.mjs` retrieves only records the requesting actor is authorized to see, reconstructs the original observation contract, and then produces Worldstate snapshots and Reality Deltas from that authorized evidence set.

The proof harness verifies both sides of the boundary: an unauthenticated read sees zero internal Worldstate records, while an actor with explicit `context.read.worldstate` authority can reconstruct the scoped snapshot and later material delta with provenance intact.

## Owned commercial pilot door

Worldstate exposes a Forge-owned MCP source route at `/mcp/worldstate`. The initial commercial door is intentionally narrower than monitoring execution.

It exposes two read-only tools:

- `get_worldstate_offer` reads the canonical local machine-catalog offer.
- `prepare_worldstate_pilot_handoff` converts a bounded non-person operating scope into a structured human-review packet.

The handoff does **not** start Rockies, create a Passport grant, grant source access, create checkout or payment, mutate production, create emergency authority, or trigger an external action. Customer monitoring begins only after separate commercial review, source-permission review and explicit onboarding authorization.

Worldstate is also registered in `registry/owned-machine-offers.json`. CHUM catalog sync merges legacy remote offers with this Forge-owned registry so an external catalog refresh cannot erase or downgrade the owned Worldstate record.
