# Client 001 | On The Go | owned domain + owned static hosting

**Status: NOT DEPLOYED; DOMAIN UNSELECTED; DNS/TLS/PUBLICATION HOLD.**

## What this package is

An isolated, first-party static hosting plan for Juan Bello's On The Go
Mobile Quick Lube. Canonical source:
`public/clients/on-the-go/review/index.html`. The site is already a
self-contained bilingual HTML document with embedded customer photographs,
styling and scripts. It needs **no external application runtime**.

The current GitHub Pages URL is an **owner-review preview only**:
https://jgaethle10.github.io/forge-operator/clients/on-the-go/review/

This package creates **no new public route** and does **not** change Juan's
existing site at `onthego.theengagency.com`. Do not bypass that agency's
account permissions, reuse its private content, or infer rights to replace it.

## Authority and cost boundaries

- Domain registration can use IONOS as a **registrar/DNS control panel only**.
  Never purchase an IONOS hosting plan for this project. Renewal price, exact
  spelling, registry eligibility and the legal registrant require confirmation.
- The registered domain should be **owned by Juan or his business**, with
  scoped permission for Evercraft to operate DNS and serve the site. Do not
  put a client's identity in Evercraft's domain portfolio without an
  explicitly agreed transfer/ownership and renewal arrangement.
- `onthegoquicklube.com` is a **candidate name**, not verified available,
  registered, paid, configured, live or authorized. Do not print it as a live
  marketing link.
- Maintain original and updated DNS records/TTL in private operator receipts.
  Never rewrite unrelated TXT/SPF/DKIM/DMARC/MX, business email, or other host
  records, or wholesale switch nameservers just to serve a web page.
- No IONOS domain purchase, DNS write, client communication, Meta post,
  ad campaign, payment, or public launch is granted by a source merge.
- CX-001 currently records 12/12 live technical browser tests but **client
  identity/price/content/marketing approval remains held**. Preserve the
  existing noindex and preview language until the owner approves the release.

## Target hosting design

```
On The Go branded .com (IONOS registration, optional IONOS DNS)
  -> customer-specific A/AAAA, or supported exact approved DNS target
  -> Evercraft-owned public TLS edge (Caddy)
  -> local /srv/evercraft/client001/current/index.html
  -> zero external JS, zero upstream HTTP, zero GitHub Pages runtime
```

Systemia owns release admission, rollback receipts and monitoring. GitHub
remains canonical SOURCE, never the customer-serving host. Dedicated site
configuration must not affect Fabric, Journal, Saban, Worlds or other clients.

The existing Chromebook Caddy public ingress is a **candidate**, not a
business hosting SLA. Its shared home power/internet/router is a single
failure domain. Admit an externally witnessed customer edge with recovery
and rollback, otherwise hold public DNS instead of promising uptime.
A spare machine on the same internet connection is not true off-site HA.

## Staging without public deployment

1. Inspect canonical source/asset rights and the exact client release ref.
2. On an operator-authorized Evercraft node, run:
   ```bash
   bash scripts/stage-client001-owned-edge.sh
   ```
   This only copies the canonical HTML to a versioned directory under
   `/srv/evercraft/client001/releases/`; it does NOT create/update
   `current`, enable Caddy, change DNS, or publish.
3. Confirm the source SHA-256 against the staged file. Save the source commit,
   staged path and SHA-256 into private Systemia/Yard release evidence.
4. Independently test the staged HTML on desktop/phone/tablet and in both
   languages, including mailing without a configured handler and failures.
5. With owner-approved exact hostname + live edge authority, review the
   `Caddyfile.example` and shared Caddy config. Create a separately
   approved `current` symlink; validate the **composed** config, deploy
   only through the owned supervised Caddy service. Do not overwrite the
   main Fabric routes or blindly add a new port forward.
6. After verified Caddy listener, trusted TLS and ingress readiness,
   instruct the authorized DNS account holder to connect ONLY the
   approved apex and `www`. Prefer a proper A/AAAA or compatible CNAME
   plan, not an HTTP redirect to GitHub Pages.
7. Test the exact live `https://domain/` and `https://www.domain/` from an
   unrelated external network: correct business identity, TLS/cert, HTML,
   all four media images, EN/ES service flow, working readable contact,
   no tracking or third-party content, robots policy, mobile UX and expected
   absent booking/payment behavior.
8. Require Juan's explicit signoff on identity, photographs, terms, menu,
   starting prices and customer publication. After approval, use a
   separately reviewed release to remove private-preview/noindex language
   and authorize promotion. Do not infer approval from a design compliment.
9. Add independently observed external uptime monitoring, fast rollback to
   the previous verified release, and DNS restore plan before advertising.

## Deliberate stop conditions

- Unknown domain ownership, unavailable domain, no registrar role, unclear
  charges or client approval -> NO PURCHASE / NO DNS EDIT.
- No verified physical Evercraft ingress, HTTPS trust or recovery -> NO DNS
  CUTOVER.
- Technical pass alone, no owner approval, or outstanding accessibility and
  real-device gaps -> REVIEW ONLY, NO CUSTOMER PROMOTION.
- An existing agency-managed site is unrelated production: DO NOT MUTATE.
