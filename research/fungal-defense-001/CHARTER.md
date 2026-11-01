# Evercraft Fungal Defense | FUNGAL-DEFENSE-001

**Status:** Research charter and evidence-gated public-data prototype. **Initiated:** 2026-11-01.
**Mission owner:** Evercraft. **Orchestration:** Systemia-first. **Public-facing name (working):** Evercraft Fungal Defense Observatory.

## Mission
Help people recognize, anticipate, and reduce the burden of emerging fungal disease through credible surveillance, accessible explanation, and guidance grounded in official health authorities. This is a public-health information and analytics project, **not** a diagnostic service, medical treatment, or prediction of fungal takeover.

## Why this project now
- WHO's 2026 fungal disease and antifungal resistance blueprint identifies surveillance, laboratory capability, diagnostics, awareness, stewardship, health systems and environmental drivers as major gaps.
- CDC's 2026 surveillance reports document increasing U.S. Candida auris clinical cases. Hospital- and long-term-care transmission is a demonstrated concern.
- Schuh & Gokhale (mSphere, 2026) review climate-driven fungal thermotolerance and C. auris emergence. **Climate causality, which fungi might emerge next, and any clinically meaningful effect of declining average human body temperature remain uncertain.**
- Neither a human fungal takeover nor behavior-controlling fungal infections of humans is evidenced by these sources.

## Core scientific distinctions
1. **Observed**: Specific fungal diseases cause infections; some are resistant to antifungals; C. auris transmits in healthcare facilities.
2. **Hypothesized / under active research**: Environmental change may select for thermotolerant fungi and contribute to emergence; the relative causal contribution is not established.
3. **Not established**: General takeover of humans by mushrooms, inevitable species-wide infection, or a specific timeline for such events.
4. Distinguish **clinical cases**, **screening/colonization cases**, invasive infections, deaths, and population-level estimates. Do not combine them as interchangeable denominators.
5. Different official CDC displays report somewhat different 2024 case counts (the CDC tracking page displays 6,304; the July 2026 corrected MMWR surveillance analysis reports 6,197). Keep the **source, access date, case definition, and revision** attached to every count; do not silently reconcile them.

## First defensible product: public-data Fungal Defense Observatory
### MVP capabilities
- Public, mobile-first evidence dashboard for fungal priority pathogens; start with *Candida auris*.
- Annual U.S. clinical-case series with transparent provenance, source links, and last-reviewed dates.
- Map of reported cases using only official public aggregate data; preserve CDC suppressed small-count bins (e.g. "1 to 10").
- Separate tabs for **Observed cases**, **Environmental hypotheses**, and **Prevention resources**.
- Source quality badges: official surveillance, peer-reviewed review, preliminary study, model/projection, unverified report.
- Prevention resource cards link to CDC/WHO clinician and public guidance. No self-diagnosis, individual risk inference, treatment advice, or outbreak declarations.
- Accessible descriptions and explicit caveat that counts reflect surveillance/detection practices, not a direct measure of every infection.

### Safe scope and boundaries
- **Public aggregate information only**; no patient-identifying information, facility exposure data, or unauthorized health records.
- **No culturing, growing, genetically modifying, selecting, training, or testing pathogenic fungi**. No wet-lab pathogen work.
- Do not use AI-generated predictions as alerts; distinguish actual reported public-health advisories from exploratory models.
- No unsourced outbreak maps, alarmist severity colors, or inferred facility-level clusters.
- Consult qualified mycologists, infectious disease experts, infection-prevention professionals, and public-health agencies before clinical or policy claims are deployed.

## Work packages
**WP1: Evidence registry and editorial review**
- Catalog WHO Fungal Priority Pathogens, CDC C. auris surveillance, research papers, uncertainty and source revision history.
- Deliver: versioned citations and claim-status ledger.

**WP2: Public-data ingestion**
- Start with CDC C. auris national yearly CSV and state table; record fetched-at/accessed-at, schema, source definition, licensing and suppression.
- Deliver: repeatable parse/validation script and public aggregate dataset; check counts against original source.

**WP3: Observatory prototype**
- Mobile-first overview, case charts, source links, confidence labeling, accessible disclaimers.
- Deliver: static local MVP, then Systemia integration subject to runtime checks.

**WP4: Human benefit**
- Prevention guidance router to CDC/WHO; clear alerts to official reporting and infection-control advice.
- Deliver: pathways for public, care teams and researchers, reviewed for clarity and medical safety.

**WP5: Expert validation**
- Identify mycology/infection-prevention advisers and scientific partners. Do not assert partnerships until confirmed.
- Deliver: external review criteria and documented findings.

## MVP acceptance tests
- Every count traceable to an official source and appropriate case definition.
- No case is described as an infection/death unless the source supports it.
- Uncertainty clearly distinguished from demonstrated evidence.
- Small suppressed cells stay suppressed.
- Information displays on phone and desktop; source, update date and caveat visible.
- Nothing represented as live surveillance unless refreshed data and freshness tests prove it.
- Public-health guidance always links to official recommendations.
- Public release requires content review and no unsupported predictive warning.

## Primary source register (verified 2026-11-01)
1. Schuh CE, Gokhale CS. *Candidozyma auris (Candida auris) as a harbinger of novel fungal pathogens*. mSphere (2026-10-02). https://doi.org/10.1128/msphere.00109-26
2. CDC. *Surveillance for Candida auris, United States 2022–2024*. MMWR (2026-07-02), corrected analysis. https://www.cdc.gov/mmwr/volumes/75/ss/ss7504a1.htm
3. CDC. *Tracking C. auris* (aggregate counts and downloadable CSV). https://www.cdc.gov/candida-auris/tracking-c-auris/index.html
4. CDC. *Preventing the Spread of C. auris* (2026-10-01). https://www.cdc.gov/candida-auris/prevention/index.html
5. WHO. *Blueprint for strengthening responses to fungal disease and antifungal resistance* (2026-06-30). https://www.who.int/publications/i/item/9789240122529
6. WHO. *Landscape analysis of commercially available and pipeline in vitro diagnostics for fungal priority pathogens* (2025-03-19). https://www.who.int/publications/i/item/9789240105539
7. Denning DW. *Global incidence and mortality of severe fungal disease*. Lancet Infectious Diseases (2024). https://pubmed.ncbi.nlm.nih.gov/38224705/

**Evidence gate:** When new claims appear, source and classify first; publish interpretation only after verification. Avoid sensationalizing an already serious public-health problem.
