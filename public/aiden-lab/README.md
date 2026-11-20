# Aiden's Lab | Science and Deep Learning campus

Aiden's Lab is Evercraft's **public science exploration front door**. It is not an alternate Systemia authority, clinical-research validation system, or separate source of truth.

## Watershed Laboratory, first original landscape simulation (November 20, 2026)

**Interactive terrain sculpting v2:** Visitors can select one of five zones
and change its ridge altitude in 100 m keyboard-friendly steps, or turn on
sculpt mode to drag the ridge with touch/mouse. Elevations remain ordered
from summit to valley with a 100 m minimum between neighbors; a Restore
Ridges action returns to source-defined elevations. Each change updates
the **same** model cell elevation, illustrated mountain height and zone
air temperature (a fixed, intentionally simplified 6.5°C/km lapse rate).
The change can alter simulated rain versus snow, thaw and the river
outflow. Seven-day Trial A captures the original five elevations; Trial B
may use a newly sculpted mountain, but both begin with the same initial
water storage profile, preserving a fair modeled comparison. A reset
restores water stores, not the sculpted mountain. Tests verify mass
conservation and altered snow phase/outflow after sculpting; no data
is transmitted. This is not a terrain survey, meteorological lapse
measurement, or routed hydrodynamic model.

The next connected science-center hall is an actual **playable five-zone
mountain-to-valley watershed**, not another static Earth article. It lives at
`public/aiden-lab/watershed/index.html` and has its own tightly allowlisted
owned Fabric route `/aiden-lab/watershed/`. The Earth Atlas has a visible
door into this exhibit, and the campus home lists it with an
`interactive_preview` status, not as recovered legacy code.

What visitors can do:

- Reshape the illustrated slope and forest cover, set daily precipitation and
  valley air temperature, and inspect five named geographic zones.
- Advance a day or play a time sequence showing illustrative clouds,
  mountains, snowpack, river and groundwater.
- Observe modeled river outflow, snow-water equivalent, soil and groundwater
  stores, a 24-day hydrograph, and daily water mass-balance residual.
- Load four reproducible experiments: mountain storm, spring thaw,
  drought, forest recovery. Reset to known initial water stores.
- Capture seven-day Trial A, alter at least one physical parameter and run
  seven-day Trial B from exactly the **same** baseline store state. Compare
  the sum of river outflow and investigate the difference.

**Model contract:** Each of five equal-area elevation bands has three stores:
snow, soil water, groundwater. Inputs are uniform daily precipitation;
outputs are fast runoff, slow aquifer release and temperature-dependent
soil evaporation/transpiration. Snow falls below freezing, melts above
freezing according to an illustrative degree-day coefficient, and feeds
soil or runoff. Infiltration has bounded daily rate and soil capacity;
forest cover changes those classroom assumptions. Percolation transfers
water to groundwater before slow release. Units are mm water equivalent;
1 mm means 1 liter per square meter. A residual verifies that
precipitation minus evaporation and river outflow equals changes in
those three stores. Every model coefficient is a **teaching assumption**,
not a calibrated basin characteristic. The cartoon landscape is
illustrative, not satellite, terrain survey, official flood guidance,
real watershed operations or a weather forecast.

**Technical boundaries:** pure device-side computations and canvas drawing;
no third-party runtime, remote API, login, child profiles, analytics,
session storage or network requests. Evidence links explain background
hydrologic principles (USGS and NOAA), but do not independently validate
the values predicted by this model.

**Release proof:** Adding this room increases the fail-closed resident and
independent public checks from ten to **eleven** source-identical assets.
The new HTTP route must have the
`x-evercraft-learning-world: watershed-water-balance-v1` marker and strict
CSP hashes for the reviewed inline script/styles. Read-only diagnosis
must report route 404/stale markers. Merge != deployment != confirmed
phone usability. Manual device acceptance must test five-zone selection,
presets, time advancement, play/pause, seven-day comparison, reduced
motion and scroll behavior.

**Scientific QA:** `tests/aiden-lab-watershed.test.mjs` exercises 21
40-day scenarios (840 idealized model days), proves per-day and
whole-run mass conservation, nonnegative stores, snowmelt and snowfall,
forest-vs-bare comparison and deterministic seven-day replay, alongside
source privacy and UX contracts.

## The science museum floor (November 20, 2026)

Aiden's Lab should feel like visiting a science center on a phone or laptop,
where visitors can play, make predictions, test physical models, examine
evidence, and move between connected exhibits. This is the first practical
exhibit-program layer, not a claim that the full immersive facility exists.

- **Physics investigation bench:** run a controlled two-trial comparison on
  the current launch, pendulum or wave model: capture Trial A; change a
  parameter; predict increase/decrease/similar; record Trial B; view numerical
  differences, ratio, and bars tied to the actual deterministic formula.
  Measurements are local in-tab and are not persisted or remotely submitted.
- **Physics Atlas:** nine authored museum challenges across three actual
  controllable science models. Challenges verify current model variables and
  derived measurements; wrong attempts get a clue rather than a fake reward.
- **Earth & World Atlas:** three three-stop expeditions: Water Planet,
  Restless Earth, Life at Extremes. Each places the learner on the published
  geographic location, provides context and the external source link, then
  asks an authored explanation question before progressing.
- **Cross-gallery doors** now link Physics to Earth and Earth to Physics.
- **Optional museum passport:** session-only unless visitor explicitly chooses
  device-local persistence. Stores allowlisted completed exhibit identifiers
  only, without names or remote submissions; both exhibits have Clear
  controls and storage-unavailable fallback.
- No child accounts, profiles, AI tutor, live science feeds, or claims of
  original Deep Learning source parity were added.
- The comprehensive architecture, visual standards, youth privacy boundaries
  and next interactive milestones are documented at
  [science museum exhibit standard](../../docs/education/AIDENS_LAB_SCIENCE_MUSEUM_STANDARD_2026-11-20.md).

This scope still needs real device interaction and learning-depth review, along
with the existing resident and public SHA source verification, before it is
promoted as a working public museum experience.

## The learning campus decision (November 19, 2026)

Aiden's Lab is Evercraft's **shared public home for science, Deep Learning
atlases, learning worlds, and Infinite Classroom**, not an isolated static
science directory. The home must make sense in three seconds: choose a learning
world, or investigate a science topic.

- `public/aiden-lab/learning-worlds.mjs` is the public-safe, hand-reviewed
  lineage registry for Infinite Classroom, Physics Atlas, Earth & World Atlas,
  Cosmos Atlas, Global Energy Atlas, Wildlife Atlas, Sentinel Intelligence,
  Hidden World Atlas, and the Deep Learning corridor architecture.
- `/aiden-lab/classroom/` is a **first-party, read-only delivery route** for
  the *existing* six-room/18-mission Infinite Classroom **practice preview**
  (`public/apps/infinite-classroom/play/index.html`). Local stars, authored
  clues and static homework prompts are not a conversational tutor.
- The original Infinite Classroom with curiosity-led conversation, Luma
  dialogue, per-room context and XP has **not** been restored to parity.
  Historical data, profiles, and nonconsented child records must never be
  copied or surfaced publicly.
- Other named atlases are represented with honest source/product/historical
  state. Their links go to verified canonical GitHub source records, **not**
  to unverified public play URLs. An atlas product record is not a working
  world.
- Sentinel Intelligence is represented as a **public-history and science
  learning lineage**, separate from current security/monitoring Sentinels.
  No private military datasets, live operational targets, restricted telemetry,
  public command/control or fabricated maps.
- One learning method carries between worlds: **predict → try → observe →
  explain → connect**. Each deeper lesson must preserve source date, confidence,
  uncertainty, learner age suitability, review and rights.
- This campus is a discovery and learning presentation layer. GitHub remains
  canonical, Systemia owns governance, Yard/Compute owns runtime, and no
  third-party hosted builder or legacy SDK is used.
- Neither a source merge nor a passing simulation establishes a deployed
  public site. The exact public parity probe now covers **seven** source assets,
  including the Classroom preview and its dedicated route marker.

The first-party Classroom practice preview is deliberately playable without
a sign-in, network model, or learner analytics. It is not allowed to acquire
new inference authority, save children’s identifiable answers, or claim
personalized AI tutoring merely by appearing in Aiden's Lab.

## Visual fidelity v2: honest cartography and legible physical motion

This graphics pass replaces the `world/index.html` invented continent
silhouette with **Natural Earth 1:110m land geometry**, drawn completely
on the client from a first-party embedded, rounded coordinate subset. The
canonical upstream file is
[ne_110m_land.geojson](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_land.geojson),
published as **public-domain** by
[Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/).
The source dataset comprises 127 outer polygon rings, with quantized
two-decimal-degree coordinates embedded in the reviewed HTML. Coastlines are
generalized at globe scale and **must not** be represented as accurate navigation,
current ice cover, borders, imagery, ocean depth or emergency hazards.

The JavaScript builds a device-local equirectangular land mask once and
shades an orthographic Earth into a capped 420 px CPU raster on view change;
stars, sunlight and polar highlights are *decorative*. No network tiles,
third-party map runtime, browser geopositioning or external requests are used.
Pointer rotations are coalesced into animation frames to avoid flood rendering
on phones. The shape and eight destination markers are georeferenced, not
live telemetry. The previous source-bound learning descriptions remain intact.

The `physics/index.html` scenes now add separate **model-derived visual
layers**, not changed equations: predicted full ballistic arc versus traveled
arc, height/flight/range guides, past pendulum positions and equilibrium,
and traveling-wave phase ghosts. All remain idealized, educational
approximations, and a screenshot is not a field measurement.

Quality checks for this increment: parse the embedded coastline rings and
verify coordinate bounds and sufficient detail, parse both inline scripts,
ensure source-only imports and no new network APIs, pass exact Fabric route
and resident/public SHA256 guards. Conduct manual phone acceptance for
touch responsiveness, globe horizon/antimeridian, marker visibility,
screen-reader alternative controls, reduced motion, and frame rate.

This is a **first visual-fidelity upgrade**, not final world-class art
direction. Real elevation/bathymetry, verified satellite layers, authored
science explanations, better terrain material/shaders, and cross-atlas
navigation still require explicit rights review and separate source-grounded
implementation.

## Physics and Earth/World interactive explorers (November 19, 2026)

Two **new, original, owned-browser previews** now exist beneath the Aiden
campus. These are built as independent experiences, not merely cards, source
readers, or fictional restorations of unverified legacy app code.

- `/aiden-lab/physics/` serves exactly
  `public/aiden-lab/physics/index.html`. Three playable model stations:
  ideal projectile (angle, speed, gravity), pendulum (length, angle, gravity),
  and traveling wave (frequency, speed, amplitude). The controls recompute
  physical relationships, display expected units and update animated canvas
  scenes. Mathematical models are teaching approximations, not flight
  engineering certification or field measurements.
- `/aiden-lab/world/` serves exactly
  `public/aiden-lab/world/index.html`. An offline-first drag-to-rotate
  orthographic globe with keyboard-accessible destination buttons and clickable
  coordinate markers. Eight geography/earth-system expeditions include a
  question, evidence explanation, uncertainty and external educational source.
  Coastlines are **schematic**, not cartographic data. Site coordinates are
  educational point markers, not a navigation map or measurements.
- The two preview doors are `interactive_preview` in
  `learning-worlds.mjs`. The historical Physics/Earth Atlas names remain
  linked to their canonical original records. No claim is made that the old
  apps, user progress, assets or feature parity have been recovered.
- Only two additional exact HTML assets are authorized on the existing owned
  Fabric route; no arbitrary static directories, external JavaScript imports,
  browser APIs for personal location, or third-party rendering engine.
- Inline CSS and JS on these two reviewed standalone pages receive source-byte
  SHA-256 Content Security Policy hashes, not a permissive inline policy.
  The owned Fabric runtime emits the separate
  `physics-model-v1` and `earth-globe-v1` identity headers.
- Both are included in the independent source-to-owned-HTTPS parity check and
  the resident updater's source-to-loopback gate. A source merge or green CI
  is **not** a physical-host release receipt or browser acceptance.
- Before advertising broadly, verify touchscreen/keyboard behavior, all
  adjustable controls and model results on an actual phone, independent HTTPS,
  resource limits, and the correct browser CSP execution.

The original conversational Infinite Classroom, a complete scientific Physics
Atlas, an authoritative cartographic World Atlas and the full legacy education
estate remain separate restoration and QA workstreams.

## Living universe visual redesign (November 19, 2026)

The founding experience is **a navigable universe, not a long list of product
descriptions**. Feedback from a real iPhone screen recording showed a polished
but repetitive stack of narrow status cards and no reason to explore visually.

The redesigned Aiden's Lab includes:

- A larger first-screen introduction and a first-party ambient universe
  animation in `public/aiden-lab/universe.mjs`, with luminous paths and
  decorative moving stars. **This is artwork, not live Systemia activity**.
- Six accessible, touchable orbital world buttons that select an actual
  matching world in the existing evidence-bound learning registry.
- Nine smaller, uniquely colored world portal buttons in a compact grid.
  Selecting one reveals a single large spotlight: what it does, its exact
  current readiness, preserved evidence and a working appropriate action.
- One prominent Infinite Classroom **practice** entry, not a claim of original
  conversational tutoring parity.
- A shorter initial science catalog with a real "Explore all" action and
  existing search, category filtering, saved shelf and source dialogs.
- Mobile-first size, native button focus, reduced-motion support, canvas
  visibility pausing, a frame budget and a capped display pixel ratio.
- No new CDN, framework, tracker, network call, external service, child
  profile or fabricated product status.

The private owned Fabric server serves the reviewed `universe.mjs` through
its existing restrictive public allowlist. The exact source-to-resident and
source-to-public probes must verify **eight** source files (including the
standalone Classroom practice page) before public release is accepted.
A source merge is not a deployment receipt.

## What works in this proposed release

- Accessible, responsive static public interface in public/aiden-lab/
- 14 curated topic rooms spanning health/medicine, life sciences, Earth/environment, oceans/archaeology, space/flight, physics/materials, and computing/robotics
- Keyword search, category filters, random topic exploration, source-detail dialog
- A local-only saved reading shelf (browser storage, with an in-tab fallback if storage is blocked)
- Dedicated explanation of the existing biomedical evidence pipeline and scientific claims boundaries
- Explicit status distinctions for code in main, public viewer code in main, and experimental branches
- No login, analytics SDK, new backend, external publishing, patient intake, payments, or remote execution

## Source and authority contract

- **GitHub** is canonical for source code and research links.
- **Systemia** coordinates programs and release/admission gates. This static page does not bypass them.
- **Evercraft-owned Fabric/Yard** must operate the public serving route when promoted. No Base44, hosted app builder, external runtime SDK or third-party data store.
- A "public explorer in repo" label means the source path exists, not that a public origin was probed or that the service is live.
- A named research branch is not equivalent to merged code, completed experiments, or a scientific result.
- The atlas is curated, not an exhaustive automatic inventory. Add topics only after checking links and branch status.
- A visible CSS animation does **not** represent real sensor measurements, active workers, or a streaming heartbeat.

## Medical publication boundary

The linked PubMed discovery, clinical registration, evidence review and outcome-text comparison modules are research assistance. Never present their output as confirmed safety, treatment efficacy, approval, new medical discovery, or personal clinical guidance.

Before adding a clinical conclusion, independently inspect full source methods and outcomes, check retractions and trial registration links, complete qualified medical review and obtain required Systemia editorial approval. No medical claims or auto-generated clinical stories are enabled in this release.

## Local QA

From repository root, with Node 18 or newer:

  node --test tests/aiden-lab-public.test.mjs tests/aiden-lab-living-universe.test.mjs
  node --test tests/aiden-lab-fabric-route.test.mjs tests/aiden-lab-owned-public.test.mjs tests/aiden-lab-resident-release.test.mjs

For manual preview, serve the repository's public directory with an existing local static file server and open /aiden-lab/. ES modules do not necessarily load from a file:// URL. Check mobile, search, reading shelf, keyboard navigation, dialog Escape, reduced-motion preference and every evidence link.

## Launch gates (not yet proven)

1. Review topic text and each linked repository branch for any newly stale source; approve science/medical copy.
2. Run tests and production build. Confirm no top-level routing regression.
3. Bind /aiden-lab/ to the **existing owned public edge** through the authorized Systemia release path, preserving the main site and TLS configuration. Do not invent or claim an owned custom URL.
4. From an independent network, verify HTTP 200, TLS, page assets, search, links, mobile layout and crawl metadata. Record source commit, deploy receipt and verified public origin.
5. Only then link the site from Evercraft Research, Systemia, Journal and other public properties. Never label the page "live" based solely on a GitHub PR or a local preview.

## Next increments

- Source-of-truth public program export from Systemia that contains no private work, credentials, family details or controlled information
- Distinct publication lane for independently reviewed, citation-ready science explainers
- Optional dated "new in the lab" feed tied to source receipts, not fake counters
- Discovery and explorer quality checks, real audience analytics only under a clear privacy policy

This first release does not promise any five-minute updates or a functioning medical journal. Those require a real authorized data and editorial bridge.
