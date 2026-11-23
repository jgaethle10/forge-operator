# American Infrastructure Watch | Penguin owned-edge activation receipt

**Observed on:** 2026-11-20 (operator-provided Penguin terminal output)  
**State:** `LOCAL_HTTPS_ACTIVATED`; **public internet reachability not independently verified**.

## Source / artifact provenance
- GitHub static source commit: `270291e8a8c3b32f10ca3f6dc47142e9e3542238`
- GitHub artifact courier commit: `4cad9f0bebb6ada6a7f1449e067f511c9ff2e470`
- Release archive SHA-256: `47d8da45c45db533cad3556766195e077f62070bd683e5b90f120b01c32e16c7`
- Served release: `/srv/evercraft/infrastructure-watch/releases/270291e8a8c3b32f10ca3f6dc47142e9e3542238-47d8da45c45d`
- Data provenance asserted by pinned release: FHWA 2025 state summaries, Washington 2026 8,619 total bridges / 403 Poor / 8,618 mappable deep records.

## Configuration/rollback
- Original Caddyfile SHA-256: `8e553e50a839b76dd924877fffea223d5c565406e37037e08788355bc5e7afb8`
- Applied candidate Caddyfile SHA-256: `3b8ebe191ebe1009c1a59b10e79783678d998bc4ca13c22e82ead34c1dca9ef8`
- Original backup: `/var/lib/evercraft/aiw/public-beta/reviews/8e553e50a839-270291e8a8c3b32f10ca3f6dc47142e9e3542238/Caddyfile.before`
- Activation script source: `3a28dda4507524564ad04aa13712046e8a350849` in `research/infrastructure-watch/release/aiw-beta-cutover-penguin.sh`.
- Only `evercraft-public-edge.service` was restarted. Fabric resident remained healthy.
- Successful local HTTPS startup readiness: attempt 2.
- Operator-observed completion: `Activation exit code: 0`.

## Operator-observed local HTTPS byte checks
- `/infrastructure-watch/`
- `/infrastructure-watch/about.html`
- `/infrastructure-watch/data/states.json`
- `/infrastructure-watch/data/states.geojson`
- `/infrastructure-watch/data/wa-summary.json`
- `/infrastructure-watch/data/wa-bridges.json`
- `/infrastructure-watch/vendor/leaflet.js`
- `/infrastructure-watch/vendor/leaflet.css`

Operator output reports `OWNED_EDGE_AI_WATCH_LOCAL_HTTPS=VERIFIED` and `FABRIC_RESIDENT_HEALTH=PASS`.

## Still required before declaring public launch
- From a genuinely external network (e.g. phone cellular, Wi-Fi disabled), check `https://fabric.systemiacommandcenters.com/infrastructure-watch/` with certificate validation and assets.
- Confirm that the map renders and touch controls and Washington detail selection work in a real mobile browser.
- Capture external reachability and TLS result; only then transition the external/public status to verified.
- Do not represent this local test as outside-in HTTPS proof or a nationwide 2026 bridge inventory.

**Note:** External verification attempted from an assistant environment could not be completed: browsing failed to fetch the route and the isolated runtime had no working DNS for even well-known domains. This is an environment limitation and does not establish that the hostname lacks public DNS.
