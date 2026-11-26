# Evercraft Earth Pulse | Field observation kernel

Status: **research prototype only**. No production uploader, computer-vision service, public map, autonomous monitoring, or validated hazard model is deployed with this branch.

## Mission
Build a privacy-first, evidence-preserving community-photo intake system. Generate candidates for review of repeat observations, and eventually compare them with independently sourced sensor, field, and satellite observations. A photo or AI suggestion alone never establishes environmental condition.

## Existing adjacent projects
- Earth evidence map and EPA data ledger: PR #1589.
- Watershed Intelligence preview: PR #1949.
- Existing code: systemia/sentinel/sources/usgs-water.mjs, systemia/research-service/watershed-intelligence.mjs, and systemia/forensiscope/evidence-graph.mjs.

Earth Pulse adds a separate community observation research kernel. It does not alter Sentinel alerts or claim integration with these projects.

## Implemented
- photo-observation.mjs: SHA-256, allowed image type, contributor-claimed time/site, coarse region, optional public-sharing consent. Output excludes identity, precise location, and image bytes. Every record remains **reported**, never verified. Consent alone only enters a separate privacy/rights review queue.
- attachModelSuggestions: predictions stay explicitly unverified; confidence never escalates evidence state.
- clusterPhotoObservations: deduplicates identical visual sources, without equating count to evidence.
- repeat-review.mjs: pairs distinct before/after images only at explicit review-enabled site registrations and matching category/coarse cell. Pair output ALWAYS says condition and change are undetermined, publication not authorized, no alert eligibility, and manual viewpoint validation required.
- Offline unit tests and path-scoped CI workflow.

Run: node --test tests/earth-pulse-*.test.mjs

## Proposed Yakima Basin pilot
1. Vet 3 to 10 legal public-river observation sites and create reviewer-controlled site entries.
2. Collect consented repeat photos with clear ownership and retention rules.
3. Verify sites, viewpoint and dates in an actual review process. Label only observable differences.
4. Separately map curated sites to authorized USGS gauges. Preserve station identifiers, units, time windows, quality qualifiers, and missing coverage.
5. Validate any image model against a hand-labeled dataset before making performance claims.
6. Publish evidence cards only after human approval, source-rights review, independent evidence review, and privacy screening.


## Waterway research context (new)

The offline waterway-context.mjs module takes private review pairs, an
operator-configured list of candidate sites and USGS station identifiers, a
bounded set of **already-normalized** observations from the existing USGS Water
Data adapter, and a caller-supplied as-of timestamp. It DOES NOT fetch a feed,
verify site-to-gauge geography, change Sentinel state, or create a public claim.

Only these USGS source codes are used:
- 00060: stream discharge
- 00065: gage height

Inputs must match exact station ID, parameter code, metric type, official
provenance hostname/path, and a configurable +/- observation-time window.
Units, agency approval status, and source references are preserved in the
private output. Missing coverage is null, never zero. Source approval is not
field-photo verification, and water quantity is not a water-quality measure.

Example research invocation:
    node --test tests/earth-pulse-*.test.mjs

Synthetic tests exercise source spoofing, timestamp freshness, wrong station,
consent and publication blocks, image duplication, and private geography.
The source-family field and provenance URL are structural checks only; the
trusted USGS adapter itself must be the ingestion boundary for live data.

**Not deployed:** No reviewed field-site registry, controlled photo uploader,
media safety checks, subscriber access controls, production sensor ingestion,
scientific image model, public map, or signed publication receipts.

## Hard boundaries
- No inference of potability, contamination, disease, structural danger, or imminent hazard from appearance alone.
- No autonomous Sentinel hazard escalation, enforcement decision, or municipal condition certification.
- Geographic cells of about 0.1 degree are NOT sufficient anonymity for all sensitive sites. Suppress sensitive locations before any public publishing.
- This code neither uploads/stores media nor scans files, authenticates users, handles consent revocation, or processes rights. Those capabilities must be engineered and independently security-tested before beta.
- Recycled photo hashes are deduplicated, but hash uniqueness itself is not proof of authenticity or independent sources.
- All offline fixtures are synthetic and cannot establish real-world AI accuracy or validated environmental change.

Research evidence, not an official warning system.
