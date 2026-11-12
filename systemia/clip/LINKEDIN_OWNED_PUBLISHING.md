# Evercraft Clip | Owned LinkedIn Company Page publishing

**Scope:** Evercraft Journal → Evercraft Clip → Evercraft Company LinkedIn. Owned code, never Metricool/Base44/TinyFish. Code source is NOT proof of a live LinkedIn token or provider post.

## Execution path

1. An approved source-grounded Journal story first passes genuine editorial, visual/rights, production and Systemia release gates.
2. The owned Journal publishes public/journal/production/<slug>/clip-handoff.json with canonical URL, title, story ID, published receipt ref and distinct LinkedIn copy.
3. Passport-authenticated Evercraft Home exposes POST /api/clip/journal/linkedin with body containing only {"slug":"approved-story-slug"}. It verifies a real home.clip.publish grant for journal-story:<slug>. Local loopback-development auth is blocked.
4. Home resolves the private LinkedIn organization credential from the encrypted vault and matches it against CLIP_LINKEDIN_ORGANIZATION_ID. HTTP users never supply a token, organization ID, message, or publication URL.
5. Clip preflights the live Journal URL against expected title, canonical metadata, Open Graph URL, story ID and content. It checks the bounded issuer/account authorization.
6. Home atomically creates a durable per-LinkedIn-story claim before any provider POST; the same story cannot be blindly submitted twice.
7. The adapter POSTs to LinkedIn's versioned REST Posts API, reads x-restli-id, and GETs the exact returned post with viewContext=READER. Only an exact match for author, ID, text, main feed, public visibility and PUBLISHED state yields a provider-confirmed post URL.
8. Ambiguous POST or GET outcomes require reconciliation. No blind retry and no invented post URL. Authenticated readback does not independently prove anonymous public visibility.

## Private one-time activation

An eligible LinkedIn application and permissioned organization token must be provided through the actual owned Evercraft Home /home/credentials.html page. The application needs approved w_organization_social and r_organization_social access, and the LinkedIn member needs the corresponding Company Page role. These are provider permissions, not something a GitHub PR or ChatGPT authorization can grant.

Seal the numeric company organization ID and OAuth access token under **LinkedIn Company Page · Evercraft Clip** in Home. Do not paste provider tokens in chats, issues, GitHub or email. If multiple credentials are sealed, select the correct exact credential reference.

Configure on the owned Home resident, not CI:

- EVERCRAFT_CREDENTIAL_STATE_DIR: owned encrypted credential vault
- EVERCRAFT_CLIP_JOURNAL_STATE_DIR: private durable directory (outside checkout), owner-only permissions
- CLIP_LINKEDIN_ORGANIZATION_ID: numeric company organization ID
- CLIP_LINKEDIN_CREDENTIAL_REF: sealed private credential reference when needed
- CLIP_LINKEDIN_API_VERSION: supported YYYYMM value; check LinkedIn sunset policy, such as 202609
- CLIP_LINKEDIN_ORG_ACCESS_VERIFIED=true only after confirming company identity/role
- CLIP_LINKEDIN_WRITE_VERIFIED=true only after confirming w_organization_social
- CLIP_LINKEDIN_READ_VERIFIED=true only after confirming r_organization_social
- CLIP_LINKEDIN_PUBLISH_ENABLED=true only once authority and durable storage are verified

Run owned Home with passport auth and a real story-scoped home.clip.publish grant. Deploy an accepted revision via Systemia → Yard → Evercraft Compute. Source merge does not update private Home environment or prove runtime state.

## Operator path

Only after the Journal story is publicly verified, select LinkedIn Company Page in the owned Home credentials screen and choose **Publish verified Journal story** for that exact slug. The route uses previously cleared Journal copy; it does NOT accept arbitrary user-written social content. Record the actual LinkedIn remote ID, authenticated permalink, original publication receipt and independent public visibility check. Ambiguous results remain held.

## Tests and current truth

Run:

    node --test systemia/clip/linkedin-organization-publisher.test.mjs systemia/evercraft-home/clip-journal-linkedin-publish.test.mjs systemia/evercraft-home/provider-credentials.test.mjs

CI uses fake provider responses and no credentials. It proves only the code boundaries. **No live LinkedIn organization publishing or end-to-end operational deployment is claimed yet.** PR #1934 is still a separate unreleased article candidate.

Provider docs: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
