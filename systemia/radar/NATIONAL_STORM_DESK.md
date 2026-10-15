# Evercraft National Storm Desk | NWS warning intake

**State:** Reviewable source-code lane. DISABLED by default. This is not deployment, live national monitoring, newsroom publication, or a confirmation of storm damages.

## Purpose

Systemia Radar previously had owned earthquake and space-weather collectors but no dedicated nationwide severe-storm/flood alert source. Sentinel has a separate NWS life-safety adapter; this new Radar collector is for bounded editorial intake, not a second emergency authority or a parallel Signal Fabric.

The feed reads the official NWS `https://api.weather.gov/alerts/active` endpoint, retains original official alert URLs and issue/expiry times, filters selected watches and warnings for severe storms, tropical storms, wind, tornadoes and floods, deduplicates, and caps output to the highest-priority 25 alerts per cycle. Expired, cancelled, non-actual, future and over-six-hour-old issuances do not become fresh candidates. HTTP failures stay visible through Radar collector failure receipts.

## Staging

```bash
node --test systemia/radar/nws-storm-desk.test.mjs
RADAR_NWS_STORM_DESK_ENABLED=true npm run radar:once
```

This enables NWS collection only in the specified process. Do not enable unattended releases or external publishing without a separate Systemia authorization, data/reliability check, source-freshness validation and editorial preflight.

## Truth boundary

The official warning is verified as an **issued warning**, not an independently measured wind speed, tornado touchdown, property loss or observed flood. Every parsed weather warning/watch has `facts.forecast=true` and `facts.impact_confirmed=false`, keeping Radar's truth state `PENDING` even with an official source. NWS weather alerts cannot serve as independent corroboration of damage reports by themselves. A nationwide active-alert feed also cannot recover an event after warnings expire.

## Kansas City October 13–14, 2026 | first editorial candidate

- NWS issued destructive severe thunderstorm warnings around Kansas City October 13 with radar-indicated potential for 80 mph gusts and one-inch hail: https://forecast.weather.gov/showsigwx.php?firewxzone=MOZ037&lat=39.0829&local_place1=Kansas+City+MO&lon=-94.5891&product1=Severe+Thunderstorm+Watch&warncounty=MOC095&warnzone=MOZ037
- KCTV reported downed trees, outages, hazardous roads and a North Kansas City school closure on October 14. Attribute these as local reporting; check official updates before release: https://www.kctv5.com/2026/10/14/severe-storms-wallop-metro-with-downed-trees-wreaking-havoc-morning-after/
- KMBC reported that Evergy outages exceeded 44,000 customers during the October 13 night. This is a **historical count**, never a live count: https://www.kmbc.com/article/kansas-city-storm-damage-trees-down-power-outages-october-13-2026/74126527
- A tornado **warning** is not a confirmed tornado; wait for a NWS storm survey or other official verification.

## Acceptance before production

1. Confirm Systemia mission admission and deduplication with the existing Isaias/Storm Atlas work.
2. Test genuine NOAA API retrieval, timeout and stale handling in staging, with 5-minute Radar residence and clearly visible source health receipts.
3. Add a distinct historical-NWS-alert / local-storm-report ingestion source for after-the-fact coverage, with verified road closures, gauge observations and outage snapshots.
4. Audit national geographic coverage, prioritization bias from the 25-alert cap, correction/expiry behavior and publish-state semantics.
5. Confirm no warning is rendered as observed property flooding, no stock or historical disaster photo is labeled current, and no public release occurs without the full 10/10 Journal editorial gate.

The code change does not claim to execute the system, activate the resident, or publish on any outside network.


## Preliminary aftermath lane (new, opt-in)

NWS Forecast Offices issue Preliminary Local Storm Reports (LSR), including spotter, emergency-manager and public reports. NWS labels these reports **preliminary until certified**. An office-issued product is not independent Evercraft confirmation of every claimed damage event.

The local-report collector polls the latest LSR for **up to four explicitly configured forecast offices** using the official NWS products API. Each record preserves its original `issuanceTime`, the official product link, a bounded text excerpt and `evidence_state=reported`. Reports remain labeled preliminary and durable for retrospective review; they never become a live danger warning or an observed property damage claim just because NWS hosted them.

```bash
# One-off staging only, no live public release is authorized by this command:
RADAR_NWS_STORM_DESK_ENABLED=true RADAR_NWS_LSR_OFFICES=EAX,BOX npm run radar:once
npm run test:radar
```

The NWS LSR endpoint is `https://api.weather.gov/products/types/LSR/locations/EAX/latest` (Kansas City office) and uses a capped set of offices to avoid a nationwide request storm. **The new LSR adapter has mock-based tests, but production payload, response-code and rate-limit behavior still require live-staging verification.** Any failed office poll marks the whole report collector failed instead of claiming an all-clear.

**Coverage boundary:** These four configured offices are *not* national LSR coverage. Expired advisories can be retrieved from NWS's seven-day alerts history separately, and wider sustained coverage needs regional sharding, geography validation and backfill. A separate verified impact register is still needed to establish actual damage.

**Source docs:** https://www.weather.gov/bgm/helpLocalStormReports and https://www.weather.gov/documentation/services-web-api . Both NOAA alert and preliminary-report adapters use the same `noaa-nws` upstream source family, avoiding fake independent corroboration.

## CI gate

The existing Forge CI workflow is now required to run `npm run test:radar` before the broader build. This PR remains a draft and should not be merged until GitHub checks and actual NWS staging are inspected.
