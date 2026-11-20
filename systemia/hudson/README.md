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
