# Evercraft Headquarters | public entrance + private Command

Status: SOURCE-STAGED, NOT DECLARED LIVE. Founder direction: November 11, 2026.

## Changed source
- Public corporate entrance: public/headquarters/index.html
- Private operator interface: systemia/evercraft-home/public/index.html
- Regression checks: tests/evercraft-headquarters-home.test.mjs

The public entrance is not the Forge Operator product app, CHUM directory or a Base44 shell. It introduces Evercraft itself first. It is responsive, standalone and uses no external fonts, scripts or trackers.

## Authority boundary
PUBLIC: Company introduction, work, Journal, services and written contact. No private metrics, accounts, payment claims or fake server-side intake.

PRIVATE: Evercraft Home remains the authenticated operator surface. Its existing Evercraft Identity, Passport, sessions, Systemia planning, Raven's gated internal work, Yard/Network evidence and local/Passport auth modes are untouched. Branding adds no authority. Private operator link does not bypass login.

## Command expansion plan
The existing Home should be the ONE founder dashboard, not another detached app. Build new lanes incrementally through authorized APIs and Systemia:
1. Today: evidence-backed attention, exceptions and next actions.
2. Revenue: approved offers, verified payment results and buyer follow-ups.
3. Missions: Saban/Systemia work and receipt-based approvals.
4. Publishing: Journal-first queue, Clip distribution and posting receipts.
5. Products: readiness, approved releases, customer feedback.
6. Infrastructure: Yard, Compute, Network and device/service evidence.

Never label a dashboard number LIVE without authenticated runtime evidence or an appropriate receipt. Missing data should be marked unverified or not connected, not as successful zeroes.

## Release gate
1. Preserve Forge Operator's existing Vite main root; do not replace that business application's route silently.
2. GitHub Pages fallback now builds the company homepage at the Pages root, preserving CHUM under /chum/. Approve a distinct corporate hostname and map it to Evercraft-owned Yard/Edge when independently ready.
3. Verify DNS, actual TLS, mobile/desktop layouts, accessibility, no broken links and metadata against that host.
4. Independently verify services, Journal and CHUM destinations. Source references alone cannot prove public reachability.
5. Confirm email draft links work; no server-side leads are claimed.
6. Add canonical and Open Graph URL only after the corporate origin is authorized.
7. Run: node --test tests/evercraft-headquarters-home.test.mjs
8. Re-run existing Evercraft Home auth/security and deployment checks, including anonymous denial and Passport scope denial.
9. Record a signed deployment receipt and independent external canary before publishing any 'live' announcement.

## Brand
Black #090A0C; engineering white #F5F5F2; titanium #B7BDC5; champagne gold #B79A56; electric ice blue #4FB8FF as a focus accent. Native font fallback avoids third-party dependencies. The exact commercial Montserrat Extended font can be used later only with appropriate licensing.

The goal is the feeling of stepping inside a consequential institution without pretending Evercraft has a physical Manhattan office.

## Pages-root promotion
The existing Evercraft public web fallback was redirecting visitors from / to CHUM. The publisher now copies the public Headquarters page to the Pages artifact root, verifies the site after HTTPS deployment, and retains the source /headquarters/ alias. This is a GitHub Pages public fallback, not proof of a separate corporate custom domain. The source repo's Vite Forge Operator index remains unchanged.
