# Jesse Creator OS and Evercraft publishing recovery
Audit: 2026-11-15. Coordinator: issue #2095, connected with #1389 (Influence Lab), #1828 (Journal), #1998 (Home creator), and the existing corporate Clip publisher.

This file is a source-only operational recovery note. It is NOT an admitted Systemia mission, authenticated provider account, deployed site, delivered social post, or proof of reach.

## Two distinct voices
**Jesse's creator voice:** Look Closer, Build Log, Field Notes, Week in Motion. Original exploration, reporting, genuine engineering footage and first-person stories. Personal accounts are not emergency ad surfaces; do not repeat the commercial offer as filler. Private family conflicts, children, and personally identifying information are never engagement material.

**Evercraft corporate voice:** Journal stories, useful product demonstrations, customer education and occasionally correctly scoped offers. Only authorized corporate accounts with specific audience fit. Never syndicate identical copy indiscriminately across unrelated Facebook Pages. Exclude Havenly, EPS, ChristmasLightsUSA, other clients and unrelated/legally held brands.

## Canonical existing intelligence backbone: Rockies and TOWI
**Do not collapse these into the Journal or the four video formats.** The video series are audience-facing productions; Rockies and TOWI are existing, distinct upstream sources of real editorial advantage.

- **Rockies (systemia/rockies/README.md and roster.json):** distributed *public-source* observers for physical-world and digital signals, quiet baselines, source provenance and material change detection. The topology describes 99 target baseline logical Rockies across 26 ranges, with capacity to surge to 384; these are allocations/targets, **not a verified headcount of live workers**. Observations use `evercraft.context.observation.v1` and feed Context Fabric. A changed feed alone is not a newsroom claim or permission for human monitoring.
- **Worldstate / Reality Delta (systemia/worldstate/README.md):** organizes and compares authorized observations about public systems, places, organizations, assets and infrastructure. Sentinel correlation and Signal Fabric notification policy are independent. These are not personal tracking or emergency broadcasting tools.
- **TOWI:** separate evidence-controlled research and validation, public-records investigations, competing hypotheses, source contradictions, uncertainty and accountable outputs. Existing research includes environmental/infrastructure questions such as Terrace Heights landfill and Mount Rainier lahar. Some historical projects remain draft/held; do not call them published. TOWI can investigate an incoming Rockies signal **or** a question that originated elsewhere; it is not forced to wait for Rockies.
- **Journal, Jesse Creator and Clip:** Journal publishes the longer vetted feature when editorial gates pass. Jesse may independently adapt the underlying evidence into a personal Look Closer, Build Log, Field Notes or Week in Motion episode, preserving source, rights and appropriate disclosures. Fallen Studios works on reviewed visuals and sound. Clip distributes to account-scoped verified destinations after independent provider authorization. Upstream research never implies auto-posting.

Example story path: an unusual public infrastructure trend is flagged by Rockies -> Worldstate compares the past and checks context -> TOWI verifies official records and alternatives -> Journal publishes a reviewed report -> Jesse records a clearly attributed explainer -> Evercraft Clip carries appropriate original cuts to actually authorized audiences. This is an **illustrative planned workflow**, not a claim that such an event was observed, investigated or released today.

**Creator editorial priorities:** lead with curiosity, observation, original field evidence and documented tests; no wall of ads, no unsupported alarming claim, no repeat personal-page product blasts. Respect audience/brand separation. Verify actual platform post IDs independently.

## Current recorded facts
- The Oct 30 campaign review queue contains 8 *candidate* corporate Facebook Pages, 1 LinkedIn company, 1 Instagram and 1 X account. All 11 have null provider account IDs and false identity / permission evidence at source review. This is not evidence that none exists privately, only that source has not proven them.
- TikTok and YouTube do not appear in that campaign queue; they are expansion and account-identification gaps.
- Owned Facebook Journal publisher exists in source: systemia/clip/GENERAL_JOURNAL_FACEBOOK_PUBLISHING.md. It requires a sealed Page credential, accurate Page identity, Meta write task, Passport release, durable claim and provider readback.
- Owned LinkedIn company publisher exists in source: systemia/clip/LINKEDIN_OWNED_PUBLISHING.md. It requires a permitted organization OAuth token and actual organization role, distinct from founder personal LinkedIn.
- The Journal source index **refreshed 2026-11-16** now reports `live_edition:true`, **one current** November 15 NVIDIA infrastructure/leadership feature and three archived stories. This is progress from the prior archive-only source state, not independent public HTTPS verification or a social-provider post receipt. Current source can regress or change independently of this note.
- The connected Metricool brand list exposed ChristmasLightsUSA only on Nov 15; it cannot prove Evercraft or Jesse's performance. Metricool is not the company publishing rail.
- A new public/jesse/index.html is a creator front-door *source candidate*. Real public delivery requires approved merge, actual Pages deploy and independent browser/HTTPS QA.

## Read-only publishing lane check
Run on an owned checkout of the repo:

    node systemia/clip/distribution-readiness.mjs
    node systemia/clip/distribution-readiness.mjs --json
    node --test tests/creator-distribution-readiness.test.mjs

If genuine Clip private provider receipts exist, the operator may use:

    node systemia/clip/distribution-readiness.mjs --receipts-file /private/approved-provider-receipts.json --json

The private receipt file must contain an array of actual Clip publisher receipts. Do not paste credentials or customer data into the repository or chat. Missing receipt files are UNKNOWN, not proof that no posts exist. This check reuses the existing social-continuity-watch and does not publish anything.

## P0: Prove one corporate Facebook post
1. Enter the actual owned Evercraft Home credential screen, after verifying its live URL and authenticating with the existing owner flow. Do not share tokens in chat or GitHub.
2. Choose one verified corporate Evercraft Page, not founder personal or a separate client/business. Match the sealed numeric Page ID and Page name to actual Meta Page ownership and task permissions. Use the existing read-only Clip connection diagnosis.
3. Validate provider permission to create content separately from the read-only identity diagnosis.
4. Confirm the owned Home runtime has the appropriate private vault, authenticated Passport release, durable claim path and the existing Facebook Journal publishing flags. Source code cannot set provider roles.
5. Release *one* original source-verified Journal story to that Page after editorial/public article gates. Capture provider post ID, permalink, exact attempt record and independently readable public permalink. If a provider response is ambiguous, reconcile rather than repost.

## P1: LinkedIn, Instagram, TikTok and YouTube
LinkedIn: use the existing company adapter and supported organization read/write privileges. Do not reuse personal-account credentials. Capture exact provider receipt and independent public readback.

Instagram/TikTok/YouTube: verify real company and creator account ownership, scoped authorization, available native Clip adapter, original vertical footage intake, provider upload, remote ID/permalink and duplicate prevention. If an adapter is incomplete or a token absent, label that lane HELD instead of publishing via an unapproved vendor. Each candidate is one publication workflow, not permission for mass cross-posting.

## P0: Journal and personal creator entrance
Restore the owned Journal by submitting a genuinely fresh eligible feature through its existing 10/10 sourcing/rights/editorial release. Never relabel archived content as current to appease a canary. Verify the actual public canonical article and OG metadata independently before sharing links.

Review and ship the Jesse front door with its separate editorial identity. Add personal social links only after handles and account ownership are confirmed. Until a mailing list backend exists, the page uses plain email as a contact, not a fake subscription.

The first creator release should be a verified Look Closer story or real Build Log sequence, not another commercial studio sales pitch.

## Creator research shelf: source → independent article readback
The `public/jesse/research-shelf.mjs` module reads the **same-origin** `../journal/index.json` on the viewer's device. It does not insert an article into the creator site merely because a source commit says `live_edition:true`. It only displays a current-index story once the matching same-origin `/journal/{slug}/` actually returns HTTP 200 HTML and a matching `evercraft:story_id` meta tag. A missing, stale, blocked, mismatched, or unavailable article yields an honest no-verified-current-article message.

This is a **reader discovery path**, not a new content writer or social publisher. It separates existing Evercraft Journal reports from genuine Jesse original creator episodes; a Journal piece alone does not imply Jesse filmed a video or personally authored it. It uses the existing Pages/owned Journal artifacts, never a Base44 or third-party host. Actual external public visibility must be verified after the page deployment. Tests: `node --test tests/creator-research-shelf.test.mjs`.

## Evidence required before declaring restored
Every actual release needs asset and rights provenance, brand/account identity, verified platform permission, real Systemia/Passport account-and-asset scoped authority, a durable provider attempt ledger, a provider post ID/permalink, independent public visibility evidence, and post-level engagement metrics *if accessible*. Source draft, CI green, scheduled item and provider API acceptance are distinct from confirmed public publishing.

The first two milestones are one genuine company Facebook release and one genuine company LinkedIn release. After that, add a creator launch with own accounts, then pilot native vertical video channels one at a time. No claims of successful distribution until an actual verified post exists.
