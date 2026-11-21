# Evercraft opportunity radar: initial research and mapping discovery brief

Status: **proposal / research backlog**, not an active crawler, verified contract, grant award, customer, or completed pilot.

Owner issue: [#1632](https://github.com/jgaethle10/forge-operator/issues/1632)

## Why this exists

Evercraft already exposes direct specialist discovery, CHUM, a machine-readable capability directory, and a read-only Fabric MCP. This brief defines an *outbound opportunity-discovery* lane that finds public problems and matches them to **evidence-backed** Evercraft capabilities. Discovery is not eligibility, an agreement, or an authorization to contact anyone.

## Initial sectors and candidate capabilities

| Problem to search for | Evercraft candidate | First bounded deliverable | Verification needed |
| --- | --- | --- | --- |
| Agricultural water and land resilience | FAIE, EverMaps, TOWI | Source-linked local conditions brief with dated layers | Geography, source license, missing-data handling, specialist review |
| Water-quality / PFAS data provenance | PFAS Atlas, TOWI, EverMaps | Public-data evidence inventory and uncertainty map | Data recency, lab methods, unit harmonization, no inferred contamination |
| Infrastructure isolation / heat / smoke | Lifeline Map, Heat + Smoke Action Map | Public-source hazard and access map | Local authority review, no emergency-routing guarantees |
| River-basin changes | River Intelligence, Worldstate | Reproducible before/after evidence brief | Temporal comparability, upstream provenance |
| Public environmental project accountability | EcoLedger | Promise-to-evidence monitoring template | Verified sources, no implied regulatory certification |
| Software/operations improvement | Forge Operator, BuildFlow | Operational diagnosis and proposed human gates | Customer consent, delivery readiness |

**Readiness is not inferred from names or catalog entries.** Check live routes, evidence and service terms before describing a capability as purchasable or deployed.

## Primary discovery sources

1. [SAM.gov Contract Opportunities](https://sam.gov/content/opportunities) for paid federal procurement.
2. [Grants.gov](https://www.grants.gov/search-grants) for assistance opportunities and applicant restrictions.
3. [NSF America's Seed Fund](https://seedfund.nsf.gov/) for high-risk technical innovation.
4. [EPA SBIR](https://www.epa.gov/sbir/sbir-funding-opportunities) for solicitation-specific environmental technology.
5. [NOAA SBIR](https://techpartnerships.noaa.gov/sbir/fundingopportunities/) for eligible environmental and observation technology.
6. [USGS 3D National Topography Model](https://www.usgs.gov/3d-national-topography-model) for mapping/data collaboration.
7. [Washington WEBS](https://pr-webs-vendor.des.wa.gov/) for Washington public procurement.
8. [Washington Department of Ecology](https://ecology.wa.gov/about-us/payments-contracts-grants/grants-loans) for relevant water/environment programs.
9. [WSU research](https://research.wsu.edu/) for potential academic collaboration; do not assume small-business eligibility for faculty-only programs.

## Lead record schema

Each lead must preserve:
- `source_url`, `publisher`, `notice_id`, `title`, `first_seen_at`, `last_checked_at`
- `published_at`, `deadline_at` (timezone), `status` (verified open / closed / unknown)
- `opportunity_type` (paid contract / non-dilutive award / cost-share / academic partnership / commercial lead)
- `eligible_entities`, `geography`, `required_partners`, `registration`, `matching_funds`
- `candidate_capabilities`, `readiness_evidence`, `technical_fit`, `eligibility_confidence`
- `owner_review`, `next_action`, `evidence_links`, `no_contact_without_approval`

## Scoring

Score eligibility first. **Ineligible** is a hard stop. **Unknown** requires verification before application work. Then score technical fit (0-5), demonstrated readiness (0-5), deadline feasibility (0-5), potential value (0-5), and mission fit (0-5). Flag legal/IP restrictions and partner requirements separately. Never let a high aggregate score override a hard stop.

## First implementation acceptance test

- Produce 20 deduplicated, source-linked candidate records with accurate checked-at timestamps.
- Independently confirm the top five are open and the stated entity type is eligible or explicitly unknown.
- Produce one reproducible environmental/geospatial brief using only appropriately licensed public data, with citations and uncertainty.
- Record at least three cold-client discovery tests for existing public doors, distinguishing route health from actual provider pickup.
- Prepare, **do not send**, three tailored partner/customer outreach drafts for owner approval.
- Do not submit grants, contact external parties, publish new claims, spend money, or touch held EV work without an explicit human gate.

## Human gates

1. Approve the first public-facing service claim and sample deliverable.
2. Approve each external outreach or application.
3. Have a qualified reviewer sign off on safety/environmental interpretations before client-facing use.
