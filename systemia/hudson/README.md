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

Serve the HTML and generated JSON together at /hudson/ on the same owned HTTPS origin. Run the publisher from a Systemia-approved owned node timer every 30 to 60 seconds. If it is not configured the last snapshot will become delayed. Neither a GitHub commit nor a pull request proves a deployed live public feed.

No Base44, DigitalOcean, TinyFish, or other third-party app runtime is necessary.

## Release checks

1. Confirm on-node publisher execution and canonical Git origin.
2. Check externally served HTTPS /hudson/ and /hudson/activity.json on phone and desktop.
3. Pause publisher and verify CURRENT -> DELAYED -> UNAVAILABLE / disconnected behavior.
4. Confirm no private data or identifying records appear in public payloads.
5. Record Systemia public launch receipt and external canary.

## Next adapters

Add explicitly approved, permission-filtered public receipts for mission results, research decisions, KAIDANCE continuity, Raven findings and Saban QA. Do not feed raw private HUDSON into public pages. This Git adapter tracks public repository source changes only; it does not represent total HUDSON growth, activity or uptime.
