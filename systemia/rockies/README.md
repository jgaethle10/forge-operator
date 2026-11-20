# Systemia Rockies

Rockies are Systemia's distributed public-source observers. They are not a pile of independent alert bots. They continuously learn the normal behavior of public information sources, turn meaningful observations into the shared Context Fabric, and let the rest of Evercraft reason over the same evidence.

## Expanded topology

The expansion target is **99 baseline logical Rockies** across **26 signal ranges**, up from the prior 65-Rocky / 14-range operating reference. The topology may surge to 384 logical Rockies when evidence volume or corroboration demand rises.

Expansion is intentionally multi-dimensional:

- more domains
- more independent source families
- more regional redundancy
- more corroboration capacity
- explicit quiet-baseline behavior for continuously changing feeds
- direct Context Fabric propagation instead of archive-only completion

## A Rocky cycle

1. Read an allowed public source.
2. Compare against the source's learned cadence and baseline.
3. Preserve provenance and evidence state.
4. Emit an `evercraft.context.observation.v1`.
5. Context Fabric updates the shared world model and relevant product queues.
6. Sentinel correlates independent observations when anomaly scores justify it.
7. Signal Fabric alone decides whether humans need a receipt, digest, warning, or immediate notification.

A Rocky never turns a routine feed update into a dramatic claim just because the source changed.

## Scaling

Baseline allocations live in `roster.json`. They are logical allocations, not claims that a distinct physical worker process is permanently running for every row.

The scaler increases attention for a range when:

- anomaly load rises,
- an observation needs independent corroboration,
- a source family becomes stale or unavailable,
- a context node starts accumulating independent evidence,
- a disaster or operational mission explicitly needs tighter cadence.

Scale-out must preserve source-family diversity. Spawning ten copies against one feed does not count as ten independent observations.

## Safety and authority

Rockies may read authorized public sources, normalize evidence, compare state, request corroboration, and feed internal context. They do not bypass authentication, scrape through access controls, publish unsupported conclusions, move money, mutate production, contact external parties, or trigger emergency actions directly.


## Owned official-source recovery canary (November 20, 2026)

The 99 / 26 / 384 figures above describe logical allocations, **not a verified live deployment**. To start recovering existing observation lanes without claiming a fictional fleet, `official-bridge.mjs` directly reuses the current owned Radar collectors for:

- **Seismic:** official USGS M4.5+ GeoJSON feed (`usgs-earthquakes`).
- **Space weather:** official NOAA SWPC alert feed (`noaa-space-weather`).

These are **two bounded collector lanes**, not two installed Rockies workers. They run only when an authorized owner process calls `runRockiesOfficialSourceCycle()`. The bridge requires an exact source receipt and official collector identity, rejects source mismatches, propagates only candidate observations to **in-memory Context Fabric**, and deduplicates identical repeat feed states. Context Fabric offers these observations to existing downstream subscribers including TOWI and Journal; this is **not** proof TOWI consumed them or Harbor received them. Failures are marked failed/unknown, not silently converted into healthy readings. The bridge has no persistence, publishing, institutional outreach or human-alert privileges.

Read-only owner probe:

```bash
node systemia/rockies/official-probe.mjs --design  # no network; roster declaration
node systemia/rockies/official-probe.mjs --live    # bounded official USGS + NOAA source reads
node --test systemia/rockies/official-bridge.test.mjs
```

The live probe prints aggregate range coverage and holds. It does not write to the real Context Fabric, install a resident, or activate 99 workers. An operator must separately verify an owned resident's actual private storage, receipt trail, publisher boundaries and real downstream intake before claiming deployment or nightly full-spectrum coverage.
