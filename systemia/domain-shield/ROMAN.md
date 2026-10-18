# Roman domain guardian | routing truth contract

## Goal
Keep the Evercraft emergency campaign page observable and recoverable throughout the 2026 election, without touching the GoDaddy account, forcing OTP delivery to Paola, contacting the campaign, or creating a paid hosting dependency.

## Live surfaces
- Original apex: `https://voteroman.com/`, **known HTTP 402 until an authorized change**.
- `www.voteroman.com`: redirects to the broken Base44 root.
- Independent Evercraft website: `https://fabric.systemiacommandcenters.com/campaigns/roman/`
- Separate fallback: `https://headless-jhpvqnpgxlh-sociallyguud-140c.wix-site-host.com/`
- Existing donations: `https://donate.voteroman.com/`. Never repoint or redeploy this subdomain as a "fix."

## What actually runs
`roman-domain-guardian.mjs` performs GET-only public HTTPS checks and public DNS lookups. It records statuses and the recommended working backup. GitHub Actions runs it on a five-minute schedule in the October/early-November election period and stores JSON receipts and a job summary. GitHub schedules can run late or be missed. Tests cover failover selection, root-domain ownership states, and lack of mutation authority.

This is **not DNS failover and it will not turn HTTP 402 at the original URL into HTTP 200**. No running process elsewhere can insert itself in an arbitrary browser request that still resolves to Base44. A GitHub Actions robot cannot lawfully override GoDaddy DNS by polling it.

## DNS / ownership gate
- Current authoritative nameservers were previously observed at `ns09.domaincontrol.com`, `ns10.domaincontrol.com`. Verify before cutover, because DNS changes over time.
- Domain ownership is **unconfirmed**. The user's suspicion about Paola is not proof.
- No registrar credentials, access grant, verified hosting control, or domain management API authority is connected to this guardian.
- A future DNS cutover requires documented authorization from the current registrant/account controller (e.g., safe delegated access or approved registrar transfer). Do not begin account recovery, request an OTP, or contact Paola or Roman without explicit direction.
- After control is proven, bind the domain to an Evercraft edge with valid TLS and an exact Host routing rule; test the apex and www from an independent network. Do not blindly point an A record at the Fabric host's IP or change all nameservers.
- Preserve donation DNS, MX, SPF, DKIM, DMARC, campaign email, and existing donor payment flows. Checkout completion needs separate campaign-authorized testing.
- Only an **externally observed** root HTTP 200 page with the canonical campaign content and the `x-evercraft-campaign-source: owned-fabric-static` response header may be labeled `ORIGINAL_DOMAIN_VERIFIED_ON_EVERCRAFT`. This header is an observable application marker, not proof of legal ownership.
- If the original is broken but the Evercraft mirror is available, recommend the independent Evercraft URL; never claim visitors entering `voteroman.com` are automatically redirected.
- Disable the rapid scheduled job after the election period. The JS CLI stops public network probes after November 4, 2026.

## Manual evidence check
`node --test systemia/domain-shield/roman-domain-guardian.test.mjs`
`node systemia/domain-shield/roman-domain-guardian.mjs --receipt artifacts/roman-domain-guardian.json`

## Rollback
The guardian only reads public data and writes CI receipts. Disable its GitHub Actions schedule to stop future checks. It has no production write permissions and does not expose a write endpoint.

## Evercraft-owned continuity funnel

The canonical independent informational page remains at `https://fabric.systemiacommandcenters.com/campaigns/roman/`. An additional stable entry is being deployed at `https://fabric.systemiacommandcenters.com/go/roman`.

- This new route exists **only** on the Evercraft-owned Fabric host. It cannot intercept a request for `voteroman.com` without authorized registrar/host control.
- GET/HEAD requests to `/go/roman` or `/go/roman/` 302 redirect to the first-party campaign page after local integrity checks. Input query parameters are deliberately dropped, not forwarded.
- If local HTML is missing/invalid, the router makes a bounded read-only GET to the preapproved independent Wix informational mirror and checks HTTP 200, HTML and existing campaign/donation markers before issuing a 302. It never redirects to an arbitrary query-specified URL.
- If both sources are invalid, the route returns HTTP 503 instead of sending someone to a dead or untrusted host.
- No cookies, contact collection, tracking, altered DNS, donor checkout, email, or outreach.
- The router cannot help when the Fabric host itself is offline; visitors require a separately distributed independent Wix URL in that case.
- The site still contains selected public campaign information, not the original site's full functionality. Do not present the independent mirror as the original official hostname without domain/campaign authorization.

Test: `node --test systemia/domain-shield/roman-funnel.test.mjs tests/fabric-roman-campaign-mirror.test.mjs`.

**Rollout truth:** a passing PR test proves source behavior, not that the public host has updated. Only publish the short URL as live after an external HTTPS check confirms the redirect and destination.
