# TOWI Intelligence OS

TOWI is Evercraft's investigative layer for the physical world.

Systemia Radar answers: **what materially changed?**

TOWI answers: **which changes deserve a serious investigation, what does the evidence actually establish, what remains unknown, which systems are connected, and what should be watched next?**

TOWI is not a headline scraper and it is not an automatic truth machine. It consumes evidence-controlled Systemia Radar editions, builds living dossiers, preserves source lineage, keeps observed/reported/modeled/inferred/pending states separate, and stages strong work for the Evercraft Journal production pipeline.

## Product loop

1. Radar detects a material real-world change.
2. TOWI scores it for materiality, evidence quality, novelty, breadth, source diversity and explicit impact.
3. TOWI opens or updates a living dossier.
4. The dossier receives a story mode:
   - **FLASH** for urgent, high-materiality observed change.
   - **REPORT** for deeper explanatory investigation.
   - **WATCH** for developing, forecast, pending or inferred systems.
   - **AFTERMATH** for what happens after the acute event rolls off.
5. TOWI generates evidence-aware research questions and a source ledger.
6. A dossier can become an editorial candidate only when it has fresh provenance, at least two independent source families, no unresolved upstream hold, and sufficient story score.
7. Journal, Fallen and Evercraft Clip remain downstream production/distribution systems. TOWI does not silently grant itself publication authority.

## Runtime

The TOWI resident runs on the same five-minute default cycle as Radar and reads Radar's internal latest edition.

State lives under:

    .runtime/towi/
      state.json
      latest-desk.json
      public-latest.json
      editorial-queue.json
      receipts.jsonl

Environment:

- TOWI_RESIDENT_ENABLED=true|false
- TOWI_INTERVAL_MS=300000
- TOWI_MAX_ITEMS=24
- TOWI_STATE_DIR=/persistent/path
- TOWI_INTERNAL_TOKEN=...

## Surfaces

- GET /towi/
- GET /api/towi/health
- GET /api/towi/latest
- GET /api/towi/dossiers/:id
- GET /api/towi/internal/dossiers/:id (bearer-gated)
- POST /api/towi/run (bearer-gated)

The public control room intentionally shows research state rather than pretending every detected signal is a finished story.

## Doctrine

A headline is not the event. A correlation is not causation. A forecast is not an outcome. A model is not an observation. A source count is not source independence. A closed emergency is not the end of the story.

TOWI's job is to open the machine and show the whole system.


## Research evidence lane

Opening a dossier is not the same as proving it. Authorized research workers can attach source-bound evidence through:

    POST /api/towi/internal/dossiers/{id}/evidence

Evidence must declare a source family, provenance, observed time, evidence state, and relationship to the dossier: supports, challenges, context, or supersedes. TOWI counts independence groups rather than raw URL count, so mirrors of the same underlying source cannot satisfy corroboration by multiplication.

Challenging evidence is preserved and forces explicit editorial treatment. It is never silently averaged away.

## Intake

TOWI does not scrape headlines as its truth layer. It consumes Systemia Radar editions. Radar now includes official USGS earthquake observations, NOAA space-weather alerts, NOAA/NWS active hazards, and NASA EONET open-event discovery. NASA EONET is explicitly an event-discovery source, not independent corroboration by itself.

Additional Worldstate/Sentinel feeds can enter the same evidence pipeline without changing TOWI's publication rules.
