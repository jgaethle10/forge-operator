# Evercraft Clip: seven live niche sites, earned distribution

Campaign key: `evercraft-clip-audience-sites-20261020`  
Source of truth: `public/clip/audience-sites/queue.json`  
Review dashboard: `/clip/audience-sites/`

## Channel discipline

This campaign does not route through Metricool. **Evercraft Clip is the canonical social engine.** Seven niche posts are staged with distinct angles, two source-bound SVG visuals each, tracked links to real public microsites, and `evercraft.clip.social-publish-request.v1` objects. These are DRAFTS.

The existing Clip runtime `systemia/clip/social-publisher-runtime.mjs` only accepts an explicitly approved authorization reference and a verified adapter. All seven handoffs intentionally set `authorization.approved=false`; a future provider publishing operation must create its own issuer-backed authorization, verify the canonical public page, validate suitable platform credentials, and record the resulting real provider post URL and timestamp. The existing Space Dudz and CFB authorizations are strictly scoped and **must not be reused** for these sites.

Each post must originate from a source that viewers care about. Existing groups and niche communities require explicit permission and useful contribution, never mass link drops or fake personas. Adult distribution is a separate legal and provider compliance lane, and these family-facing creatives never direct traffic to adult content.

## Practical distribution partnerships by niche

- PartScout: repair publishers, parts/restoration groups that permit educational posts, dealer newsletters. Lead with a real model-and-measurement checklist.
- Value Scout: collectors' creators and enthusiast newsletters. Lead with resale math and tell viewers to verify sold comps.
- Playbook Lab: original coaching explainers on authorized channels, independent sports publishers. Teaching models remain synthetic.
- Site Rescue: business operators and referral partners. Show a plausible *modeled* lead leak, not fake customer results.
- Ad Story Studio: local business video creators and media publishers. Share the storyboard prompt rather than pretending a commercial has been rendered.
- Publisher Lab: owner/operator newsletters and publishers. Explain that ad RPM estimates are hypotheticals.
- Meeting Relay: project-management communities and agency newsletters. Leave human review and participant acknowledgement intact.

## Verification ladder

1. Asset in GitHub `public/`: **produced**, not published to social.
2. GitHub Pages GET succeeds: **owned web page published**, not proof of a view.
3. Clip verified adapter, approved brand/channel, provider ID and canonical post URL: **social publication verified**.
4. Platform-sourced analytics with campaign link tagging: **legitimate reach measured**.
5. Affiliate/contract/order verification and authoritative settlement: **revenue received**.

No pay-per-click spending, paid affiliate claim, adult material, unconsented account access, unsolicited mass outreach, or unapproved identity association.
