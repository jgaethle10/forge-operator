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
