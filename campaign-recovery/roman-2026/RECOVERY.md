# Roman campaign emergency site recovery

**Incident:** https://github.com/jgaethle10/forge-operator/issues/1378  
**Date:** October 17, 2026 (Pacific)  
**Affected:** `https://voteroman.com/`, public Base44 unavailable page and externally observed HTTP 402.  
**Election:** November 3, 2026.

## Emergency assets

- Independently published **static fallback**: https://headless-jhpvqnpgxlh-sociallyguud-140c.wix-site-host.com
- Wix dashboard: https://manage.wix.com/dashboard/e1a90920-08db-41d2-a70e-167204678340
- Version-controlled complete fallback HTML: `campaign-recovery/roman-2026/index.html` (this directory). Exported from the **published Wix deployment archive**, not reconstructed from memory.
- Wix *donation site*, separate from the mirror: https://donate.voteroman.com/
- Campaign contact currently in mirror: contact@voteroman.com

## What the fallback does and does not do

The mirror gives the public a read-only biography/position summary, campaign email and original donation link. It does **not** reproduce Base44's original events, volunteer intake, SEO route cluster, sliders, backend records or form submissions. The donor site's existing checkout, volunteer forms, receipts and email processes remain **untouched**, **not independently transaction-tested**.

QA inspected the committed HTML: standalone markup, mobile viewport, no external scripts, no Base44 code dependency, original donor URL, mailto contact, no collecting forms. This is **static/structural validation** and **not** an independent outside-browser or donor payment-flow test.

The fallback currently has `noindex,nofollow` to avoid creating duplicate campaign search results before owner review. Revisit indexing and canonical URLs at permanent migration.

## Lowest-cost *temporary* domain recovery option

GoDaddy offers HTTPS **temporary 302 forwarding** without needing to connect a premium Wix custom domain. Official instructions: https://www.godaddy.com/help/forward-my-godaddy-domain-12123 .

**Cutover gate.** An authorized domain admin must confirm:
1. The fallback URL opens correctly on a mobile network and desktop. Confirm the campaign owner accepts the abbreviated text (not full-page parity).
2. `https://donate.voteroman.com/` and *existing* payment paths remain reachable and checkout functionality is tested using the real provider (no made-up donations or test charges).
3. Snapshot DNS: nameservers, @ A/AAAA, www CNAME/A, donate, www.donate, MX, TXT/SPF, DKIM, DMARC, TTLs. Verify GoDaddy is the *authoritative DNS*, not merely the registrar. Historical August 2026 records are not proof of current DNS.
4. Confirm domain forwarding will not automatically replace non-GoDaddy nameservers; the GoDaddy help warns it may do so.
5. Confirm there are no unexpected existing redirects or domain protections that change the plan.

**Only after those gates**, the domain administrator can log in to https://dcc.godaddy.com/ -> voteroman.com -> DNS -> Forwarding -> Add Forwarding. Choose **Domain** (root), **https://**, destination `headless-jhpvqnpgxlh-sociallyguud-140c.wix-site-host.com`, type **Temporary (302)**, **not masked**. Do **not** edit `donate` or `www.donate`, MX, TXT or other DNS records. GoDaddy says `www` forwarding additionally needs `www CNAME -> @`; inspect the current value first and only adjust after backup/approval. Domain forwarding automatically changes and locks the root @ A record. Propagation may take time.

**Rollback:** restore the recorded old root and www settings (remove forwarding first, as GoDaddy requires), verify `donate`, email and other subdomains. Never guess the historical Wix IP or CNAME values as production rollback records.

**Post-cutover verification:** https://voteroman.com and https://www.voteroman.com should give 302 -> independently hosted mirror with working HTTPS; test with and without trailing slash, mobile, original links; validate donation domain *and* the payment flow separately. Original deep links may not survive forwarding to the one-page mirror and need a follow-up migration.

## Permanent migration

Deploy a complete, source-controlled site onto independently controlled hosting; restore SEO landing-page paths, event calendar, volunteering forms, public Q&A/commitments, version history, analytics, access controls and accessibility. Keep donor/payment rails separate. Set canonical and redirect mappings only after route verification. Do not equate this emergency mirror with a complete product migration.

**Cost policy:** do not purchase or renew Base44 merely to try to clear an unexplained HTTP 402; no paid Wix custom-domain upgrade for this temporary mirror without explicit authorization.

**Systemia:** log this as an admitted incident and route verification/operations through Systemia; this PR/issue does not establish that agent dispatch or DNS changes occurred.
