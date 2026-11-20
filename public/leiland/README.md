# Leiland | The Living Mind

Evercraft Sovereign AI's public observatory. Source: `public/leiland/`.

[Owned read-only web host](../../systemia/leiland/OWNED-STATIC-HOST.md) is staged for an Evercraft Yard/Compute release. It is loopback-only, not an independently verified public deployment.

Owned release implementation and operator gates: [Signed KAIDANCE pulse publication](../../systemia/leiland/OWNED-PULSE-RELEASE.md) and [independent external readback](../../scripts/probe-leiland-owned-release.mjs). These are **source-level engineering**, not a live public deployment or live Raven inference feed.

## Purpose

A simple public window into Evercraft's sovereign AI engineering and its evidence. The continuous neural-map animation is **an architectural illustration**, not literal neural activations, private prompts, self-awareness, model training, or proof that an inference backend is running.

Visitors can:
- explore Systemia, Raven Nexus, Saban, Evercraft Compute and Passport;
- follow recent **public GitHub code history** separately from source-reported AI activity;
- read the **existing KAIDANCE public pulse** from `../kaidance/pulse.json` on the same Evercraft-owned origin. The imported `pulse-bridge.mjs` reuses KAIDANCE's existing public-only validator; no private API or inference endpoint is requested. If a real fresh, source-attested cycle is observed, the brain gives one short acknowledgement flare **only when the cycle number actually advances**. A disconnected, stale, or unverified pulse never triggers the flare;
- switch to a broadcast-friendly, vertical, fullscreen-capable layout for screen capture / TikTok Live;
- read dated, public-receipt-backed events if a vetted Systemia publisher supplies a fresh feed.

No login, browser analytics, private endpoint requests, cookies, third-party JavaScript, model chat control, or outbound customer data are involved. A request to GitHub's public REST API retrieves the latest four **public Raven commits**; failure leaves the public activity list intact. GitHub is canonical source, not the site's runtime. The page uses only native browser APIs and the static first-party files. Deploy the files to an Evercraft-owned runtime using Yard.

## Neural Universe visual upgrade

The centerpiece is an immersive, full-width Canvas 2D **architectural illustration** with five connected neighborhoods, synthetic traveling light, gentle depth/parallax, a central Leiland nucleus, and in-stage navigation. It also contains responsive mobile controls and a larger 9:16 broadcast presentation. Select any region in the artwork or the existing architecture strip; both controls operate on the same selected system and show its actual public source link and description.

Implementation: `neural-universe.mjs` exports a deterministic, self-contained synthetic graph with no network calls or user tracking. A desktop can display up to 850 illustrative points; phones and reduced-motion visitors use smaller point budgets. Frames are throttled to 30 FPS desktop and 24 FPS mobile, stopped when offscreen/hidden, and paused for the OS reduced-motion preference. No WebGL, camera, microphone, third-party shaders, analytics, or persistent browser permissions are required.

**Visual truth boundary:** Ordinary sparks, bridges, orbit lines and parallax **do not represent AI thoughts, model inference, actual hardware execution or active Systemia missions**. The only data-coupled effects are a discrete acknowledgement ripple when the existing KAIDANCE public pulse gate confirms a *new*, source-attested cycle, and small gold witnesses when a recent vetted public activity feed contains receipt-linked public events. Neither effect reveals private content or operates the model.

The larger stage, native perspective geometry and hover parallax create depth. Buttons are actual `button` elements with `aria-pressed`, keyboard focus and reduced-motion fallback. No claim is made that this visual upgrade has launched on an independently verified live owned HTTPS origin.

## Honesty gates

1. An empty `feed.json` is intentionally disconnected, even while the illustration animates. KAIDANCE's separate public pulse reader may show a real observed coordination cycle on the same origin, but this is **not Raven inference or proof of any brain activation**.
2. Client labels `publisher_reported` explicitly. A freshness check plus URL is **not independent attestation**. Do not call it independently verified.
3. Live status requires publisher output younger than 10 minutes. Stale/missing reports become unverified automatically.
4. The feed does **not** contain customer names, prompts, model responses, machine identifiers, private path names, IP addresses, session IDs, model weights, secrets, private topology, capacity, security findings, or unrestricted mission titles.
5. The UI never issues inference requests or system control commands; it only fetches same-origin public JSON and public GitHub commit metadata.
6. Public code commits prove code changes, **not** deployed runtime health or trained model quality.

## Publication contract (not yet wired)

A future **Systemia-authorized publisher** should map only reviewed and explicit public observations onto the allowlisted schema at `public/leiland/feed.json`:

```json
{
  "schema": "evercraft.leiland.public-feed.v1",
  "published_at": "2026-11-19T23:00:00Z",
  "status": "publisher_reported",
  "signals": {
    "inference": {
      "state": "observed",
      "observed_at": "2026-11-19T22:59:00Z",
      "receipt_url": "https://github.com/jgaethle10/forge-operator/..."
    },
    "missions": {
      "state": "unverified",
      "observed_at": null,
      "receipt_url": null
    }
  },
  "events": [
    {
      "at": "2026-11-19T22:59:00Z",
      "title": "Approved public milestone",
      "receipt_url": "https://github.com/jgaethle10/forge-operator/..."
    }
  ]
}
```

The timestamps in this example are **illustrative schema examples**, not a claim such an event occurred. The actual committed `feed.json` contains `null` and `not_connected`.

Only allowlist public receipt links on `github.com/jgaethle10/forge-operator/*` or `jgaethle10.github.io/forge-operator/*`. Do not allow arbitrary text fields, unapproved event sources, or raw inference payloads. Apply server-side validation, redaction, rate limiting, approval, and provenance checks **before** writing a published artifact; the browser-side sanitizer is defense-in-depth, not sufficient as the publication gate.

A recommended publisher cadence is the five-minute Systemia cycle, while the browser checks the same-origin feed every 30 seconds. The published report should be immutable per cycle in a privately stored receipt, with its public projection updated atomically through an Evercraft-owned read-only delivery origin. No public write endpoints. Missing/failed upstream observations must fail closed to `not_connected` / `unverified`, never synthetic green.

## Real-browser visual acceptance and portrait share link

Leiland's first-party visual QA script is `scripts/qa-leiland-browser.py`. It starts a **temporary loopback-only static server** and launches a real locally available Chromium. It checks iPhone, desktop, and iPhone reduced-motion cases: nonblank changing canvas pixels, navigation of all five regions using real clicks, no horizontal overflow, missing/unknown pulse and private inference represented as disconnected, no uncaught JS exceptions, portrait live view, exit control, Escape behavior and static reduced-motion frames. The public GitHub metadata request is intentionally blocked in QA to prove graceful disconnected operation.

Run: `python -m pip install playwright==1.58.0 && python scripts/qa-leiland-browser.py`. The dedicated CI workflow archives human-reviewable browser screenshots in the `leiland-neural-universe-browser-frames` artifact. These are browser tests against actual public files, **not** evidence of real node deployment, real iPhone hardware, production HTTPS or authentic KAIDANCE field activity.

On an approved owned origin, `/leiland/?view=live` enters portrait broadcast view directly. `Esc` and the visible exit control return to the normal observatory. This query option affects **display only**: it cannot authorize a publisher, publish events, turn on inference or change the evidence labels.

## Release acceptance

- Run `node --test tests/leiland-public.test.mjs` and `node --check public/leiland/brain.js`, with the dedicated `leiland-public.yml` CI check.
- Run a local static server from the `public/` directory, then open `/leiland/` on desktop and mobile, not `file://`.
- Verify keyboard navigation, reduced-motion accessibility, all five architecture selectors, and broadcast enter/exit.
- Confirm a disconnected feed keeps the source status gray, inference and missions unverified, and the network animation visibly labeled conceptual.
- Disconnect GitHub API: events fail safely without changing model-health readouts.
- Remove `kaidance/pulse.json`: Leiland must report disconnected, not a running pulse. Supply an approved synthetic `evercraft.kaidance.public-pulse.v1` on a private QA origin, then test fresh attested -> stale, non-attested and increment-only flare behavior. Do not deploy the synthetic payload to production.
- Add a staged, source-backed sample on a **private QA instance** and check fresh -> stale transition, escaped event text, forbidden URLs, clock skew, and absence of raw private content.
- Use Yard release receipts, external HTTPS probes, CSP verification, and rollback verification before saying the public production URL is live.

## Ownership boundary

GitHub is canonical engineering history. Systemia owns authority and publication decisions. Raven / local inference remain private. Evercraft Compute and Yard own runtime and deployment. No Base44, outsourced control-plane, or third-party app runtime.
