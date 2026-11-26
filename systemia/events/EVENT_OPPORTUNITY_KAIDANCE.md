# Evercraft Events | Kaidance opportunity discovery

**Status: source and PR review. Not a verified live global scout or deployed owner resident.**

## Two event revenue lanes

**Paid event services:** public RFPs and identified funded buyers looking for event/conference/festival production, websites, sponsor decks, creative direction, venue/heritage interpretation, operations and coordination. A public tender is not proof of eligibility, ability to deliver, a buyer relationship, or paid revenue.

**Evercraft-originated events:** REIGNITE is the flagship example. Preserve our outdoor main stage, intimate approved indoor visual/acoustic dome, Quiet Wing and worldwide participation. Qualify venue rights, production expertise, sponsor underwriting, legal funding arrangement and independent technical signoffs. Never finance contracts using unconfirmed sponsorships or speculative ticket sales.

Prioritize near-term **paid event concept packages, sponsorship materials, websites and visualization work** with funded buyers. A major festival may take months to realize.

## Existing five-minute heartbeat integration

The owned Kaidance company lane registry now declares events as a read-only observation lane. This does not create a new service or scheduler and does not claim a worker is installed.

The existing kaidance-frontier-field workflow invokes the event opportunity scout before the existing company heartbeat. The UK Find a Tender official OCDS API has a bounded six-hour read-only polling budget, one first page per attempt, within the existing five-minute workflow. Pull-request CI uses source-only testing and no live network. Source coverage now has two bounded adapters: UK Find a Tender OCDS (keyless) and optional U.S. SAM.gov federal notices, **which cannot fetch without a private SAM.gov API key**. Neither source covers all opportunities in its country, and neither constitutes global opportunity discovery.

The scout normalizes notice, buyer, deadline and source evidence, filters award-only/cancelled/expired/irrelevant records, and deduplicates opportunities using stable notice IDs. Its source receipts are persisted privately. The existing Kaidance heartbeat can reconcile up to six candidates into its existing queue; its next-action reconciler can propose up to four human-review candidates. No automatic buyer emails, bidding, calendar entries, funding claims, booking or charges are possible.

Sources and constraints: https://www.gov.uk/government/publications/open-contracting · https://open.gsa.gov/api/get-opportunities-public-api/

**U.S. source setup gate:** the existing Kaidance workflow reads the optional GitHub Actions secret `SAM_GOV_PUBLIC_API_KEY` only in its main/scheduled path; pull-request tests never use the key. If this key isn't configured, the scout reports `api_key_not_connected`, fetches nothing, and produces zero U.S. candidates. We have **not** provisioned or tested a real user's API key. Secrets must never enter Git history, a public page, email, logs or private source receipts.

U.S. scanning is **one first page per due six-hour tick**, with title keywords rotating across event, festival, conference and exhibition. SAM.gov's official API has a mandatory posted-date range and requires a user API key. It also returns *sources sought* and *pre-solicitation* notices; these are held as early market-research opportunities, not payable event contracts. All bids require eligibility checks, including federal vendor registrations and set-asides. No key or deployed resident means no live U.S. scanning.

Both sources share the existing private Kaidance company queue; no second scheduler or CRM. Each source is separately freshness-gated (at most eight hours after a verified source read), validated against the appropriate official host, and can produce only owner-reviewed action suggestions. The heartbeat never sends messages or signs bids.

## Oregon and Washington local procurement: real official-source intake

The new regional review uses the **actual public OregonBuys bid detail URLs**, not a bid aggregator, imported as dated read-only evidence in `systemia/events/regional-official-notices.review.v1.json`. OregonBuys officially exposes open bids without requiring a portal login to view; that is not evidence of permission to programmatically scrape a private supplier session. The regional runner calls **no external URLs**. It validates exact OregonBuys notice IDs/URLs, the published local date/time with an explicit timezone offset, buyer and service class, and an observed-on date that expires automatically after 72 hours. On repeated five-minute Kaidance calls it can only create up to four bounded `founder_review_required` queue entries from a fresh sibling private receipt. It refuses unknown or expired links. There is no new scheduler or CRM.

**Two official bid examples observed November 25, 2026, not yet qualified:**

- North Clackamas Parks & Recreation District, RFQ2026-86 on-call photographers for events, bid `S-C01010-00018449`, published Dec. 8, 2026 2 p.m. Pacific deadline: https://oregonbuys.gov/bso/external/bidDetail.sda?docId=S-C01010-00018449&external=true&parentUrl=close . A qualified photography partner, procurement registration, attachments, rates and actual delivery capacity require verification.
- Eastern Oregon University institutional brand and positioning strategy, bid `S-580100-00018461`, published Dec. 11, 2026 noon Pacific deadline: https://oregonbuys.gov/bso/external/bidDetail.sda?docId=S-580100-00018461&external=true&parentUrl=close . This is adjacent branding/research work, **not** an event-production contract; a suitably qualified strategy partner may be required. No assumption Evercraft can bid.

Also registered official public discovery entrypoints for Washington's WEBS bid calendar (https://pr-webs-vendor.des.wa.gov/BidCalendar.aspx) and Seattle's purchasing page (https://www.seattle.gov/purchasing-and-contracting/purchasing). **These are link-based founder review sources, not machine-parsed lists of current opportunities.** Web pagination, supplier registration, API restrictions, changes and procurement terms require separate validation before a live regional collector can be introduced. Do not label either portal as continuously crawled.

**Revenue priorities:** (1) scoped paid creative services, event websites and sponsor/deck production; (2) event-producing partner revenue with written deliverables; (3) independent large-event concepts like REIGNITE only with signed permission and committed underwriting. Source listings do not authorize proposals, external partnership claims, donations, bids, or payments. Before any manual outreach, read the existing Revenue Desk history for the exact buyer to prevent duplicates. The regional intake itself reads **no** local buyer contact records and leaves `prior_outreach_history_checked:false`.
## Global coverage roadmap

Additional machine-readable official-source adapters remain to be built and validated for U.S. state/local procurement (the Oregon/WA portal links are currently founder-review only), Canada, EU and other markets, and for museums, venues, cultural foundations, major conferences and sponsorship-backed concepts. Every source must have a credible original URL, accurate scope and deadline, a rate budget, terms review and human eligibility verification. Avoid pay-to-access job marketplaces.

Reconciliation should share the **existing Evercraft Revenue Desk contact history** before any future outreach. An event lead is not a new email if Evercraft already contacted the buyer. Never send a duplicate intro or create another CRM.

REIGNITE is **already contacted, full original festival proposal sent, museum reply pending**. It must remain a protected in-progress opportunity rather than an automatic cold-outreach candidate.

## Verification and activation

Run the UK and U.S. event discovery tests, Kaidance company-heartbeat tests and next-action tests using Node 22. Confirm GitHub Actions test receipts, then merge through the existing event/site integration PR sequence. Verify at least two real owned heartbeat receipts, durable private state persistence, and review of source API rate/availability before calling the scout live.

This source change is not an event approval, an underwritten production, a guaranteed global crawl or a newly deployed five-minute resident. Evercraft retains zero autonomous outreach, spend, booking, charity or ticketing authority in this lane.
