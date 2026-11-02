# SUBMERGED-HERITAGE-001 · Evercraft Submerged Heritage Atlas
Date: 2026-11-02 · Owner: Evercraft Research · State: evidence-backed research seed + working static source, **not a deployed production experience**.

## Mission
Map publicly documented submerged settlements and notable underwater structure claims without presenting geological shapes or unsourced television interpretations as archaeological proof. Create a readable public atlas now, followed by evidence-gated EverMaps and Evercraft Worlds integration.

**Systemia-first authority:** This repository branch is an implementation and evidence packet. The available Evercraft public connector is read-only discovery and cannot create or authorize a Systemia private mission. A Systemia record, runtime job, production release, or completed autonomous research mission is **not** claimed until a separate authoritative receipt exists.

## v0.1 deliverables
- Seven versioned case records in [GeoJSON](../../public/submerged-heritage/sites.geojson), each with at least one outbound source.
- Five confirmed sites: Pavlopetri (Greece), Thonis-Heracleion (Egypt), Baiae (Italy), Port Royal (Jamaica), Atlit-Yam (Israel).
- Two *disputed interpretations*, not confirmed submerged cities: Yonaguni (Japan), western Cuba sonar anomalies.
- A dependency-free responsive [public explorer source](../../public/submerged-heritage/index.html) with filter, search, source drill-down, country/region context and geographically projected coarse markers.
- No naturalistic reconstructed terrain, borrowed bathymetry, fabricated sonar, or invented artifact imagery.

## Evidence contract
1. Classification applies to a specific claim, not to the existence of a physical feature. "Disputed" records can describe a genuine underwater formation while withholding judgment on human construction.
2. A *confirmed site* requires archaeological evidence (excavated built remains, artifacts, credible site survey, or recognized institutional record). News reports about geometric patterns alone do not suffice.
3. Every feature has a source link, a concise observed-evidence statement, a separate interpretation statement, and a submergence/alternative-explanation note.
4. GeoJSON coordinates are **illustrative broad regional anchors**, not excavated-feature positions. Do not convert them into dive coordinates or represent them as site survey accuracy.
5. No sensitive archaeological coordinates, private survey payloads or collection targets. UNESCO's underwater-heritage guidance gives priority to in-situ preservation and non-destructive work.
6. Any future photogrammetry/ROV/sonar/3D reconstruction must carry licensing, provenance, capture date, uncertainties and ground-control explanation. Synthetic reconstructions must be explicitly labeled.
7. Reject dramatic age, "advanced civilization", civilization-wide collapse, or megastructure assertions without appropriate dated archaeological evidence.

## Primary evidence anchors (starter)
- University of Nottingham documented Pavlopetri's systematic survey, excavation and settlement chronology: https://impact.ref.ac.uk/casestudies/CaseStudy.aspx?Id=28862
- IEASM excavation programme and Oxford Centre for Maritime Archaeology: https://www.ieasm.institute/institute.php?lang=en and https://www.arch.ox.ac.uk/ocma
- Italian ISPRA documented 2025 bathymetric LiDAR over Baiae: https://www.isprambiente.gov.it/en/news/mer-project-2013-coastal-mapping-exploring-the-submerged-wonders-of-the-baia-archaeological-park
- UNESCO Port Royal inscription 2025: https://whc.unesco.org/en/list/1595/
- Atlit-Yam archaeological research: https://whitelevy.fas.harvard.edu/excavations-submerged-neolithic-site-atlit-yam-carmel-coast-israel
- Yonaguni debate: https://www.nationalgeographic.com/history/article/yonaguni-jima-japan-underwater-city
- Western Cuba early reports (media only, **not proof of a city**): https://www.washingtonpost.com/archive/politics/2002/10/10/in-cuban-depths-atlantis-or-anomaly/96b5cd79-9eb8-4fc7-8f18-8a3b3e9b4037/
- UNESCO 2001 underwater cultural heritage framework: https://www.unesco.org/en/legal-affairs/convention-protection-underwater-cultural-heritage

## Product handoff / integration boundaries
**Evercraft Research:** cite, classify, track claims and corrections. **EverMaps:** add regional evidence cards and map layer only when location metadata and rights are safe to expose. **Evercraft Worlds Timewalk:** any walkable reconstruction needs a separate era estimate, sourced geometry and a visible verified-vs-recreated legend. **Subsea Watch:** dive replay supports only independently surveyed, timestamped position inputs; this atlas must never be used to derive a diver route, unseen hazards or clearance to dive.

## Next build sequence
1. Validate schema, citations and safety labels. Check accessibility and mobile rendering.
2. Verify public URL after any approved merge/deployment; source committed does not prove GitHub Pages or independent-host delivery.
3. Expand documented sites with licensed mapping imagery and site-level scholarly provenance. Keep disputed cases in a separate hypothesis lane.
4. Add date/period filtering, location uncertainty and two views: **historical evidence** and **illustrative reconstruction**.
5. Produce an editor-reviewed Journal story on the confirmed sites before distributing excerpts; do not promote the disputed cases as proven Atlantis.

## Non-claims
No direct connection to Systemia private mission authority; no deployment or checkout; no sonar ingestion; no precise archaeological map; no field expedition; no verified 3D digitization; no authorization to dive, recover or excavate.
