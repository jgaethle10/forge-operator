# Nepal Flood 002 | Evidence QA (candidate-only)

**Status: engineering review candidate. Not an official map, rescue deployment, verified imagery product, route clearance, funding award, or HOT/NAXA assignment.**

This dependency-free Node 22+ validator tests the six reported crossing names from the October 11, 2026 Budhi Gandaki/Gorkha flood against evidence and safety gates. It creates an **unverified review queue**, not a verified count of six bridges. Earlier August Rasuwa features are not valid evidence for this separate incident.

### Run from repository root

    node examples/nepal-flood-002/validate.mjs examples/nepal-flood-002/data/crossings.csv > /tmp/nepal-002-candidate-report.json
    node --test examples/nepal-flood-002/tests/*.test.mjs

The validator emits JSON and exits nonzero on any failed gate. It does not fetch satellite images, inspect private records, invoke remote agents or send correspondence.

### Boundaries

- Candidate names may refer to the same crossing, notably Nyakchet–Sirdibas versus Nyakchet–Philim and Soti versus the Arughat inter-district bridge. **No unique-loss count is certified.**
- Reported means *attributed*, not independently observed. Every record has a dated incident key, a source URL and an unresolved review question.
- No inferred coordinates: blank latitude/longitude are deliberate. An authorized map requires new validated geometry, capture time, rights, licensed data and Nepal-side human review.
- No implied bridge accessibility, evacuation directions, water potability, current flood warnings, or affected-person identification.
- Social screenshots, including footage labeled Machhakhola, do not establish geolocation, original capture date or structural damage without provenance verification.
- The 2026 August Rasuwa 75-feature backlog is not reused or rebranded.
- Systemia mission nepal-budhi-gandaki-flood-2026-10-11-002 has a previously degraded coordination record. This source branch is **not** a Systemia dispatch or admission receipt.
- Any funding/work order remains gated by a named legitimate purchaser, Nepal technical partner, accepted SOW and procurement mechanism.

### Source and custody

Frozen October 12 CSV prepared from public-source reviews and attributed reports:
- Radio Nepal, NDRRMA/Police reporting: https://radionepalonline.com/en/2026/10/11/437658.html
- Bagmati Welfare Society Nepal, preliminary situation report: https://www.bwsn.org.np/budhi-gandaki-flood-situation-report-no-1/

Internal supporting files are permission-restricted:
- Evidence brief: https://docs.google.com/document/d/1co7r7lk18CZ7k7_-aoih1vPv6TSa0fSpIeRDAbHfAR8/edit
- Review board: https://docs.google.com/spreadsheets/d/1dAF7thRe4JbJELEOl9fS-z0TpjGKTRqgU-Q2J-YbvB0/edit

**Do not forward internal Drive links as though recipients can view them.** Share exported attachments or explicitly grant limited reviewer access after permissions checks.

### Acceptance

Nine local Node regression tests must pass. This PR is draft-only until an independent code check and Systemia-approved scope. Field-related promotion needs Nepal-side approval, an approved image/asset register and human adjudication.