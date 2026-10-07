# RIVET Session Advantage

Mission: `rivet-us-session-sprawl-001`

## Product rule

RIVET remains simple. Session-data complexity belongs in AliEV and the report evidence model, not in a crowded buyer UI.

The buyer experience should stay:

`address -> report`

The internal evidence path may expand continuously.

## Why session intelligence matters

A charger pin tells us supply exists. It does not prove demand.

RIVET should prefer legitimate site-resolved observed charging-session evidence whenever available and preserve enough context to answer not only "how many sessions happened?" but "when, how consistently, with how much energy, at what apparent load, and how fresh is the evidence?"

## Session evidence ladder

### Level 0: inventory only
Station, ports, power, operator, access and status. Never call this utilization.

### Level 1: observed aggregate
Observed session count for a verified site and period. Minimum bar for session coverage.

### Level 2: observed performance
Session count plus energy, connected/charging time, sessions/day, period duration and evidence freshness.

### Level 3: temporal behavior
Hour/day/week patterns, peak periods, quiet periods, seasonality, ramp from open date and rolling trends.

### Level 4: operational quality
Reliability/availability, failed or incomplete sessions where lawful and available, simultaneous occupancy/port saturation, pricing history and network context.

### Level 5: decision intelligence
Comparable nearby sites, cohort-normalized performance, ramp curves, site archetypes, demand-transfer signals and forecast models clearly labeled as modeled.

No level may be inferred upward from a lower level.

## Canonical fields to pursue

Required for coverage:
- stable site/station identity
- coordinate or geocodable physical site
- source and provenance
- period start/end or verified duration
- observed session count
- evidence status

High-value enrichment:
- energy_kwh
- charging_minutes
- connected_minutes
- ports/connectors observed
- sessions_per_day derived from verified duration
- energy_per_session
- kwh_per_port_day
- time-of-day distribution
- day-of-week distribution
- simultaneous occupancy / saturation where available
- station open date
- price history
- reliability / uptime evidence
- failed-session evidence where lawful
- source vintage and retrieval timestamp

## Coverage scoreboard

Track:
1. unique site-resolved observed-session locations
2. jurisdictions with accepted session coverage
3. session-capable records refreshed in the last 90/180/365 days
4. percent of tested RIVET addresses with observed session evidence inside 1/3/5/10 miles
5. percent of observed sites with energy enrichment
6. percent with temporal-pattern enrichment
7. percent with reliability enrichment
8. percent with pricing enrichment
9. stale-source count
10. blocked sources by reason: access, license, geography, identity, terms, freshness

## Acquisition lanes

Allowed:
- official open-data APIs and downloads
- utility, municipal, state and federal public reporting
- grant/project publications with commercial-use rights
- public CPO/site-host data whose terms allow the use
- direct permissioned partner feeds
- customer-authorized first-party charging data
- licensed providers only after explicit purchasing/contract authority

Not allowed:
- bypassing authentication
- evading rate limits or access controls
- scraping restricted dashboards against terms
- treating confidential regulator-held data as public
- purchasing or accepting contractual obligations without explicit authority
- converting estimates or inventory into "observed"

## Competitive objective

Do not chase feature-count parity by cluttering RIVET.

Win on:
- better evidence integrity
- more useful session coverage
- clearer uncertainty
- faster address-to-report flow
- deeper underneath-the-hood intelligence
- report outputs that a salesperson, owner, installer or investor can immediately use

A RIVET report should be easier to consume than the competition while AliEV becomes harder to replicate.
