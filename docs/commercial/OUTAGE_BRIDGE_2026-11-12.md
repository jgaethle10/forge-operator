# Evercraft Outage Bridge · first customer proof
Date: 2026-11-12
Owner: Evercraft / Systemia
Code: public/outage-bridge/index.html
Status: implemented on feature branch; publish and production delivery not certified by this document.

## Customer problem
Microsoft 365, email, web, and scheduling interruptions can break customer reachability. A customer needs an independent backup channel and a realistic continuity plan, not a false promise that Evercraft can repair a vendor outage.

## Product shape
- **Free lead magnet (working, local-first):** a browser-based generator for a standalone emergency contact webpage. No external JavaScript, login, server-side form, collection, tracking, or third-party host. The downloaded file requires independent publication and independent end-to-end testing.
- **Existing paid service (commercial handoff):** Site-Survive Rapid Audit, $250 one-time, with a one-site continuity map, top three failure points, and prioritized action plan. Existing public offer route: https://fabric.systemiacommandcenters.com/offers/site-survive
- **$99 Outage Bridge setup pilot:** *not for sale yet*. Prior conversation suggested this as a price experiment; it is NOT the published Site-Survive product. Do not expose an unrelated Stripe link or take payment until the scope, owner, price, customer handoff, independent hosting and service fulfillment are tested and authorized.
- **Recurring monitoring/notifications:** concept only; not a shipping feature.

## Definition of independent
The fallback must not depend on the same Microsoft tenancy/mailbox, DNS provider, primary site infrastructure, booking provider, or single failed network in the simulated outage scenario. Independence is situational, so document and test actual dependencies for each customer.

## Acceptance / customer gauntlet
- [x] Standalone HTML page generation in browser, no automatic data transfer.
- [x] HTML escaping for user-authored fields and HTTPS-only external appointment links.
- [x] Required usable contact channel (independent phone or backup mailbox) and business name.
- [x] Mobile responsive, accessible input labels, explicit non-affiliation and product scope.
- [x] Existing $250 Site-Survive handoff connected in the UI.
- [ ] Browser-based interaction test on mobile and desktop, including malformed input.
- [ ] Download the HTML, inspect links, deploy to truly independent hosting and test from another device/network.
- [ ] Confirm that the existing audit offer link loads externally and that human handoff functions.
- [ ] Systemia/Payments acceptance proof for any new Outage Bridge checkout.
- [ ] Customer delivery receipt plus documented support, privacy and retention practices.
- [ ] Verified production deployment and external HTTP check for /outage-bridge/.

## Commercial outreach rule
Never imply Evercraft can fix Microsoft's servers, guarantee delivery, restore mailboxes, or offer active incident monitoring. Sell tested backup reachability and a bounded one-site diagnostic. Lead with a free self-service contact page and a transparent $250 audit where appropriate. No cold messages claiming a specific business was affected without evidence.

## Operations
- GitHub canonical source, hosted deployment must be validated independently. Do not contact Base44.
- Offer discovery: Evercraft capability "site-survive-rapid-audit-v1" reports sell_now and human_handoff_ready. No direct machine checkout exists.
- No customer outreach sent or payment created by this commit.
- Before expanding: verify independent hosting, reversible delivery, privacy, incident escalation, and whether the existing Evercraft Intake/Interaction Ledger can provide durable bounded follow-up without collecting unnecessary private information.
