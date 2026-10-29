# Evercraft Signal · evidence-first incident intelligence

**Public surface:** `public/signal/index.html`  
**Structured case:** `public/signal/incidents/savannah-river-20261028.json`  
**Quality gate:** `node --test tests/signal-incident-public.test.mjs`

## Release boundary

This is an editorial prototype containing a single sourced October 28, 2026 Savannah River National Laboratory fire case. It is NOT a live feed, verified independent radiation sensor network, emergency notification service, completed customer delivery, billing system, or evidence of active subscribers.

The page is intentionally self-contained and can be deployed by the existing GitHub Pages public fallback workflow after merging to main. Expected fallback URL, **only after successful deployment and HTTPS verification**: `https://jgaethle10.github.io/forge-operator/signal/`.

## Evidence contract

Each claim has a status and a list of source IDs. All IDs resolve to a typed source with an HTTPS URL. Preserve upstream independence: multiple syndicated outlets repeating one dispatch line are not multiple independent corroborations. Distinguish official statements, news reporting, direct measurements, interpretation, and unobserved variables.

Never turn an FAA restriction radius into an exposure zone. Never turn a no-detect statement into a precise zero. Never turn missing readings into normal conditions. Document snapshot and source freshness explicitly.

## Build path: use existing Evercraft machinery

1. Sentinel source adapters ingest lawful public official notices, site updates and environmental readings. Use the existing source-health receipts, dependency grouping and evidence states; do not publish raw safety conclusions from an anomalous feed.
2. Signal Fabric normalizes incidents, deduplicates changes and routes approved notifications. Avoid directly paging subscribers from a new silo.
3. Evermaps owns a future map surface with **separate geometries** for site boundaries, advisory zones and actual sensor measurement locations. Missing or untrusted geometry gets no drawn zone.
4. ForensiScope and Evercraft Research can attach provenance-checked document/recording analysis, maintaining secondary-source status until verified.
5. Public Signal publishes snapshots only after source reconciliation, human-reviewed safety phrasing and a read-only case-data build. No auto-publication from an unconfirmed social claim.

## The next release gates

- Automated ingest: authoritative feed connectors, persisted poll receipts, drift/retraction treatment, independent corroboration, and a snapshot builder.
- Test source integrity: false positives, errors, empty results, stale feeds, conflicting timestamps, retractions, and absence of independent sensor data.
- Add searchable incident directory, subscription preferences, consent/unsubscribe and accessibility tests.
- Commercial buyer gate: defined scope, verified checkout amount/provider, real customer payment authorization, delivery receipts and support obligations. Do not advertise a working subscription until these exist.
- Distribution gate: public HTTPS, source links, OG preview validation, organic shares with no threat inflation, and measurable qualified leads.

**Owner:** Evercraft LLC. **Design:** customer sees one clear case; the watershed of agents and systems stays behind the scenes.
