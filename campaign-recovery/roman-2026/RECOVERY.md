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

## Fastest authorized restoration of `voteroman.com` (prepared, NOT executed)

**Current routing state (last externally probed Oct 18 UTC):** the original apex and `www` still served HTTP 402 from Base44. The independent Evercraft-hosted informational campaign page and Wix fallback served HTTP 200. The campaign donation webpage served HTTP 200, but no donation transaction was performed.

**Prefer one reversible, temporary 302 forward to the independently deployed Evercraft page:**

| GoDaddy control | Required value |
| --- | --- |
| Domain | `voteroman.com` (root/@ only) |
| Destination protocol | `https://` |
| Destination address | `fabric.systemiacommandcenters.com/campaigns/roman/` |
| Forwarding type | **Temporary (302)**; **do not mask** |
| `www` | Only after a DNS snapshot, change `www` CNAME to `@` as GoDaddy documents for www forwarding |
| `donate`, `www.donate`, MX, TXT/SPF/DKIM/DMARC | **Preserve unchanged** |
| Nameservers | Do **not** change as a general migration shortcut; validate current authoritative nameservers before and after |

This is a **plan for the lawful registered owner or existing authorized DNS manager**, not a claim of access. Do not begin GoDaddy account recovery, OTP, or delegate request without explicit approval. If the domain is registered to another person, ownership and control must be respected. No connected credentials prove current write authority.

**Safety and release gates:**
1. Before any change, authorized manager captures **current DNS zone**, domain forwarding, nameservers, TTLs, mail records, and donation records. Confirm any GoDaddy Domain Protection checks are authorized.
2. Verify the proposed destination returns HTTPS 200 and contains `Roman Kilinkaridis` and `https://donate.voteroman.com/` with a clean HTML body, then obtain campaign-owner approval of the abbreviated informational mirror and its `noindex` setting.
3. In GoDaddy Domain Portfolio for **this exact domain**, open DNS → Forwarding → Add Forwarding → **Domain** → HTTPS → Evercraft URL → **Temporary 302** → Save. See [GoDaddy official forwarding instructions](https://www.godaddy.com/help/forward-my-godaddy-domain-12123). Changes can require GoDaddy verification and up to 48 hours for global propagation.
4. For `www`, do not assume root forwarding covers it. GoDaddy specifies that `www` CNAME must point to `@`. Change only after authorized zone snapshot.
5. From an independent network, test HTTP and HTTPS apex and `www`, ensure **302 Location** routes to the exact Evercraft destination, verify final HTTP 200 and candidate/legacy donation link markers. Then independently check `donate.voteroman.com` availability and owner-authorized donation checkout integrity. Check mail DNS for record drift.
6. If any check fails, authorized manager removes domain forwarding and restores precisely the saved records. Never guess rollback IP addresses. Do not call cutover successful before independent external proof.

**Failover distinction:** a 302 forwarding rule depends on the destination host. An autonomous guardian can monitor the original domain and recommend the healthy Wix backup, but **cannot redirect original-domain visitors to the Wix fallback unless authorized GoDaddy forwarding or an Evercraft-controlled ingress has been configured**. Do not deploy an automated registrar writer until authority is established and a separately verified rollback/test contract exists.

The independent Wix backup remains at `https://headless-jhpvqnpgxlh-sociallyguud-140c.wix-site-host.com/`.

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
