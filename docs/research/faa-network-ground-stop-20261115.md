# Evercraft Research | FAA Network Flood & Radar-Feed Instability
**Case:** ER-FAA-FTI-2026-11-13  
**Evidence cutoff:** November 15, 2026 (U.S. Pacific)  
**Status:** OPEN / EVIDENCE LEDGER / ROOT CAUSE UNCONFIRMED  
**Editorial gate:** Research draft for review. Not an approved public Journal article, a live sensor feed, or proof of a coordinated attack.

## Executive finding
The United States experienced a nationwide FAA ground stop on November 13, 2026 after instability in the FAA's Telecommunications Infrastructure (FTI) network disrupted aircraft communications and some radar feeds. FAA's November 15 account reports unusual traffic of roughly 1,000 connection attempts per 4–5 seconds; potential origination points at an Amarillo, Texas radar site and an El Dorado, Arkansas radio communications site; and network stabilization after L3Harris blocked the two locations. The FAA says 17 of 22 en-route control centers experienced instability, some radar/radio services remained usable, and its SMART data aggregation system was unrelated. The FAA has not published a definitive root cause.

The supported investigation is about cascading dependencies and change management in critical infrastructure. It is **not** evidence that global radar systems failed, an attacker coordinated the events, or SMART caused the outage.

## Verified incident chronology
| Date / time | Claim | Evidence classification |
| --- | --- | --- |
| Nov 10 | FAA publicly announced SMART expansion to the airspace of all 22 centers. | **Observed announcement**. Does not establish a causal relationship. [FAA General Statements](https://www.faa.gov/newsroom/statements/general-statements) |
| Nov 12 | Microsoft 365 experienced a separate international outage affecting cloud productivity services; Microsoft attributed it to unavailable/overloaded server infrastructure, with no evidence of malicious activity. | **Reported by Microsoft / Reuters**. Shared technical cause with FAA **unsubstantiated**. [Reuters](https://www.reuters.com/technology/microsoft-365-outlook-down-thousands-us-users-downdetector-shows-2026-11-12/) |
| Nov 13 ~3:30 p.m. ET | FAA experienced a technical problem; nationwide departures were stopped as a precaution. | **FAA statement**. [FAA Q&A, Nov 15](https://www.faa.gov/newsroom/nationwide-ground-stop-questions-and-answers) |
| Nov 13 8:15 p.m. ET | FAA stabilized the system and lifted the nationwide ground stop. | **FAA statement**. [FAA Q&A](https://www.faa.gov/newsroom/nationwide-ground-stop-questions-and-answers) |
| Nov 14 | DOT publicly described a remote copper-to-fiber / legacy TDM-to-IP conversion, a possible fault or install error, and excess router-to-router network traffic. | **On-record official explanation, provisional root-cause hypothesis**. [DOT briefing](https://www.transportation.gov/briefing-room/icymi-us-transportation-secretary-sean-p-duffy-provides-update-restoration-airspace) |
| Nov 15 | FAA identified two potential traffic sources, stated 17/22 en-route centers experienced instability, ruled SMART out as causal, reported no evidence of cyberattack, and confirmed some radar/radio services stayed operational. | **Current official FAA findings**. [FAA Q&A](https://www.faa.gov/newsroom/nationwide-ground-stop-questions-and-answers) |
| Nov 15 | HPE/Juniper said the router devices acted as configured by the installer, did not independently fail; L3Harris said it was supporting the investigation. | **Attributed vendor statements, not independently established root cause**. [ABC News](https://abc30.com/live-updates/faa-ground-stop-live-updates-what-know-nationwide-flights-are-grounded/20038887/) |

## Core evidence ledger
| ID | Proposition | State | Source / evidentiary limit |
| --- | --- | --- | --- |
| FAA-01 | Nationwide ground stop Nov 13; resumed 8:15 p.m. ET | **Confirmed by agency** | FAA Nov 15 Q&A |
| FAA-02 | FTI network encountered ~1,000 connection attempts per 4–5 sec, affecting radio and radar feeds | **Confirmed as agency's preliminary account** | FAA Q&A; no independent packet captures available |
| FAA-03 | Amarillo radar site and El Dorado radio communications site identified as potential sources | **Preliminary identification** | FAA Q&A; the exact origin and cause remain under investigation |
| FAA-04 | Routine work at El Dorado involved a new router and migration away from legacy copper/TDM | **Agency-reported** | DOT Nov 14 briefing |
| FAA-05 | 17 of 22 centers unstable; disruptions spread to several TRACONs | **Agency-reported** | FAA Q&A |
| FAA-06 | *All radar went down* | **Contradicted by official evidence** | FAA says some radar feeds and radio frequencies remained available |
| FAA-07 | SMART rollout caused Nov 13 outage | **Contradicted by FAA** | FAA explicitly says SMART is separate, aggregates data, does not feed ATC |
| FAA-08 | Cyberattack or nefarious actor caused event | **No evidence established** | FAA says no indication on evidence available; not a categorical proof of impossibility |
| FAA-09 | L3Harris contractor fault or faulty router | **Under investigation** | DOT officials described alternatives; neither proven |
| FAA-10 | HPE/Juniper hardware malfunctioned | **Disputed** | HPE/Juniper said router performed its configured behavior; independent forensic report not public |
| FAA-11 | Approximately 60 similar routers had broadcast functionality disabled as precaution | **Agency-reported mitigation** | FAA Q&A; separate Duffy TV remarks cite 69 routers in the broader set, a scope/count discrepancy to clarify |
| FAA-12 | Official FAA Nov 15 Q&A reports ~12,462 Friday flight cancellations, but notes not all are directly attributable to ground stop | **Agency-reported count, qualified** | FAA Q&A |
| COR-01 | Microsoft outage shares root cause, supplier, or attack with FAA | **No documented link** | Microsoft/Reuters accounts concern different infrastructure; time overlap alone does not establish common cause |
| COR-02 | Iranian drones destroyed U.S. radar in Bahrain | **Contested / not confirmed** | IRGC claimed destruction; CENTCOM said drones were intercepted without damage. [RFE/RL](https://www.rferl.org/amp/iran-us-sirik-bahrain-war-nuclear-talks/33897951.html) |
| COR-03 | Weather radar (NEXRAD) failing worldwide | **Not established** | NOAA's [software build inventory](https://www.roc.noaa.gov/build-loaded.php) is *not* an uptime log and must not be used to assert live availability or outage |

## Discrepancies that deserve investigation
1. **Why did work at El Dorado coincide with network flooding at the Amarillo site?** Duffy said Amarillo's replacement work had been performed weeks earlier. Need change records and topology to determine whether inter-site behavior was preexisting or newly induced. [CBS transcript](https://www.cbsnews.com/news/sean-duffy-transportation-secretary-face-the-nation-transcript-11-15-2026/)
2. **Hardware failure, installer configuration, or design problem?** DOT floated faulty equipment and contractor error; HPE/Juniper said devices performed as configured. These are not necessarily contradictory in an engineering sense: correct execution of a hazardous configuration can still destabilize a system. But responsibility and mechanism are unresolved.
3. **Network blast radius:** Why could traffic originating at one or two remote facilities affect 17 control centers and multiple TRACONs? Which routing or broadcast-domain boundaries, control-plane protections, rate limits, and fallback paths applied? Do not assert a specific topology without documents.
4. **Mitigation scope:** FAA FAQ says approximately 60 similar routers; Duffy's TV statement reportedly refers to 69 routers. Ask whether they denote total installed versus mitigated subset, not assume either figure is false.
5. **Change control:** What test, rollback, peer review, scheduled maintenance, and monitoring criteria applied to TDM-to-IP transition? Were other facilities migrated with comparable configuration?
6. **Independent postmortem:** Seek FAA, L3Harris and HPE/Juniper detailed incident findings, chronology, affected-site list, and documented corrective actions; preserve disagreements as source-attributed.

## Separate simultaneous events: correlation screen
- **Microsoft 365 global outage:** Confirmed separate service incident Nov 12–13. Microsoft's available account describes server unavailability, health checks, and capacity problems. No demonstrated shared FTI dependency or joint causation.
- **Bahrain radar claim:** IRGC statement and CENTCOM denial relate to military conflict and disputed physical damage. No verified relationship to domestic FAA infrastructure.
- **Weather radar:** NEXRAD and military early-warning radar are distinct from FAA air traffic radar feeds. No complete station-by-station independent availability audit completed in this dossier.
- **SMART:** Nearby announcement is a valid chronology item, not evidence of causal participation; the FAA expressly reports systems are separate.

## Investigative tasks (public-source only)
- [ ] Preserve date-stamped copies or stable web archives of FAA Q&A and Nov 13/14 DOT statements. Record update timestamps and content checksums.
- [ ] Request or monitor public FAA/DOT/L3Harris/HPE/Juniper post-incident findings and configuration/maintenance review summaries.
- [ ] Reconcile ~60 mitigated routers with ~69 installed routers; define denominator and precise mitigation.
- [ ] Verify independently the flight cancellation accounting (Friday total and subset directly caused by outage) before republishing a figure.
- [ ] Locate authoritative dated NOAA NEXRAD operations/uptime records to test *weather radar outage* claims without confusing software build lists with operational status.
- [ ] Track incident-specific Microsoft postmortem (EX1550543 / MO1550821); compare dependencies only where evidence documents a technical commonality.
- [ ] Track definitive CENTCOM/third-party evidence on Bahrain claim; don't repeat destruction as fact.
- [ ] Review public-source reporting for earlier FAA FTI modernization incidents and change-management findings; distinguish analogies from causal links.

## Publishing integrity gate
**Safe summary:** "The FAA's preliminary explanation points to network traffic flooding aging aviation telecommunications during remote router work, destabilizing radar feeds and communications across many control centers. The exact root cause is still under investigation."  
**Not safe as fact:** "Radar is disappearing everywhere"; "SMART caused it"; "AI did it"; "Microsoft and FAA were coordinated"; "Iran destroyed the Bahrain radar."  
Publish only after independent editorial review and current-source refresh. Do not claim live system telemetry, agent execution, proprietary access, or a verified root cause.

## Primary sources and contextual reporting
1. [FAA Nationwide Ground Stop Q&A, Nov 15, 2026](https://www.faa.gov/newsroom/nationwide-ground-stop-questions-and-answers)
2. [FAA General Statements, SMART announcement Nov 10 and ground stop Nov 13](https://www.faa.gov/newsroom/statements/general-statements)
3. [U.S. DOT Nov 14 press briefing](https://www.transportation.gov/briefing-room/icymi-us-transportation-secretary-sean-p-duffy-provides-update-restoration-airspace)
4. [U.S. DOT Nov 13 press briefing](https://www.transportation.gov/briefing-room/icymi-us-transportation-secretary-sean-p-duffy-announces-lifting-nationwide-ground)
5. [CBS Face the Nation full transcript, Nov 15](https://www.cbsnews.com/news/sean-duffy-transportation-secretary-face-the-nation-transcript-11-15-2026/)
6. [ABC/ABC30 continuous report incl. vendor statements, Nov 15](https://abc30.com/live-updates/faa-ground-stop-live-updates-what-know-nationwide-flights-are-grounded/20038887/)
7. [Reuters, flight disruption follow-up, Nov 15](https://www.reuters.com/world/us/us-air-travel-disruptions-continue-into-third-day-2026-11-15/)
8. [Reuters, Microsoft outage](https://www.reuters.com/technology/microsoft-365-outlook-down-thousands-us-users-downdetector-shows-2026-11-12/)
9. [RFE/RL, Bahrain claim and CENTCOM denial, Nov 13](https://www.rferl.org/amp/iran-us-sirik-bahrain-war-nuclear-talks/33897951.html)

**Research standard:** Attribute agency and vendor claims. Do not treat claims, estimates, hypothetical causal mechanisms, or incomplete service dashboards as proven measurements.
