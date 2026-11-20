# KAIDANCE | Public Observatory (Build 01)

KAIDANCE is Evercraft's existing Collider operating cadence, **not a new scheduler or a simulated workforce**. This public home makes that rhythm observable. The desired source of truth is Systemia → the resident KAIDANCE Collider → existing private `evercraft.kaidance.pulse.v1` → explicitly authorized read-only public projection → owned public edge → browser.

## What is implemented

- `public/kaidance/index.html`: distinctive animated Systemia/KAIDANCE observatory with one-button 9:16 portrait view and optional browser fullscreen for screen capture.
- `app.mjs`: reads `./pulse.json` from **the same owned public origin** every 20 seconds, strictly validates freshness and attestation, and only triggers the collider flash after a **new verified cycle number** arrives. An orbiting graphic by itself is **artwork**, not evidence of a running cycle.
- Public development records are independently read from the existing `public/live/work-source.mjs` GitHub-only normalizer. Records carry exact links and timestamps. This is **not** private mission telemetry, a sales record, or proof of a Systemia job.
- `systemia/collider/public-projection.mjs`: small allowlist projection from the existing safe pulse. It omits deployment receipts, node IDs, continuity, holds, mission sources, private evidence and internal routes. Source readiness is not public release authorization.
- `tests/kaidance-public-observatory.test.mjs`: privacy, freshness, attestation, provenance and no-demo-data checks.

## Release gate, in order

1. Run `node --test tests/kaidance-public-observatory.test.mjs` and the existing KAIDANCE proofs: `node systemia/collider/proof.mjs` and `node systemia/collider/pulse-proof.mjs`. These are **source-level** tests, not proof of field deployment.
2. On a trusted Evercraft-owned runtime, independently verify the resident service, real cycle receipt, and identity. Verify a real instance of `evercraft.kaidance.pulse.v1` using an authenticated **private** channel. Do **not** scrape private `runtime.mjs` responses into public HTML.
3. Obtain explicit, signed, path-bound Ed25519 authorization for public pulse publication. The prior CLI flag `--approval-ref approved:...` is **not** sufficient and the old unsigned publisher entrypoints are disabled. Read the canonical gate in `systemia/leiland/owned-pulse-publisher.mjs` and the [owned host runbook](../../systemia/leiland/OWNED-STATIC-HOST.md). The signed approval, signature and verification key stay outside the public webroot.
4. Publish the reviewed `public/kaidance/` static files on the **owned Evercraft edge** and let the separately authorized publisher atomically replace `kaidance/pulse.json` on the same origin. Output must be immutable per write, permission-limited, rate-limited at public ingress, and explicitly revocable. Do not expose private paths as static aliases, use a client-side API key, or attach access to job execution.
5. Check an **external**, unauthenticated public readback, the actual pulse freshness and another completed cycle. Confirm 20-second polling, stale-state handling, mobile controls, and that live flashes happen **only on new verified cycles**. Only then advertise this as a live Systemia pulse.

Until step 4, the page must show **HEARTBEAT NOT CONNECTED**. It intentionally has no `pulse.json` committed to GitHub. The visual remains a branded motion environment with accurate source labels.

## TikTok LIVE

In a screen-sharing broadcast setup allowed by the user's TikTok account and device, open the approved public URL, choose `9:16 LIVE VIEW`, and screen-capture the page with a phone/desktop live production workflow. This app is a **viewer**, not a TikTok broadcaster, RTMP gateway, OBS plugin, or streaming service. Keep source labels visible. When the pulse is unconnected/stale, describe it as the *KAIDANCE observatory preview with recorded public development receipts*, not live Collider execution. Never expose the private operator dashboard during a stream.

## Boundary and ownership

GitHub is canonical source and review. Systemia routes orchestration. Owned Yard/Compute/edge perform the running work and publication. There is no Base44 dependency or third-party runtime required by the page. Public GitHub API calls only retrieve already-public metadata, and the UI does not require visitor login. Do not imply all Evercraft systems cycle every five minutes merely because KAIDANCE's target is 300 seconds.

## Next

Wire the operator-approved projection to the actual resident KAIDANCE safe pulse on owned Compute, issue signed/revocable publication receipts, add offsite independent readback and a durable freshness monitor. Then expand the projection only through reviewed, allowlisted public event types with evidence links.


## Canonical signed live publication (security revision)

**Static public preview:** GitHub Pages contains approved HTML and public development receipts. It never carries `kaidance/pulse.json` or private resident data.

**Production publication authority:** the only authorized path for an owned live pulse is:

```
YardOperator.getKaidancePulse(realDeploymentId)
  -> systemia/collider/private-safe-pulse-snapshot.mjs (private 0600 snapshot)
  -> systemia/leiland/owned-pulse-publisher.mjs (exact path-bound Ed25519 approval)
  -> separate owner-controlled projection root /kaidance/pulse.json
  -> systemia/leiland/owned-observatory-host.mjs (read-only, loopback)
  -> independently authorized Evercraft public TLS edge
  -> external two-cycle readback -> broadcast acceptance
```

A signed approval is a separate protected file, signed by the authorized operator. It must bind **exact input and output paths**, carry the correct `kaidance.public-pulse.publish` scope, and be unexpired (maximum seven days under the current source contract). The signer key is never generated or shipped in the public source tree.

The legacy writer `systemia/collider/public-publisher.mjs` refuses to publish and remains a private readiness-verifier library. `systemia/collider/public-projection.mjs` is now a library-only projection with **no command-line output path**. Neither accepts a weak text approval as public publication authority.

The staged unit/timer under `systemia/collider/deploy/` illustrates a single one-shot transaction: read the actual private Yard safe pulse into a protected owner-only directory, then run the signed publisher into a separate restricted public-projection directory. It is **not installed or enabled** by the repository. A private source stage or local publisher receipt does not prove external TLS reachability, field attestation, or genuine successive Collider cycles. Stop on any missing source, signature, stale observation, cycle rollback, or public readback failure.

External release check after owned TLS deployment:

```sh
node systemia/collider/public-readback.mjs \
  --url https://ACTUAL-OWNED-PUBLIC-ORIGIN/kaidance/pulse.json
```

The streaming 9:16 view separately rotates actual timestamped public GitHub development receipts. The UI must always distinguish source-backed engineering events from new KAIDANCE cycle receipts.


## KAIDANCE V02: cinematic first-screen and TikTok broadcast

The source-accurate observatory has a redesigned first screen. A motion-rich network canvas is **ambient artwork only** and never maps particles to agents, real work, or mission counts. The actual verified heartbeat flare still requires a freshly incremented, attested cycle from `pulse.json`. The static GitHub Pages fallback deliberately has no pulse export and reads only public GitHub development records.

The hero stage now displays the latest eligible public GitHub event with its exact source URL and timestamp, rather than burying that information below a long telemetry panel. Visitors can open `/kaidance/?view=live` to go directly into a phone-sized broadcast composition or use the always-visible **9:16 LIVE VIEW** button. All labels retain explicit development-record vs live-Collider distinctions. The full-screen button remains optional and is not relied upon for iPhone Safari.

New first-party assets are `experience.css` and `visual.mjs`. They use a capped animation framerate, reduced-motion compliance and no outside animation SDK, WebSocket, telemetry or browser storage. Both are allowed on the existing owned Caddy and Leiland static host routes. `scripts/probe-kaidance-fallback.mjs` includes them in the external HTTPS asset readback.

The V02 browser QA runs iPhone-sized and desktop Chrome tests, checks for horizontal overflow and JS errors, verifies one-tap and URL-parameter broadcast viewing and retains screenshot evidence. A green QA report proves the client-side **viewer** behavior, not private field activation.


## KAIDANCE Collider V03: the accelerator theater

A dedicated `collider-engine.mjs` and `collider-v3.css` now replace the little rotating K emblem **visually** with a perspective-projected toroidal accelerator. The magnet's ribbed coil architecture, depth-sorted rails, counter-rotating cyan/amber particle bunches, interaction chamber, volumetric field lighting and ambient spray are **decorative artwork**, not sensor data, science claims, execution logs, agents, earned revenue, or cycle events. All ambient motion is deterministic browser animation and requires **no backend, storage, external GPU service, audio, vendor scripts, or extra user consent**.

A `MutationObserver` only triggers an exceptional, expanding shockwave when the existing source-verifying `app.mjs` marks `#collider.beat` after a new **verified** cycle. The visual engine does not create, increment or schedule cycles. On the public Pages fallback, no pulse JSON is published and no verified event can be generated. Source labels continue to distinguish the public GitHub record from real KAIDANCE telemetry.

Performance: capped 15 fps on small screens / 20 fps on desktop (with adaptive frame pacing), capped device pixel ratio, reduced particle budget on mobile, pause when out of view or tab hidden, and a static low-activity form under `prefers-reduced-motion`. The old DOM emblem is retained invisibly as a source-gated beat signal and fallback structure. All drawing stays underneath the headline and original controls.

Production parity: `collider-engine.mjs` and `collider-v3.css` are in the Pages fallback probe, Caddy exact asset allowlist, and Leiland owned-observatory-host static allowlist. The browser QA checks nonblank pixel output, real frame-to-frame motion, iPhone/desktop layout, one-tap 9:16, and no JavaScript exceptions. This **does not** authorize publishing a live Collider feed.

## V04 The Confluence Field (from HUDSON comparison)

The new entry view is **a full-viewport interactive living network**, not a large K or standalone reactor. It takes its composition lessons from Evercraft's own HUDSON River Watch: winding channels between named confluences, a distinctive traveling explorer, colored energy streams, and a low-profile source-backed narrative ribbon.

It adds `current-field.mjs` and `confluence.css` as first-party, standalone assets. The accessible Explore drawer navigates conceptual nodes for Systemia, Hudson, Discovery, Kaidance, Raven Nexus, Work Saban and Evidence. Pause halts ambient motion. Reactor View preserves V03 as a second mode. 9:16 Live View is still directly linkable with `?view=live`.

**Source boundaries:** currents and the explorer are explicitly artistic, not live missions. A verified public GitHub record can change the depicted *conceptual* focus and appears with its source receipt in the normal activity overlay. It does not promote anything into Collider execution. Only an independently verified increment in `#collider.beat` may cause a special collision flash. The static Pages preview has no published pulse, and the live signed publisher remains a separate field approval.

QA checks interactive routes, pixel production, animation, both viewing modes, iPhone safe area, reduced-motion behavior, no browser exceptions, and owned static route parity.
