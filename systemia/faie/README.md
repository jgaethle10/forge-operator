# FAIE

FAIE is Evercraft's evidence-first field, agriculture, land, water, production and resilience investigation engine.

It is no longer only a discovery record. This directory contains the owned runtime that receives Systemia Worldstate observations, preserves evidence state and provenance, maintains a durable signal store, and produces bounded investigations for a specific geography, asset, crop, water source or operating question.

## Role in the stack

Systemia Radar asks:

> What materially changed?

FAIE asks:

> What evidence is relevant to this farm, watershed, greenhouse, parcel, crop, production system or resilience question, and what remains unknown?

FAIE is a specialist consumer of the shared Systemia Worldstate fabric. It does not replace Radar, TOWI, Evermaps, Sentinel or the shared observation layer.

## Evidence contract

FAIE keeps the upstream Worldstate evidence states distinct:

- MODELED
- REPORTED
- OBSERVED
- VERIFIED

A model never silently becomes an observation. A report never silently becomes verified evidence. Missing evidence is not converted to a zero or a clean bill of health.

Each admitted signal carries source system, source family, observed timestamp, region keys, domains, FAIE dimensions, reliability, severity, signal score, provenance references, and explicit false publication/decision authority.

## Investigation contract

A bounded investigation accepts a question plus optional region keys, asset types, crop, water source and horizon in days.

It returns ranked relevant findings, evidence-state labels, source-family diversity, an evidence ledger, a bounded evidence-coverage confidence value, unknowns, evidence still needed and explicit decision/publication boundaries.

The confidence value is not a probability that an event will occur and is not a recommendation to take a consequential action.

## Runtime

Default durable state:

    .runtime/faie/
      state.json
      public-latest.json
      receipts.jsonl
      investigations/
        <investigation-id>.json
        <investigation-id>.md

Environment:

- FAIE_RESIDENT_ENABLED=true|false
- FAIE_INTERVAL_MS=300000
- FAIE_STATE_DIR=/persistent/path
- FAIE_INTERNAL_TOKEN=...
- FAIE_OFFICIAL_COLLECTORS_ENABLED=true|false
- FAIE_NWS_ENABLED=true|false
- FAIE_REGION_PROFILE=yakima-basin-wa (optional verified Sentinel profile)
- FAIE_NWS_AREA=WA (optional override; empty means the profile area or national active-alert feed)
- FAIE_USGS_WATER_SITES=USGS-12484500,... (optional)
- FAIE_USGS_WATER_PARAMETERS=00060,00065
- FAIE_NWPS_GAUGES=<gauge-id>,... (optional)

Production defaults the FAIE resident on. Development defaults it off unless enabled.

## APIs

Public evidence-support surfaces:

- GET /api/faie/health
- GET /api/faie/signals
- POST /api/faie/investigate
- GET /mcp/faie?action=health
- POST /mcp/faie

Public investigation requests are ephemeral previews. They are rate limited by the Forge runtime and are not written into the shared investigation archive.

The native FAIE MCP exposes three read-only tools:

- investigate_faie_evidence
- get_faie_signal_snapshot
- get_faie_health

The MCP uses the same in-process FAIE runtime as the HTTP API. Its investigation tool calls the non-persisting preview path, so an agent cannot silently add a caller question to the internal archive.

Internal investigation and write surfaces require FAIE_INTERNAL_TOKEN:

- GET /api/faie/investigations
- GET /api/faie/investigations/:id
- GET /api/faie/investigations/:id/markdown
- POST /api/faie/investigations
- POST /api/faie/ingest
- POST /api/faie/worldstate-dispatch
- POST /api/faie/run

Human UI:

- /faie/


## Saban specialist swarm

FAIE is registered in the governed Saban multiplication fabric as `software_id=faie`. The bounded specialist roles are soil systems, water systems, climate/resilience, energy/infrastructure, logistics/market, labor/economics, policy/permitting, production systems, provenance, adversarial challenge, thesis memory, and reconciliation.

The FAIE Saban contract is deny-by-default. It cannot independently send outreach, file public-records requests, publish, create checkout, accept contracts, move money, mutate production systems, or make consequential decisions. Its composite output must pass full role coverage, reconciliation, and source-integrity checks.

Run the current proof:

    npm run proof:saban-faie

The current public design-partner review item lives in `systemia/faie/saban-review-queue.json`. It is a public-evidence product test, not private customer data and not an assertion about undisclosed customer architecture.

## Thesis memory and evidence acquisition

An investigation may include `thesis_assumptions`. FAIE assigns stable assumption IDs and links current relevant evidence without converting related evidence into a verdict. Each assumption remains explicitly bounded by `verdict_authority=false`.

Missing decision dimensions are also converted into a structured `evidence_acquisition_queue`. Each queue item records the gap, priority, preferred evidence types, and the fact that no external action has been taken. Acquisition that requires field work, records requests, operator records, or other consequential steps stays human- or separately-authorized.

## AgNormal / regional food-infrastructure pilot path

The real FAIE UI at `/faie/` contains a one-click AgNormal regional food-infrastructure pilot scope. It does not switch to a canned demo or prewritten answer. The preset only fills the live investigation inputs and sends them through the same FAIE runtime used by every other public investigation.

Regional food-infrastructure scopes are treated as multi-domain evidence problems. FAIE expects coverage across water, soil, heat, energy, infrastructure, logistics, labor, economics, policy, crop health and resilience when those dimensions are relevant. The packet exposes which dimensions are covered, which are missing, independent source-family count, strong-evidence count and decision-readiness state.

The public packet follows the product workflow:

    SENSE
      -> current relevant evidence + source links
    CHALLENGE
      -> uncertainty + missing domains + corroboration gaps
    DECIDE
      -> next evidence required before consequential operator review

The packet can be copied or downloaded as JSON client-side without persisting the caller's public question.

Pilot acceptance gate:

- real FAIE runtime, not a separate demo engine
- no login required for the public preview
- source lineage visible when a public provenance URL exists
- missing evidence stays visible
- controlled-environment coverage gaps are explicit
- one-click Yakima Valley food-infrastructure scope is available on the real UI
- human review remains required before consequential action

## Autonomous loop

The resident runtime can continuously bridge material Systemia Radar signals into FAIE while direct Worldstate dispatches can feed the specialist with the broader domain stream. The Radar bridge is deliberately a fallback/secondary path, not a replacement for the Worldstate subscription contract.

FAIE also reuses existing Sentinel official-source adapters. NWS active alerts are enabled by default. USGS Water Data and NOAA/NWS National Water Prediction Service gauges turn on when monitoring IDs are configured. A verified Sentinel region profile can supply those source IDs as a single bounded configuration; for example, `FAIE_REGION_PROFILE=yakima-basin-wa` inherits the existing Yakima Basin NWS/USGS source set. Their upstream evidence ceilings, reliability, provenance and coarse-location rules are preserved rather than reinterpreted as stronger evidence.

The first release therefore has an actual closed loop:

    WORLDSTATE / RADAR
      -> FAIE INGEST
      -> NORMALIZE
      -> PRESERVE EVIDENCE STATE
      -> CLASSIFY FIELD DIMENSIONS
      -> SCORE SIGNAL
      -> PERSIST + RECEIPT
      -> SCOPED INVESTIGATION
      -> EVIDENCE LEDGER + UNKNOWNS
      -> HUMAN / AGENT CONSUMPTION

## Commands

    npm run test:faie
    npm run faie:once
    npm run faie:resident

## Boundaries

FAIE is evidence support. Public previews do not persist the visitor's question into the shared archive. FAIE does not autonomously publish, move money, make regulatory determinations, issue emergency orders, prescribe agricultural chemicals, control irrigation equipment, or make other consequential decisions. Those actions require the appropriate human or separately authorized system.

Unknown is a valid result.
