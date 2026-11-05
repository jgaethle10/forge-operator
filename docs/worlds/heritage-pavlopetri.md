# Below the Line · Pavlopetri learning scene v0.1
Research case: SUBMERGED-HERITAGE-001. Parent atlas: \`public/submerged-heritage/\`.

## What this release contains
- Independently authored procedural WebGL2 underwater streetscape, reachable from the case atlas after routing/deployment.
- Desktop WASD/arrow keyboard motion, drag-to-look and E to inspect.
- Mobile virtual movement joystick and right-side touch look.
- Five source-linked evidence waypoints and a research/source panel.
- Two distinguishable modes: **foundations-only** and **imagined upper walls**.
- Deterministic scene schema/validator and CPU-only tests; no third-party JavaScript or imagery.

**IMPORTANT:** Pavlopetri is a real excavated site. This scene is **not** a copy of its surveyed site plan or a photogrammetric model and is **not accurately georeferenced**. Original buildings are laid out solely for illustration and interactive learning. 'Documented type' means a class of material archaeologists actually mapped (streets, masonry, buildings, courtyards), **not** that the displayed geometry, scale or location is historically accurate. The visible upper walls are a separate speculative visual overlay, not observed ancient walls.

References
- British School at Athens Pavlopetri 2010 survey: https://digital.bsa.ac.uk/fieldwork.php?project=2127
- École française d'Athènes 2010 field account: https://chronique.efa.gr/?id=1893&r=report
- Nottingham research impact report: https://impact.ref.ac.uk/casestudies/CaseStudy.aspx?Id=28862
- UNESCO principles: https://www.unesco.org/en/underwater-heritage/principles-2001

## Run
From repo root:
\`\`\`sh
python3 -m http.server 8766 -d public
# http://localhost:8766/worlds/heritage/
node --test tests/worlds-heritage.test.mjs
\`\`\`
No hosted generation, commercial API or private credentials.

## Engineering constraints and next integration
- Standalone original geometry renderer uses the same **WebGL2/browser-local projection pattern** as \`public/worlds/app.mjs\`, but does NOT claim to use the production authoritative Systemia World Engine.
- All player coordinates are an invented local coordinate frame and cannot be converted to actual seabed coordinates.
- No ROV/sensor data, precise map, personal location, public diving plan, site access or excavation instructions.
- No agent autonomy or production Systemia mission implied by the repository files.
- Evidence source URLs should be rechecked before public release. Scholarly/site rights for any future real mesh must be separately approved.
- Additional gates: run browser/phone QA on the published route, validate WebGL2 fallback and touch gestures, and verify HTTPS service from a fresh client. CI test file is not proof of running or passing unless the execution receipt is inspected.
- Prior to a "digital twin" label: survey licensing, raw provenance, georeferencing, survey uncertainty and archaeological review are mandatory.

## Owned-route release contract (November 5, 2026)
The owned Worlds vault now serves trailing-slash exhibit pages from a directory's `index.html` (rather than returning 404). The dedicated /worlds/ path lease offers these intentionally supported read-only paths:

- `/worlds/heritage/`: WebGL2 page
- `/worlds/heritage/app.mjs`, `/worlds/heritage/scene.mjs`: browser modules
- `/worlds/heritage/atlas/`: exact, read-only alias of the canonical `public/submerged-heritage/index.html`
- `/worlds/heritage/atlas/sites.geojson`: exact, read-only alias of the canonical atlas dataset

The atlas aliases are finite allowlisted paths; the private Worlds vault does not serve `/submerged-heritage/` or arbitrarily expose all of `public/`. Page back-links resolve locally in the same origin. No duplicate research dataset is maintained.

Run `node --test tests/worlds-vault-runtime.test.mjs tests/worlds-heritage-public.test.mjs` to verify the local contract. After the operator sets an authorized, dedicated owned HTTPS origin and leases the route, run `node scripts/probe-worlds-public.mjs https://YOUR-OWNED-WORLDS-HOST` followed by `node scripts/probe-worlds-heritage-public.mjs https://YOUR-OWNED-WORLDS-HOST`. The manual GitHub Actions workflow `evercraft-worlds-public-gate.yml` carries both checks and retains separate receipts. A green local browser suite is not evidence of the public origin; source merge never creates a hostname, TLS certificate, runtime lease or production Systemia mission.
