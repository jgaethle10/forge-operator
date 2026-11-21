# Evercraft Innovation Prize Radar | Research Seed
**Snapshot:** 2026-11-15 (America/Los_Angeles)  
**Authority:** Systemia-first intake; GitHub issue [#2117](https://github.com/jgaethle10/forge-operator/issues/2117) is an evidence packet, not proof of live Systemia mission execution.  
**State:** Research branch only; not deployed, entered, funded, submitted or awarded.

## Qualified original-source leads
| Priority | Prize / program | Deadline | Financial reality | Feasibility / decision | Official source |
| --- | --- | --- | --- | --- | --- |
| P0 | DOE Geologic Enhanced Mapping System (GEMS) Prize | 2026-12-03 22:00 UTC | $300,000 competitive prize pool, **not revenue** | Software/geospatial workflow; build a reproducible GeoTIFF baseline, verify rules/eligibility first | https://www.drivendata.org/competitions/306/ |
| P0 clock | NASA Space Apps 2026 | 2026-11-15 23:59 event-local/team-owner-local | Hackathon, **no cash expectation** | Only possible with human registration/event/team and same-day submission; no entry confirmed | https://www.spaceappschallenge.org/2026/ |
| P1 | NASA Lunar Grounding | 2027-01-15 | $150,000 prize pool, no entry fee, Phase 1 needs concept not physical prototype | Pursue only after electrostatic/space-qualification expert review and rules vetting | https://work.crowdplat.com/challenge/lunar-grounding-challenge |
| Partner-only | NASA Human Lander Challenge (HuLC) | 2027-03-04 23:59 ET | $126,000 total cash prizes | Collegiate-team-only; company cannot substitute for student-created work | https://www.usa.gov/challenges/nasa-human-lander-challenge |

## Why GEMS first
The problem is to predict unseen fault locations using a high-resolution geological/raster data stack. Organizer provides `training_features.tif` at EPSG:32611 and 100 m resolution and a reference Python notebook. Required submission is a single-band float32 GeoTIFF, original reference shape and transform, confidence in [0,1]. Scoring is distance-weighted Tversky, alpha 0.2, beta 0.8, with 300m distance support. The organizer requires model and data reproducibility for finalists. Do not commit official downloaded challenge data or challenge-specific trained weights to this public repository without reviewing licensing and competitive/IP implications.

**Original requirements:** https://www.drivendata.org/competitions/306/competition-doe-gems/page/967/  
**Reference implementation:** https://github.com/drivendataorg/gems-prize-reference-solution  
**Official rules link (human review required):** https://www.herox.com/GEMSPrize/resource/2274

## Small owned engineering component
`gems_submission_validate.py` checks an already generated candidate against a local official `training_features.tif`. Requires `numpy` and `rasterio`. Example after permitted registration/data access:

```bash
python research/opportunities/gems_submission_validate.py \
  --reference /path/to/training_features.tif \
  --prediction /path/to/predictions.tif
```

It checks EPSG:32611, 100m north-up pixels, exact reference dimensions/transform/CRS, one float32 output band and confidence range. A passing format validator does **not** establish model accuracy, valid registration, or an accepted upload. Independent runtime test still pending; no official contest dataset is present here.

## General ingestion gates
Every opportunity gets:
- Verified organizer URL, official rules, deadline **including timezone**, current open/closed status; source-verification timestamp.
- Eligibility: person/company/US-only/student; one-account requirements; intellectual property and AI/third-party-data restrictions.
- Cost: $0 verified, unknown/hold, or positive fee (deprioritize); total prize pool separated from individual award and paid contract value.
- Exact deliverable and data/prototype requirements; estimated engineer hours, hardware spend and practical compute constraints.
- Owned existing capabilities, deficits, partner dependencies and feasible first demonstration.
- Scored 0–100 on fit (30), speed to artifact (20), financial payoff vs cost (15), deadline feasibility (15), reusable IP (10), buyer relationship (10). An unverified hard eligibility gate overrides rank.
- Buyer/sponsor decision, registration human action, evidence receipts, and dedupe with existing Evercraft Revenue & Deadline Radar. No new hourly clone.
- Hard holds: retired Base44 infrastructure; RIVET/AliEV/EV legal/IP categories; no unsolicited external contact without Systemia authorization; no spend or account registration by inference.

## Next engineer actions
1. Founder reviews rules/eligibility and personally registers or explicitly authorizes a recognized account action; obtain lawful dataset access (not done).
2. Verify access to local training datasets, data licenses and source hashes without publishing them.
3. Reproduce organizer baseline in owned compute and record environment + metrics. Treat results as test evidence only.
4. Train a model with spatially independent evaluation and generate georeferenced confidence maps; validate.
5. Compare results against organizer scoring, review reproducibility/IP and have the human submit before cutoff. Capture acknowledgement; no submission until then.
