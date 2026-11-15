# Evercraft Clip | Approved Journal → corporate Facebook

This is the first-party native company Facebook publishing bridge for general, non-CFB Journal articles. The existing college football publisher remains separately governed and unchanged.

The owned Home POST /api/clip/journal/facebook route accepts a bounded slug only; it does not accept an arbitrary image, caption, page token or URL. It performs a Passport home.clip.publish check bound to that specific Journal story resource. The generalized publisher ALSO requires a real Passport grant, so local development-mode authentication does not authorize general publication.

## Evidence and execution contract

Before any Meta POST, the publisher verifies the actual fresh Journal publication receipt, editorial 10/10 and visual production gates, live status, handoff-to-receipt story identity, exact article SHA256 and independent anonymous article URL canonical, OpenGraph and story ID. It selects the already-authorized Facebook derivative from that exact Journal handoff, not draft copy supplied by the caller.

Evercraft Home resolves the approved Facebook Page credential from its private vault. The Page ID must match the explicit operator allowlist CLIP_FACEBOOK_JOURNAL_PAGE_ID. The owner must independently verify pages_manage_posts, the actual Page role and identity, and set CLIP_FACEBOOK_JOURNAL_WRITE_VERIFIED=true only after that check. CLIP_FACEBOOK_JOURNAL_PUBLISH_ENABLED=true enables the general publisher only after those verified prerequisites. Tokens remain private and never appear in HTTP payloads or receipts.

Home uses EVERCRAFT_CLIP_JOURNAL_STATE_DIR for a durable atomic per-story Facebook claim. Repeating an attempted story never blindly resubmits. The existing native Facebook Page adapter publishes through the Meta Graph API and checks matching provider-returned post identity and permalink. Even after provider publication, failed Journal postflight is reported separately. An ambiguous Meta POST or readback remains a reconciliation hold, not a fresh retry.

The first-party owned route must be deployed through Systemia → Yard → Evercraft Compute. Passing CI is not a production credential, role grant or live external post. Once the story and company Page grant are cleared, the authenticated owner can publish once and record the real provider URL.

## Tests

    node --test systemia/evercraft-home/clip-journal-facebook-general.test.mjs

Tests use dummy credentials and simulated Meta POST and GET. They cover real source receipts and article hash, provider readback, duplicate prevention, scoped authority, page identity, expired releases, dead links and reconciliation holds.

**Not claimed:** a configured company Page token, provider write permissions, deployed runtime, live provider URL, or release of the held code-vs-inference Journal candidate (PR #1934).
