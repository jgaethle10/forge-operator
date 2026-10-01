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


## Propagation Lab

Radar now searches for cross-domain signals that share a meaningful context boundary and occur close together in time. A weather observation and an aviation disruption in the same region may become a propagation candidate, for example.

The engine deliberately does **not** infer causation from timing alone. Every propagation candidate carries:

- `relationship_state: co_occurrence_candidate`
- `truth_state: INFERRED`
- `causal_claim: false`
- the participating signal IDs
- domain and region boundaries
- independent source-family count
- an explicit statement of what evidence would be required to strengthen the relationship

Unrelated global signals are not linked merely because they occurred near one another.

## Source-health watchdog

Every collector is audited across cycles. Radar tracks total runs, successes, failures, consecutive failures, last success, last failure, and current collector state.

A source enters `warning` after a failed cycle and `degraded` after three consecutive failures by default. A later successful run recovers the source to `healthy`. Missing collection therefore becomes visible state rather than invisible absence.

Public source-health state is available at:

`GET /api/radar/source-health`

## Emission discipline

A resident cycle does not republish the same observation every five minutes. Radar remembers the last emitted observation/change-state pair. If nothing materially changed, the next edition is quiet.

Fast-moving signals are also re-evaluated for freshness at compile time. When a previously emitted fast signal ages beyond its valid window, it enters the Change Wall as `ROLLED_OFF` rather than lingering indefinitely.


## Owned Release Controller

Radar now has a release controller between evidence selection and public archive publication.

The controller will only auto-release a Radar edition to the owned Radar archive when all of the following are true:

- at least one material signal cleared the edition threshold
- at least two source records are present
- every published claim is bound to known sources
- every selected signal is still fresh at release time
- no selected signal remains `UNKNOWN`
- propagation candidates remain `INFERRED` with `causal_claim: false`
- unattended political/government publication is not present
- the generated long-form prose clears the developed-paragraph structural gate

Quiet editions remain quiet. Political/government editions can still be staged for sourced editorial review, but the unattended owned-release path fails closed.

Production enables owned Radar archive release by default. Override with:

`RADAR_OWNED_RELEASE_ENABLED=true|false`

A successful owned release writes:

```
.runtime/radar/releases/
  index.json
  receipts.jsonl
  <release-slug>/
    release.json
    index.html
    hero.svg

.runtime/radar/clip-outbox/
  <release-slug>.json
```

The generated visual is an evidence-derived SVG showing the strongest materiality signals. It is explicitly labeled as an editorial triage visualization, not a probability or forecast.

The Clip outbox is a real distribution handoff boundary, but writing the outbox does not claim that Facebook, LinkedIn, Instagram, TikTok, YouTube, or any other external platform was actually published.

### Release surfaces

- `GET /api/radar/releases`
- `GET /api/radar/releases/latest`
- `GET /api/radar/corrections`
- `GET /radar/releases/:slug/`
- `GET /radar/releases/:slug/hero.svg`
- `POST /api/radar/release` requires `RADAR_INTERNAL_TOKEN`

## Correction Watch

Publication is not the end of the evidence lifecycle. After an owned release, every resident cycle compares the released signal snapshot with the current Radar state.

A correction candidate is written when a released signal:

- receives a newer underlying observation
- changes truth state
- becomes contested
- closes
- rolls off its freshness window

Corrections are append-only. The original release remains preserved, which makes the public record auditable instead of silently rewriting history.


## Expanded event intake for TOWI

Radar's official collector set also feeds TOWI's continuous investigation desk:

- NOAA/NWS active hazard alerts, with severity/certainty/urgency retained and forecast state preserved.
- NASA EONET open natural events for global event discovery across hazards such as storms, floods, fires, drought, volcanoes, landslides, and ice.

EONET remains one source family even when its event record links to multiple underlying URLs. Those URLs are useful research leads but do not automatically become independent corroboration.
