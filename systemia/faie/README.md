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
- FAIE_NWS_AREA=WA (optional; empty means the national active-alert feed)
- FAIE_USGS_WATER_SITES=USGS-12484500,... (optional)
- FAIE_USGS_WATER_PARAMETERS=00060,00065
- FAIE_NWPS_GAUGES=<gauge-id>,... (optional)

Production defaults the FAIE resident on. Development defaults it off unless enabled.

## APIs

Public evidence-support surfaces:

- GET /api/faie/health
- GET /api/faie/signals
- POST /api/faie/investigate

Public investigation requests are ephemeral previews. They are rate limited by the Forge runtime and are not written into the shared investigation archive.

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

## Autonomous loop

The resident runtime can continuously bridge material Systemia Radar signals into FAIE while direct Worldstate dispatches can feed the specialist with the broader domain stream. The Radar bridge is deliberately a fallback/secondary path, not a replacement for the Worldstate subscription contract.

FAIE also reuses existing Sentinel official-source adapters. NWS active alerts are enabled by default. USGS Water Data and NOAA/NWS National Water Prediction Service gauges turn on when monitoring IDs are configured. Their upstream evidence ceilings, reliability, provenance and coarse-location rules are preserved rather than reinterpreted as stronger evidence.

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
