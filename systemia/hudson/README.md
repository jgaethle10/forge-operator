# HUDSON | The Living Spine

HUDSON is Evercraft's canonical institutional knowledge and evidence spine. This is a **public read-only observatory**, not a replacement database or private operator console. Systemia remains mission authority; KAIDANCE provides continuity; Raven communicates.

## Delivered

- public/hudson/index.html: responsive, standalone animated network with interactive keyboard-accessible topology, evidence timeline, source state, 24-hour filter and pause motion.
- public/hudson/activity.json: same-origin public source JSON. The UI refreshes every 15 seconds; a feed is CURRENT only if the publisher timestamp is under 120 seconds old. Otherwise the page says DELAYED or UNAVAILABLE.
- publish-public-snapshot.mjs: **narrow public Git-history bridge only**. It validates the exact canonical Git remote, verifies local commit objects, classifies public-path changes and emits generic source-change event names with exact commit references. It never publishes commit messages, file contents, emails, private receipts, or customer records.
- publish-public-snapshot.test.mjs: deterministic admission and privacy tests.

## Source contract

Schema: evercraft.hudson.public-activity.v1. Public events carry id, at, system, kind, title, source_url, public:true and source_verified:true. In this adapter, verified means a locally verifiable public Git commit, **not a verified deployment, business outcome, or complete HUDSON event stream**. Every exported event has kind public_git_source_change.

## Owned host

On an Evercraft-owned Linux node, from the canonical clone, run:

    node --test systemia/hudson/publish-public-snapshot.test.mjs
    node systemia/hudson/publish-public-snapshot.mjs --repo /path/to/forge-operator --out /owned/public/root/hudson/activity.json

The owned Fabric runtime now has an explicit, strictly allowlisted /hudson/ and /hudson/activity.json route. Serve the HTML and generated JSON together at /hudson/ on the same owned HTTPS origin; run this command before a release: node --test tests/hudson-owned-fabric-route.test.mjs. The first-party Fabric runtime optionally refreshes its in-memory Git-backed public snapshot once per 60 seconds **only when its own working tree is the verified canonical public checkout**. Otherwise it returns the on-disk snapshot, which will correctly age to DELAYED. For persistent source-free static hosting, run the publisher from a Systemia-approved owned node timer every 30 to 60 seconds. If it is not configured the last snapshot will become delayed. Neither a GitHub commit nor a pull request proves a deployed live public feed.

No Base44, DigitalOcean, TinyFish, or other third-party app runtime is necessary.

## Release checks

1. Confirm on-node publisher execution and canonical Git origin.
2. Check externally served HTTPS /hudson/ and /hudson/activity.json on phone and desktop.
3. Pause publisher and verify CURRENT -> DELAYED -> UNAVAILABLE / disconnected behavior.
4. Confirm no private data or identifying records appear in public payloads.
5. Record Systemia public launch receipt and external canary.

## Next adapters

Add explicitly approved, permission-filtered public receipts for mission results, research decisions, KAIDANCE continuity, Raven findings and Saban QA. Do not feed raw private HUDSON into public pages. This Git adapter tracks public repository source changes only; it does not represent total HUDSON growth, activity or uptime.

## Viewing mode, proven pulses

- Film view condenses the display into a portrait-friendly, focused stage for screen capture. It is **not** a streaming service and does not stream to TikTok automatically.
- The stage rotates already-published, source-linked Git changes, prominently labeled **SOURCE HISTORY · REPLAY**. On first load none is presented as newly occurring.
- On a subsequent successful fresh feed refresh, only a previously unseen event ID with a source timestamp from the preceding ten minutes gets the **NEW VERIFIED PUBLIC SOURCE** treatment. This indicates newly observed source history, not a newly deployed service, active agent or successful commercial transaction.
- Motion pauses manually and under reduced-motion preference; selecting graph nodes remains independent.
- Run visual syntax and semantic checks with: `node --test systemia/hudson/visual-stage.test.mjs`.

## Public release canary

Run `node --test systemia/hudson/probe-public.test.mjs` then `node systemia/hudson/probe-public.mjs`. The probe reads only the canonical owned public origin, requests the HTML, same-origin JSON, public Fabric health, and one intentionally disallowed path. Every receipt has `verified` and explicit `holds`. No login or secrets are used.

The scheduled GitHub proof workflow is a CI/observation mechanism, **not a third-party production app runtime**. A passing workflow with `verified:false` still means **HOLD**. A prior source commit, queued CI run or live-looking animation is not external deployment proof. The owned-node deployment and authenticated Systemia release receipt remain separate.

## Public release evidence correction (November 19, 2026)

A source-backed external GitHub Actions probe observed the owned HUDSON HTML, Fabric health declaration, private route denial and 69 source events. Its feed was rejected solely because the publisher clock was **854 ms ahead** of the observer. The browser and independent release canary now tolerate up to **10,000 ms** of future publisher timestamp skew, while retaining the unchanged 120-second age ceiling and rejecting excessive future timestamps. Source history evidence does not imply live private HUDSON or model-inference activity.

The public proof workflow now uploads its JSON receipt before enforcing a failing status on any external HOLD. A green CI run therefore requires an externally verified feed (on push/schedule/dispatch), while PR tests run source/route contracts only. Use the newest external receipt to confirm deployment after this fix; merged code alone is not proof.

## Public edge head-of-line protection | release incident

The stricter external public canary on November 20 observed `public_html=true`, but its feed, health, and forbidden-path requests failed during the same verification attempt. It did **not** establish whether the cause was origin connectivity, proxy delivery, or a slow read on the owned node. The previous Fabric implementation called synchronous `git log` inside the public feed HTTP request, which could block the shared event loop for up to 20 seconds. This code path has been replaced with a nonblocking `execFile` metadata reader behind a bounded shared cache: at most one source scan per 60 seconds, no concurrent duplicate scans, and a 1.5-second first-response wait. The previous cached payload retains its original timestamp if refresh fails. The committed static feed remains a read-only fallback and ages to DELAYED; it is never relabeled current.

Release QA includes `node --test systemia/hudson/public-feed-cache.test.mjs`. The external canary reports only sanitized `timeout`, `network_or_dns`, `oversized_response`, or `transport_unknown` failure classes, not private infrastructure strings. External release state remains HOLD until an independent canary returns `verified:true`. No live private knowledge-spine ingestion is inferred from public Git activity.

## HUDSON v2 mobile design principles (November 19)

The first-screen concept is **Nothing gets lost.** This is an interface explanation, not a claim that private ingestion is connected. The former desktop SVG shrank to an unreadable node diagram on iPhone and a large replay card covered its lower half. The new presentation uses an explicit 480 × 585 portrait topology with six individually selectable connections, larger node labels, deterministic decorative stars, and curved connection paths. The source-history card is in the flow **below** the field instead of overlapping it. A contextual stage subtitle reacts to node selection; **Next story** advances through verified public Git-source history, while Film view remains portrait screen capture only. Header and footer keep public-source limitations visible. No private HUDSON or model inference is ever exposed or represented as proven by these visual animations.

Quality gate: run `node --test systemia/hudson/mobile-stage.test.mjs systemia/hudson/visual-stage.test.mjs tests/hudson-owned-fabric-route.test.mjs`. The CI PR run also preserves the **public HTML only** as a seven-day mobile-preview artifact to enable actual responsive Chromium QA without treating an image as proof of runtime deployment. Test 390×844, 375×812, 430×932 mobile and 1440×900 desktop, then independently verify external HTTPS after approval and owned deployment.

## Atmospheric motion, not AI telemetry

HUDSON v2 includes a first-party 2D canvas behind the SVG topology for a low-cost moving aurora, radial light arcs, and drifting decorative particles. The 2D canvas has no remote dependencies, no telemetry writes, no private API, and no access to system activity. Pixel density is capped at 1.5 device pixels, animation is capped around 30 fps, and it suspends when the page becomes hidden or the user pauses/reduces motion. Real public Git-source events are handled **separately** by the verified-event path, provenance links, and labeled replay card. No part of the canvas animation itself is a verified HUDSON ingestion event.

## Exact visual-release admission

Following the mobile v2 merge, the public external canary additionally requires the version marker `hudson-release=v2-mobile-cinematic`, the first-party atmospheric canvas, and the `Next story` control. A healthy **legacy** HUDSON page now fails public v2 verification even if the previous Git-source feed and health endpoints are reachable. This is a deployed-visual-surface proof, not an attestation of the exact running server SHA or private HUDSON memory. The marker is HTML-only and has no operator secrets.

## Owned runtime version diagnosis

The public external canary also captures only the already-public Fabric health `source_release_ref` (validated 40–64-character lowercase hex) and `source_release_ref_bound` flag. A null/unbound value remains UNKNOWN, not a negative proof. This identifies the **running process release marker captured at boot**, making it possible to distinguish an older resident process from an old static HTML artifact. No runtime credentials, instance identity, internal private file paths, or operator data are copied to the public canary receipt. A valid source marker is diagnostic metadata and not an independently signed release attestation.

## Enter the Current: full-screen river Watch (public, read-only)

Public entrypoint: `/hudson/watch/`, launched through the **Enter the Current** link on the existing normal homepage. The first-party Fabric server has an exact allowlist for `/hudson/watch/` and `/hudson/watch/index.html`, a permanent same-origin `/hudson/watch` redirect, and continues serving the unchanged validated `/hudson/activity.json` endpoint. The watch page needs no extra JavaScript/CDN/third-party application runtime.

Design language is explicitly tied to the Hudson River: seven confluence basins and twelve curved channels form a visually continuous knowledge watershed. A luminous multi-legged tracer navigates the currents; light filaments, water swirls and particles are generated with the browser's 2D canvas, not a poster, video or prerecorded loop. Tap any confluence or choose **Explore** to read what it represents; **Next current** advances the scene; **Pause** freezes it. Animation targets approximately 30 fps, reduces resolution on high-DPI phones, supports OS reduced-motion settings, and pauses while the browser is hidden.

**Evidence distinction:** the river and crawler are always architectural illustrations, not simulated Systemia missions. `PUBLIC GIT HISTORY · REPLAY` means a valid public Git commit linked to its exact canonical source. A missing/unverified feed switches to `SCENIC CURRENT · NOT A LIVE MISSION` without passing fake activity counts or inventing agents. The current source contract cannot certify private mission progress, inference, sales or future work; these require new separately approved, privacy-filtered adapters before any such live badge can appear.

Acceptance: `node --test systemia/hudson/river-watch.test.mjs tests/hudson-owned-fabric-route.test.mjs`. Inspect real 375px, 390px, 430px iPhone-size and wide desktop browser captures. The external canary requires the actual `river-current-v1` marker, read-only Watch page, denied private file route, Fabric health and fresh public Git source before public release is declared.

## Short articulated explorer (November 19)

User-reviewed iPhone motion showed the earlier 26-ray whisker fan and twelve elongated trailing legs were too long and straight. The current implementation replaces them with **eight compact articulated legs** with shoulder, knee, foot and alternating gait; a small segmented body, three short curved wake strands and a bounded 15–28 unit size. It is still an artistic visualization, not an agent executing live missions.

The exact public release is `hudson-watch-release=river-current-v2-jointed-explorer`; the GitHub external canary checks this marker and the short-legged renderer's defining signatures and rejects the old ray fan. A green source test does **not** prove the owned node has converged. A 2026-11-20 06:04 UTC external receipt observed the older resident reference `3f9e497738294d1f732866cf88163f94689ae2b3` and a public source age of **14,226,963 ms**, so the edge updater / Git-source freshness needs independent owned-node investigation before declaring the latest public release verified.

## Cinematic motion refinement | November 19, 2026

Founder-supplied iPhone and filmed-laptop recordings show the explorer overexposed into a star on the phone while the river terrain stays nearly stationary during laptop viewing. The Watch renderer now switches only the **explorer** to ordinary alpha composition, cuts central halo brightness, draws its short jointed legs with dark outlines and restrained cyan/violet inner strokes, and makes the segmented body visually distinct from the glowing water around it. Decorative source illustration remains distinct from verified public Git history.

The entire watershed, confluence labels, particles and explorer now share a slow bounded camera drift (about four pixels horizontally on a 390px phone and less than eight pixels vertically), with approximately 1.02× zoom. Pointer hit-testing applies the exact inverse camera transformation so topic selection remains aligned. Pausing freezes the motion and camera together; the 30fps/render-hidden restrictions are unchanged. Regression tests independently validate silhouette composition, bounds and camera inversion. The live source freshness and privacy requirements are unchanged.

## HUDSON Watch v3: The Presence, an unknown form

The visual explorer is intentionally *not* a legged insect, robot, or identifiable creature. User review of the mobile renderer found a literal bug silhouette too immediately recognizable. This revision removes the eight-legged geometry, eyes and segmented head. The Presence is a dark folding shard surrounded by rotating broken contours, asymmetrical probe filaments that extend and retract at different rhythms, and an intermittent echo. Filaments are deliberately not mirrored or permanently present. The impression is a phenomenon passing through the river, which viewers can understand only by watching it change.

The rendering remains fully client-side and deterministic, paused by the existing controls/reduced-motion settings. It uses no mission/private data beyond the already approved public Git replay. `hudson-watch-release=river-current-v3-anomaly` is checked through the external public canary; previous crawler versions must not pass the exact-release gate.

## HUDSON Watch v4: an irregular living pulse

The Presence's choreography now has a gently varying beat interval, typically about four to five seconds, and an occasional weaker second pulse. Each internal contraction changes the folding nucleus, followed by a staged response in irregular probes (up to 480 ms of delay) and a delicate ring spreading into the water. A confluence subtly strengthens the ring; it is **not** an indication of a real mission or new discovery. All effects remain deterministic client-only scenery and obey existing Pause, reduced-motion and background-tab scheduling. We keep the core dark and the silhouette unclassifiable, never a flashing white bug or a mechanical metronome.

Safety: public Git-source history is still the only admissible evidence stream, explicitly labeled as replay. The browser makes no additional HTTP calls for the pulse. New pulse motion must not be described as active AI inference, new Systemia tasks or verified live reasoning. Release canary must see exact `hudson-watch-release=river-current-v4-living-pulse`, code for the pulse/ripple and approved public-source/private-route gates; old v3 HTML fails.

## HUDSON Watch v5: responsive river physics (visual only)

The Presence's pulse now displaces the **actual public canvas river geometry** rather than painting a concentric halo on top. A local bounded pressure/vortex field follows its position through the channels. The field is strongest during an irregular internal beat, fading smoothly between beats and strengthening modestly near confluences. The main twelve channel paths, all seven nested lane traces, hundreds of information particles, and long atmospheric watershed streamlines sample the same displacement. Topology originals are unchanged; the public source-linked route, confluence labels and touch coordinates stay stable.

To avoid repetitive per-lane allocations, v5 prepares **one** warped 91-sample array for each main channel every frame and reuses it for all lane strokes and their light particles. The influence is finite, spatially local (bounded to within 25 screen pixels), and does not disturb water at a distance. It retains the existing ~30fps mobile budget, hidden-tab suspension, Pause and reduced-motion behavior.

**Truth boundary:** Every deformed stream is *illustrative*; it cannot be described as proven ongoing research, a Systemia heartbeat, a mission completion, or a live AI thought. The only externally verified event source remains labeled public Git history replay. The read-only canary requires exact `river-current-v5-responsive-watershed`, the geometry functions and public feed/private-route gates. A legacy v4 pulse overlay must not pass this new release gate.

## HUDSON Watch v6: The Phase Traveler

The earlier Presence was so small and faint on phones that repeated refinements to its feelers, legs, ripples and pulse never solved its visual identity. This iteration replaces the entire traveler with an explicitly larger, non-animal **folded ribbon phenomenon**. Five irregular translucent membranes turn over each other around a dark central opening, using layered cyan, lavender and teal glass gradients. Each membrane has independently phased length, width, bend, opacity and rotation; the shape does not have a head, legs, eyes or a static icon silhouette. It reads as a *traveler*, not another decorative star. The quiet asymmetric breathing pulse remains, visible in the aperture rim and veils. It glides through the same public river routes, with a brief unfolding/scan-like atmospheric caustic at confluences that is never presented as real mission investigation.

The underlying source, provenance and privacy boundaries are unchanged: only allowlisted public Git history can appear as source-linked **replay**. The traveler itself is scenic physics and represents no real AI consciousness, inference or mission execution. The frame-rate, hidden-tab and reduced-motion protections remain enabled. On mobile, the visual center is sized approximately 45 screen pixels in radius before extended ribbons rather than a nearly invisible 20-pixel knot. The remote release gate requires exact `river-current-v6-phase-traveler` and presence of its ribbon/state renderer, rejecting the earlier v5 tiny-anomaly build.


## HUDSON Watch v7: cinematic confluences and source-honest film view (2026-11-20)

- The actual canvas renderer gains four drifting atmospheric depth bands, three short translucent folded wakes that sample the traveler's established river path, and five temporary organic petals at the approached basin. The destination's outgoing/incoming **existing deformed channels** briefly glow with a bounded, reversible arrival envelope; all other confluences remain quiet.
- A reversible \`/hudson/watch/?film=1\` browser capture layout reduces overlays while retaining public source-state, labeled Git-source replay, and the explicit not-live-mission warning. It is **not** a TikTok streamer or the future multi-product master screen.
- Decorative optics never imply live private cognition or progress. Source trust rules, network calls, hidden-tab pause, user Pause, reduced-motion and ~30fps budget remain unchanged. The exact external canary and owned Fabric route gate now require \`river-current-v7-cinematic-confluences\` plus the real renderer function signatures.
- New deterministic tests cover bounded destination-specific junction response and the reversible film route. Run node tests and responsive Chromium/phone visual review, then an independent *owned HTTPS* release canary; merged Git source is not public rollout evidence.


## HUDSON Watch v8: Undertow Cathedral (November 20, 2026)

Founder visual acceptance found that v7's traveler and basin halos still read as a lightly upgraded network diagram. v8 replaces **three core renderers**, rather than layering additional decorative glows: the atmospheric sky, the main river bands and the complete confluence silhouette. Every basin is now a dark suspended optical lens with incomplete moving horizons, angular broken caustics, and a high-contrast aperture. HUDSON's central lens is visually larger. The currents become luminous multidepth braided rivers with moving light seams. The backdrop has three slow color wells and a dark outer vignette.

The traveler itself is replaced by **The Fold**, a fractured, asymmetric five-veil structure around a jagged dark rift. Its changing aperture, detached glass-like wings and motion follow the approved illustrative route. This is not an insect, eye, literal intelligence, real active mission, or model inference. It preserves deterministic pulse, interaction, source replay, privacy and motion controls.

Performance safeguards: no textures/CDNs/assets/network/API changes, old 30fps gate and hidden-tab stop remain, all new shapes use bounded counts (three atmospheric wells, seven lenses, at most eleven facets per lens, five traveler veils). This is a **new visual design**, not a new telemetry adapter.

Browser review was performed locally for 390×844 and 1440×900 film captures from source before PR, with mobile showing a visibly larger crystalline Fold, dark lens confluences and much brighter river channels. Local preview is not owned-host deployment proof. Exact source release gate is \`river-current-v8-undertow-cathedral\`; tests and external Fabric canary reject v7. The browser must separately be verified after the owned Penguin updater, then its honest public Git history freshness must independently pass before advertising a live source feed.


## HUDSON Watch v9: The Archive Ship (November 20, 2026)

Founder direction: replace the abstract phase traveler with a majestic, unmistakable sailing ship as the moving protagonist of HUDSON. The owned Canvas Watch now draws a three-masted sovereign flagship entirely in first-party procedural shapes. The ship has a midnight-blue layered hull and curved gold keel, luminous ivory/teal wind-filled sails with stitched ribs, a triangular staysail, architectural raised quarterdeck, ten illuminated windows, golden rail lattice, royal bowsprit and star figurehead, three masthead lanterns and a bifurcating phosphorescent wake. The silhouette remains legible at a 390px phone width, where the hull spans over two hundred logical pixels.

The ship always sails horizontally in profile with bow facing the horizontal travel direction, with very gentle banking and vertical bob. It does not flip onto its side when a river path turns vertical. Sail curvature and light breathing evolve over time. All seven confluences, twelve channels, v8 aquatic scenery, existing public Git source admission, Pause, 30fps budget, film capture, hidden-tab suspension and reduced-motion protections remain. The ship is a **decorative allegory of knowledge navigation**, not a verified live operator vessel, actual AI inference or mission status. No third-party assets, audio, tracking or credentials.

Exact new public marker: \`river-current-v9-archive-ship\`. The GitHub native unit and owned Fabric route tests and independent read-only public canary require the ship geometry and reject the former v8 Fold. Commit/CI is not deployment proof: Penguin owned-runtime deployment, independent HTTPS exact-version readback, and current source freshness must separately pass before the ship is described as live on Evercraft's public link.


## HUDSON Watch v10: Mistbound Ship, path-true at real page scale (2026-11-20)

Founder rejected the oversized, opaque illustration in v9. v10 completely replaces its renderer with a compact, translucent **ghost ship made of sea mist, aurora, and glittering stardust**. The small dark luminous hull, three paired soft cloud sails, faint cloud-figurehead, drifting vapor pockets and 35 bounded deterministic sparkles are drawn directly in the first-party canvas. The design scales down on a phone so the ship is a discovery *inside* the river, not a foreground poster.

Most importantly, \`shipPathPose(from,to,t)\` obtains both center and smooth tangent from the canonical 91-sample river path. Rendering translates to that **exact point** and rotates to its angle; no \`drawX\` / \`drawY\` screen-edge clamping can detach the ship from the line. Size is capped by both viewport and distance to edges, with path-bounded wake geometry also scaled from the same pose. This preserves route confluences, genuine touch selection, film view, user pause/reduced-motion, hidden-tab suspension, ~30fps target, and public Git-source truth labels. New cosmetics remain scenic and do not claim live missions, AI cognition, private data or verified deployments. The exact v10 release canary rejects v9 until Penguin deploys and external HTTPS/source feed pass.


## HUDSON Watch v11: Spectral Navigator (November 20, 2026)

The tiny luminous mark in v10 is replaced with a legible path-scale **spectral ship**. It retains a small, canonical route-attached footprint and heading, but now has a carved crescent keel, three independent breathing aurora sails with pearlescent seams, sculpted raised stern, glowing prow, bridge windows, 19 drifting bounded cloud pockets and 42 prismatic star sparks. Behind the ship, a 3-thread curved wake with 23 bounded motes follows the past samples of the SAME route. These elements are scenic, not live mission or private system data. No external assets or network calls; pause/reduced motion, hidden-tab stop, and ~30fps budget are unchanged. Exact release marker `river-current-v11-spectral-navigator` is required by public checks; GitHub merger is not owned-server deployment.


### v11 cinematic browser-QA revision
Sharpened the three sail outlines to avoid a petal silhouette, deepened the hull, added fixed shrouds, raised aftcastle and gold railings. Five slow spectral-weather veils plus 38 bounded background starlets now enrich otherwise empty space. Actual 390 × 844 and 1440 × 900 browser captures were reviewed with no page errors before this patch. The new optics remain scenic and intentionally do not claim live mission activity.


### v11 dedicated film scene
Broadcast-oriented `?film=1` mode now removes the large full-width readout panel while retaining a small always-readable public replay/scenery disclosure and a small Exit Film control. It is a local display preference, not a streaming publisher; the normal information-rich interactive view is unchanged and all source-admission policies remain in force.


## HUDSON Watch v12: Skyward Schooner (November 20, 2026)

A scene-geometry correction, not merely another glow treatment: the compact ship and its glittering three-strand wake now sample the **same displaced water geometry rendered in each frame**. Before v12 the artistically deformed channels could visibly deviate from the ship's immutable canonical route. The hull still points along the *rendered* curve, but its mast/sails counter-rotate to remain skyward in camera space, rather than becoming a sideways needle whenever the river bends vertically. Three independently wind-driven sails have clipped, volumetric cloud layers; dynamic rigging meets the actual masthead projections, and the bow throws small prismatic pressure arcs into the water. Browser frame label remains scenic/source replay, never a claim of live inference.

Constraints: canonical path/tap topology unchanged, source gating and privacy intact, no new external network requests or images, user pause/reduced-motion and hidden-tab stop persist. Max loops remain bounded under the preexisting 30fps budget. Exact release marker `river-current-v12-skyward-schooner` must pass native tests and external public HTTPS canary after owned-host deployment.
