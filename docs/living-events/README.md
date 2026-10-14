# Evercraft Living Events | Evidence-first exhibit (v1)

**Status:** Static, editorial prototype only. The repository branch is not production deployment, Systemia mission admission, partner acceptance, licensed media authorization, or public publishing approval.

This reusable public-surface prototype exposes three distinct event dossiers from one HTML renderer and one external JSON registry:

- Nepal Budhi Gandaki flooding, 11 October 2026 (reported impacts with unresolved identity/validation questions)
- Mount St. Helens eruption, 18 May 1980 (historic USGS reference material)
- Yakima Basin water shortages, a dated August 2026 Reclamation snapshot (not current conditions)

## Entry point and registry
When reviewed and intentionally deployed by the host, the Vite `public/` root serves `/living-events/`. The `index.html` loads `./cases.json` and declines to render event claims if the registry fails to load. Each source-linked milestone and feature resolves to an explicit URL in the same dossier's source register. All scene markers are **conceptual UI placement**, never geocoded flood extents, evacuation routes, bridge coordinates, historic camera positions, or USGS-reconstructed terrain.

Preview locally with `python3 -m http.server 8080 --directory public` and open `http://localhost:8080/living-events/`. Local `file://` preview cannot fetch JSON reliably by browser policy.

## Maintainer checks
`node --test tests/living-events.test.mjs`

## Evidence and rights boundary
Do not silently merge records for the October Budhi Gandaki flood with earlier August Nepal missions. Preserve as-of times, official attribution, and conflicts across bridge/WASH/housing counts. The humanitarian mission is separate from any commercial showcase. ITN footage, licensed satellite imagery, private data, field observations, and newsroom assets are **not** bundled or implied. The source-linked status is not equivalent to independent verification or a safety clearance.

## Systemia next stage
This is a proposal for Systemia admission, not an admission receipt. Reuse existing FAIE/TOWI research and Atlas taxonomy, Forensiscope evidence/provenance, graphics/Gravity for permitted data-driven rendering, Journal/Clip publication gates, and independent Shipping acceptance. Do **not** turn on paused autonomous workflows or dispatch agents from this repository change.

Acceptance before public promotion: Systemia mission receipt; claimant/source/date checks; imagery and media rights; independent editorial QA; deployed revision readback; actual iPhone opening and accessibility tests; publication and rollback evidence. No checkout or payment is created by the exhibit.
