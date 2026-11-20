# KAIDANCE | Owned public-edge cutover kit

This kit is **staged source only**. It does not activate a runtime, alter DNS, change the existing Caddyfile, open ports, run Systemia missions or publish a private record.

## Goal and trust model

The intended public viewer is served by an already approved **Evercraft-owned HTTPS edge**, not a Base44 page or GitHub Pages as the operating backend.

```
private KAIDANCE resident Collider
  -> authenticated YardOperator.getKaidancePulse
  -> private-safe-pulse-snapshot.mjs (0600 private source)
  -> Leiland owned-pulse-publisher.mjs (path-bound signed approval)
  -> /var/lib/evercraft/leiland/public-projections/kaidance/pulse.json
  -> Leiland read-only owned-observatory-host.mjs on loopback
  -> separately authorized existing Caddy HTTPS edge
  -> KAIDANCE viewer (20-second poll, fail closed)
```

GitHub remains canonical for reviewed source and receipts, not the runtime. The linked public development-events feature accesses **public GitHub metadata only**, with no credentials and no relation to private mission execution.

## Portable bundle

The `public/kaidance/` directory contains all its own CSS, JS, public-only GitHub normalizer and original Evercraft mark. `work-source.mjs` is a reviewed byte-for-byte copy of `public/live/work-source.mjs`; `mark.svg` mirrors `public/headquarters/mark.svg`. The `tests/kaidance-owned-edge.test.mjs` gate fails if canonical assets change without updating the portable copies. This allows deployment as a standalone static subtree on an owned edge without relying on another application path.

**Do not** include README.md, private state, internal routes or any approval file in the published directory.

## Before operator-owned deployment

1. Identify an independently verified owner-controlled HTTPS host and the applicable existing Caddy site block. Do not infer a hostname, DNS control, or route health from source code. Never overwrite the shared Caddyfile.
2. Confirm real KAIDANCE resident deployment ID, private Yard state path, valid field-attestation receipt, and recent consecutive Collider coverage receipts on the actual host.
3. Obtain and record explicit private operator authorization for publication of the allowlisted aggregates and selected public host. The publisher's Ed25519 signature and exact-path authorization contract is in `public/kaidance/README.md` and `systemia/leiland/owned-pulse-publisher.mjs`. Signed approval files must stay **outside** every served root.
4. Stage **only** these reviewed static files on the selected owned host:
   ```text
   /srv/evercraft/public/kaidance/index.html
   /srv/evercraft/public/kaidance/app.mjs
   /srv/evercraft/public/kaidance/style.css
   /srv/evercraft/public/kaidance/pulse-source.mjs
   /srv/evercraft/public/kaidance/work-source.mjs
   /srv/evercraft/public/kaidance/mark.svg
   ```
5. After inspecting the real site configuration and securing a rollback copy, adapt the **staged** `Caddyfile.route.example` into the approved existing site block, preserving existing site handlers and their precedence. Validate the **complete** effective Caddy configuration with `caddy validate` before a controlled reload. A fragment-level CI proof does not prove coexistence with an operator's actual shared Caddyfile.
6. Use the staged private-safe snapshot collector and **separately signed** `systemia/leiland/owned-pulse-publisher.mjs`, with the signed policy bound to the real private input and exact public projection path. The older unsigned publisher CLI is disabled. Verify the read-only Leiland host's existing loopback route independently before importing it into the actual approved Caddy site. The `Caddyfile.route.example` is for **static preview only**, not the canonical signed live projection path. Only enable the 30-second example timer after field authorization and the first valid end-to-end export.
7. From outside the network, run `node systemia/collider/public-readback.mjs --url https://ACTUAL-OWNED-HOST/kaidance/pulse.json`. Then verify the actual /kaidance/ page over HTTPS, real-time cycle transitions across at least two **real** 300-second cycles, field attestation, safe receipt count, mobile layout, portrait lower third, and stale-data denial.
8. Only then put the viewer URL into TikTok Live screen capture. The page is not an RTMP broadcaster. Keep the visible source-state label in the broadcast.

## Explicit no-go cases

- A healthy **GitHub CI run** does not prove a resident field Collider.
- A completed static Pages build does not prove a published or attested live pulse.
- An animated orbital graphic is not a real mission, sale, agent or heartbeat.
- An external page returning 200 does not prove that `pulse.json` is fresh and authentic.
- A browser API key, raw Yard health route, private mission snapshot or remote execution endpoint may never appear in public HTML or JS.

## QA

`node --test tests/kaidance-owned-edge.test.mjs tests/kaidance-public-observatory.test.mjs`

CI additionally validates a temporary Caddy site assembled from the route fragment, without loading it on an actual edge. The dedicated field-release gate remains the real operator, runtime and offsite readback checks.


## V02 portable assets

The cinematic release adds `experience.css` and `visual.mjs` to the owned static file allowlist. Both are public-only and self-contained. Review the whole exact-release asset set before staging the existing hostname. The source-backed first-screen GitHub activity and 9:16 direct view do not need an operating Collider feed; never confuse those visible records with live KAIDANCE cycles.


## Collider V03 owned-edge asset parity

The new dimensional Collider requires two public static files: `collider-engine.mjs` and `collider-v3.css`. They are bundled and exactly allowlisted in the staged Caddy example and read-only Leiland host. No private source, signed approval, public pulse, new listener, or server-side animation was introduced. The existing safety and two-cycle release gates remain unchanged.

## KAIDANCE V04 asset parity

The immersive multi-confluence field adds `current-field.mjs` and `confluence.css` to the existing exact static allowlists. The read-only owned host and the public fallback probe include both. No new private service, server-to-client telemetry bridge, live pulse or unsafe route is added. Continuous energy motion remains illustrative and is not proof of mission execution.
