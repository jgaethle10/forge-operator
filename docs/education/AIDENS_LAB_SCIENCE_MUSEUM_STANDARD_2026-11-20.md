# Aiden's Lab: the Evercraft science museum experience standard

**Established:** November 20, 2026
**Canonical owner:** Evercraft / Systemia; GitHub source is canonical
**Product ambition:** a science center you can explore for hours on a phone or computer, not a home page with two animated diagrams.

## Experience, not brochures
Aiden's Lab is an expanding network of first-party interactive science worlds. The standard is not "did the animation play?" It is "did someone change a variable, notice a surprise, learn why, and choose another experiment because they wanted to?"

Current state: Science discovery home; six-room Infinite Classroom practice preview; three-model Physics Atlas; source-linked Earth globe with eight destinations. This increment adds **nine authored model-checked Physics challenges**, **three three-stop Earth expeditions**, and an **optional local-only museum passport**. This is a first museum floor, NOT a complete multi-hour facility. The former conversational Luma teacher is not restored.

## The exhibit loop
1. **See it:** striking phenomenon that is clearly labeled and works in the first three seconds.
2. **Ask:** focused, grounded scientific question.
3. **Predict:** visitor makes a hypothesis before touching a control.
4. **Change and try:** meaningful parameters, reproducible physical model and honest results.
5. **Observe and explain:** live measurements and cause/effect, with model versus observation clearly distinguished. Feedback teaches.
6. **Connect:** source evidence and an inviting doorway into a related exhibit.

Repeatable free play always remains available. A quiz is a teaching aid, not the whole attraction.

## Proposed interconnected halls
- Physics & Motion: forces, launches, pendulums, waves, optics, electricity and magnetism, with formula and model limits.
- Earth Systems: water cycle, plate tectonics, landscapes, environmental systems and time layers, with dated USGS/NOAA/NASA context.
- The Living Planet: ecosystems, habitats, adaptation and migration with verified taxonomic and observation sources.
- Oceans & Depths: buoyancy, currents, tides, trenches, pressure and plankton, with NOAA data and dated bathymetry.
- Cosmos: orbits, planets, spectroscopy, light and galaxies, grounded in NASA/JPL measurements and models.
- Materials & Maker Lab: structures, stress, heat and circuits with reproducible assumptions and supervised real-world safety.
- Aerospace & Flight: lift, drag and stability as educational models, not certification or real-world flight instructions.
- Classroom & Creativity: reviewed, authored lessons and maker challenges, without unconsented child profiles.

These are architectural targets, not claims that eight halls are already live.

## Visual direction
- Science is the spectacle. Less menu chrome and fewer long text walls; interaction and clear visual feedback reveal the idea.
- Physically honest materials/lighting and accurate geographies where possible; no fabricated imagery labeled as measurement.
- Prefer owned GPU/WebGL for rich worlds with first-party Canvas2D fallback; test performance on real phones and Chromebooks.
- Deterministic equations for basic science; distinguish model, historical observation, live sourced data and open question.
- Minimum 44px touch targets, readable contrast, reduced-motion alternatives, accessible buttons, no scroll traps.
- One obvious first action; progressively reveal deeper tools. No forced account, ads or sales popups.

## Privacy, especially for young visitors
- Never require child name, date of birth, precise location or account to explore.
- Museum passport records only allowlisted exhibit IDs in memory until explicit device-local persistence opt-in.
- Progress key: evercraft.aidens-lab.museum-pass.v1. Visible Clear control in every exhibit; no remote sync.
- Gracefully handle disabled storage. No analytics SDK, fingerprinting, classroom rankings or hidden learner tracking.
- No Base44 runtime/contact; first-party paths only. Medical research does not imply medical treatment approval.

## Release acceptance ladder
1. Verify science model equations, authored questions and limitations with direct tests.
2. Exercise actual controls: unsuccessful and successful submissions, repeated free play, mode switching, optional save and clear.
3. Manually test a phone, a Chromebook and a desktop: rendering, drag, keyboard, accessibility and measured performance.
4. Confirm owned GitHub and Systemia release gates, resident source and authorized Penguin upgrade.
5. Require source-to-public exact SHA parity via independent HTTPS checks and real interaction acceptance.
6. Confirm visitors understand the scientific relationship, not just where to click.

## Next engineering milestones
1. Physics experiment A/B replay: compare hypotheses with measured outcomes.
2. Earth Water Cycle Engine with independent temperature, precipitation and evaporation effects, explicitly an educational model rather than current weather.
3. Source-provenanced terrain and depth layers, richer 3D navigation and graceful low-power fallback.
4. Spatial portals between galleries and creative investigations with genuine learning continuity.
5. More authored, reviewed exhibits and real audience playtests. Do not claim "hours of learning" until there is sufficient content and observed completion depth.

**A beautiful screenshot is not a working exhibit.**
