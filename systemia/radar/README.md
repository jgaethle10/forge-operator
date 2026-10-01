# Systemia Radar

Systemia Radar is Evercraft's owned, evidence-first world-state publication engine.

It is not a headline scraper. It is a closed-loop system that continuously collects authoritative observations, routes them through Systemia's shared worldstate fabric, preserves provenance, computes material state changes, applies adversarial checks, and stages evidence packets for Evercraft Journal and platform derivatives.

## Operating loop

```
INGEST
  -> NORMALIZE
  -> DEDUPLICATE
  -> CLASSIFY TRUTH STATE
  -> DIFF AGAINST PRIOR STATE
  -> ADVERSARIAL REVIEW
  -> SCORE MATERIALITY
  -> BUILD CHANGE WALL
  -> STAGE JOURNAL + SOCIAL PACKETS
  -> VERIFY
  -> PUBLISH THROUGH SEPARATE AUTHORITY
  -> WATCH + CORRECT
```

Publication authority is deliberately separate from observation and drafting authority.

## Truth states

- `OBSERVED`
- `CORROBORATED`
- `REPORTED`
- `CONTESTED`
- `INFERRED`
- `PENDING`
- `CLOSED`
- `UNKNOWN`

Political statements are held at `REPORTED` unless the system is recording a distinct verifiable action. Forecasts remain `PENDING` until an outcome is observed. Modeled data cannot silently become observation.

## Change Wall

Each subject stream is compared with its previous trusted state. Radar records:

- `NEW`
- `INTENSIFIED`
- `WEAKENED`
- `CORROBORATED`
- `CONTESTED`
- `ROLLED_OFF`
- `CLOSED`
- `UNCHANGED`

Only material, fresh, adversarially clean changes enter an edition candidate.

## Resident cycle

The resident cycle runs on a five-minute default interval in production.

Current owned collectors:

- USGS Magnitude 4.5+ past-day earthquake feed
- NOAA Space Weather Prediction Center alerts

Every collector emits receipts. A failed collector does not fabricate a replacement observation.

The worldstate subscription mesh also offers every admitted observation to `systemia_radar`, so Rockies, FAIE, TOWI, Evermaps, infrastructure systems, markets, policy monitors, and future desks can feed the same engine without duplicating the Radar core.

## Owned runtime surfaces

- `GET /api/radar/health`
- `GET /api/radar/latest`
- `GET /api/radar/change-wall`
- `POST /api/radar/run` requires `RADAR_INTERNAL_TOKEN`
- `POST /api/radar/ingest` requires `RADAR_INTERNAL_TOKEN`
- `/radar/` public control-room view

The public API exposes a sanitized projection. Raw provenance and internal evidence packets remain in the resident state directory.

## State and receipts

Default runtime state:

```
.runtime/radar/
  state.json
  latest-edition.json
  public-latest.json
  journal-editorial-packet.json
  linkedin-draft.json
  facebook-draft.json
  receipts.jsonl
```

Set `RADAR_STATE_DIR` to a persistent mounted path in production.

## Environment

- `RADAR_RESIDENT_ENABLED=true|false`
- `RADAR_INTERVAL_MS=300000`
- `RADAR_MATERIALITY_THRESHOLD=0.58`
- `RADAR_MAX_SIGNALS=8`
- `RADAR_STATE_DIR=/persistent/path`
- `RADAR_INTERNAL_TOKEN=...`
- `RADAR_JOURNAL_URL=https://journal.evercraft.global/`

Production defaults the resident on. Development defaults it off unless explicitly enabled.

## Editorial handoff

Radar stages two kinds of publication derivatives:

1. a Journal editorial packet containing claims, source bindings, Change Wall, evidence ledger, uncertainties, and required gates;
2. bounded social drafts derived from the same canonical edition.

Neither packet carries publication authority. Evercraft Journal's existing freshness, source, visual-rights, Fallen production, and 10/10 editorial gates remain authoritative.

## Commands

```bash
npm run test:radar
npm run radar:once
npm run radar:resident
```

`radar:once` performs one live official-source cycle and writes receipts. `radar:resident` keeps the process alive on the configured interval.

## Doctrine

A headline is not the event. A statement is not a policy action. A policy action is not its predicted consequence. A market move is not proof of a single cause. A model is not an observation. A cluster is not a forecast. A forecast is not an outcome. Unknown is a legitimate state.

Truth has a timestamp.
