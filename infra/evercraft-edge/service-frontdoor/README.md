# EPS + HAVENLY: Evercraft-owned emergency domain shell

**Status:** `domain_not_cut_over`. Source and local CI are not a public DNS cutover.

The customer can keep typing **evercraftpropertyservices.com** or **havenlycleaning.com** once the corresponding apex and www DNS records point to this independently deployed HTTPS front door. This shell does not talk to Base44 and never redirects users back to it.

## Already live no-Base44 public backups
- EPS: https://jgaethle10.github.io/forge-operator/eps/
- HAVENLY: https://jgaethle10.github.io/forge-operator/havenly/
- EPS estimator: https://jgaethle10.github.io/forge-operator/apps/eps-estimator/

These are deployment-independent reference surfaces; do not mistake their availability for the two custom domains having moved. The edge shell embeds each canonical HTML at build time and serves it without calling GitHub Pages either. Current EPS confirmed phone is 509-759-0440; primary email jessegaethle10@gmail.com; alternate evercraftpropertyservices@gmail.com. HAVENLY retains its separately verified owner contacts.

## Option A: fastest emergency rescue by IONOS domain forwarding

**Prerequisite:** authorized IONOS registrar/domain login. Do not use Base44, modify mail DNS or request someone else's OTP.

IONOS Domains & SSL → choose `evercraftpropertyservices.com` → Adjust Destination → Domain Forwarding → Arbitrary URL:
`https://jgaethle10.github.io/forge-operator/eps/`

Repeat for `havenlycleaning.com`:
`https://jgaethle10.github.io/forge-operator/havenly/`

Choose **HTTP Redirect** with HTTPS destination, and enable the `www` option. IONOS says HTTP forwarding is better for SEO than frame masking. This bridge WILL show the GitHub Pages URL in the address bar. It does not produce an inline hidden reverse proxy. Preserve mail MX, SPF, DKIM and DMARC; capture existing A/AAAA/CNAME/URL forwarding settings so rollback is possible. No cross-domain forwarding to the wrong business.

Once saved, independently verify an ordinary HTTPS navigation from BOTH apex and www to the exact target content, real contact links, return HTTP state, TLS and no Base44 402, then log a receipt. An IONOS setting without an external GET is not proof of successful rescue.

Official IONOS guide: https://www.ionos.com/help/domains/forwarding-a-domain/forwarding-a-domain-to-a-different-domain/

## Option B: original domains remain visible with a proper Evercraft edge shell

Requires an authorized, publicly reachable Evercraft Yard / NodeSeed server or a vetted edge-worker host, real TLS, and a verified DNS admin role. The code here supports either:
- `worker.mjs`: module worker deployable to an edge-worker platform with bundled `embedded-sites.mjs`. Map only the two explicitly listed apex/www hostnames after independent preview and owner DNS change.
- `server.mjs` + `Caddyfile`: no paid dependency; run Node 22 on an authorized Yard node with `node infra/evercraft-edge/service-frontdoor/server.mjs`; Caddy must proxy 443 to loopback 127.0.0.1:3080. Set persistent supervised service, trusted TLS and signed release before advertising production. Never open 3080 directly on the internet.

For local read-only proof:
```bash
node infra/evercraft-edge/service-frontdoor/generate-embedded.mjs
node --test infra/evercraft-edge/service-frontdoor/worker.test.mjs
node infra/evercraft-edge/service-frontdoor/server.mjs
curl -H 'Host: evercraftpropertyservices.com' http://127.0.0.1:3080/
curl -H 'Host: havenlycleaning.com' http://127.0.0.1:3080/
```

Pre-cutover proof: independently load HTTPS preview (mobile and desktop), correct site by hostname, request SMS/email composers, estimator interaction, real TLS chain, contact click and real-device delivery if desired. Then DNS administrator changes ONLY apex/www records of the two verified domains with a documented rollback. Preserve MX/TXT/SRV/CAA and other active subdomains. Verify two distinct public network resolvers and external HTTPS content after propagation. Do not replace all NS records for a simple website migration.

If either custom domain is still 402, it is **not** fronted by this shell. A script, browser service worker, or a background agent cannot intercept new visitors before domain routing. Existing cached redirects may differ, so test on a fresh browser/device.

## Safety and routing

- Every GET for a configured apex serves bundled local HTML; EPS estimator is directly bundled at `/apps/eps-estimator/`.
- Old, non-API URLs such as `/book-now` redirect to the appropriate fresh homepage, not Base44. `/contact` and `/quote` go to the current site's `#quote` anchor; the returned forms only create user-reviewed text/email drafts.
- Private and API paths return 404, unrecognized hostnames 421, writes 405. HTTPS www navigations canonicalize to apex.
- The read-only health response reports `dns_cutover_verified:false` until replaced by independently generated receipts; no fake DNS, live booking, checkout, record import or customer submission claim.
- Embedded HTML must always be refreshed from the canonical public pages by `node infra/evercraft-edge/service-frontdoor/generate-embedded.mjs --write`. CI rejects stale snapshots. No customer data, mail secrets or Base44 API keys are bundled.
