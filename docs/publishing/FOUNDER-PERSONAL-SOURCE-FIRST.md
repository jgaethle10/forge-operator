# Founder personal publishing | mandatory source-before-copy gate

**Purpose:** Prevent the failure observed during the November 20 Hubble conversation, when a new caption was written without reading Evercraft's existing standards and a fabricated "two paragraphs under 100 words" rule was presented as canonical.

## Canonical materials that MUST be retrieved on every new personal post

The actual source and example files are, in order:

1. `docs/publishing/HARBOR-EDITORIAL-AND-CUSTOMER-COMMS-20261119.md`: exact editorial character, channel separation, media-rights and release checks. Explicitly states there is **no mandatory paragraph count**.
2. `docs/creator/FOUNDING_DISTRIBUTION_RECOVERY_20261115.md`: founder Look Closer / Field Notes / Build Log / Week in Motion identity, factual personal voice, privacy boundaries and creator vs corporate separation.
3. `distribution/boardroom-public-launch-kit.md`: evidence-led field reporting, developed natural paragraphs rather than marketing slogans, **no specified paragraph number**.
4. `distribution/marketing/evercraft-research-launch-20261029.md`: publishing standard and channel-specific source/visual/link behavior.
5. **Actual revised founder Facebook sample**, under heading `### Personal Facebook, for founder to share manually` in `distribution/marketing/boardroom-executive-chamber-20261029.md`. This is an established **revised example**, not evidence of live publication or a 10/10 human editorial review.

These files remain independent authorities. **This new guard is not a substitute or a new writing style.** It reads those files from disk every time, checks their required content, hashes the actual example section and returns source receipts. Missing/mutated authorities or absent example means **HOLD**. Never work from an unverified memory of the standards or an invented length rule.

## Human editorial sequence for every creator post

1. Select the real-world observation and why **today's event** warrants attention. Check original source date vs event date, primary evidence, competing explanations, and any still-projected outcomes. For Hubble, agency forecasts and calls for proposals must never become a scheduled rescue or guaranteed impact date.
2. Read all five documents, including the correct founder Facebook sample, **before writing**.
3. Draft in founder first-person Look Closer / Field Notes / Build Log / Week in Motion voice using a specific observation, the real-world tension and what would be worthwhile for the reader to think about. Respect family/customer privacy, avoid stagey inspiration, boilerplate, artificial suspense, hashtag campaigns, paragraph-splitting tricks or forced brevity. No corporate sales pitch unless it authentically belongs.
4. Produce a private `evercraft.creator.personal-post-candidate.v1` packet with exact copy, claims/source URLs, source-check timestamps, source truth states, uncertainty qualifications appearing verbatim in copy, substantive personal angle, attempted visual search and usage/rights evidence. No customer or family secrets in the packet.
5. Run `node systemia/creator/founder-editorial-preflight.mjs /private/exact-post-packet.json` on an owned repository checkout. The tool **only reads** local authority documents and the specified packet; stdout is a redacted gate report, never the draft. It does not call or post to Facebook.
6. If `REVISE_BEFORE_EDITORIAL_REVIEW`, correct the source/style/rights gap and rerun. If `READY_FOR_INDEPENDENT_EDITORIAL_REVIEW`, **a real editor must still review the exact copy and source claims, founder voice, prose rhythm, visual rights and platform suitability.** The model's metadata does not prove true facts or independent review, and string checks cannot measure whether a story is actually good.
7. The founder's personal profile remains **manual founder-owned publishing** unless a separate, explicit real account-scoped publisher authority exists. Corporate Meta Page permissions DO NOT authorize personal profile posting. Do not claim a post or first comment is live without actual native provider ID, timestamp and permalink/readback.
8. After posting, study observed engagement, quality replies and performance only if real personal-account analytics are available. Connected ChristmasLightsUSA Metricool data is unrelated to founder-profile performance. Do not invent "what performed best" or optimize blindly.

## Exact contract example (synthetic test packet, never a real social post)

```json
{
  "schema": "evercraft.creator.personal-post-candidate.v1",
  "story_id": "founder:example:source-verified-001",
  "surface": "facebook-personal",
  "format": "look-closer",
  "copy": "A complete, original personal narrative that meets the current verified facts and authentic creator voice requirements. The writer chooses natural paragraphing and does not manufacture a word-count formula.",
  "angle": {
    "why_now": "An actual, independently checked development changed the public question today.",
    "personal_observation": "A real first-person observation the founder could genuinely make, subject to his review.",
    "real_tension": "The competing considerations make the decision interesting rather than artificially urgent.",
    "reader_value": "Give the reader concrete context and a better question worth considering."
  },
  "sources": [
    {
      "id": "primary:example",
      "url": "https://www.nasa.gov/",
      "kind": "primary",
      "checked_at": "2026-11-20T18:00:00.000Z"
    }
  ],
  "claims": [
    {
      "claim": "A specific statement supported by an actually checked named source",
      "truth_state": "attributed",
      "source_ids": ["primary:example"]
    }
  ],
  "media_search": {"attempted": true},
  "media": {"usage": "no-safe-media", "reason": "No licensed or owned media has yet been verified."},
  "publish_state": "DRAFT_NOT_PUBLISHED",
  "personal_voice_owner": "FOUNDER_TO_REVIEW",
  "autopost_authorized": false
}
```

The above URL and copy are **illustrative structure**, not an example of completed source verification or a publishable post. An output report with no blockers means only that machine-checkable omissions and certain generic style errors were caught. It NEVER asserts an editor read the draft, that anyone fetched the cited webpage, or that personal Facebook approved publication.

## Tests and drift defense

Run `node --test systemia/creator/founder-editorial-preflight.test.mjs tests/boardroom-social-campaign.test.mjs`.

The dedicated `Evercraft founder personal editorial authority` GitHub workflow reruns on code, guide, original standards or original example updates. It tests: missing/wrong canonical files, replaced founder example, invented 100-word/two-paragraph rules, chopped prose, em dashes, And-openers, hashtag campaigns, fake motivational closer, missing or invalid source/claim links, forecast qualification, genuine visual sourcing, and fabricated publication approvals.

**Important:** The source/CI gate can protect owned creator packets when it is invoked. It cannot, by itself, force a fresh ChatGPT conversation to retrieve GitHub documents or guarantee every AI-generated answer automatically passes. The publishing workflow must invoke it or explicitly follow the same source-before-copy discipline. If the connector cannot retrieve policy, hold the draft rather than pretend the rules were read.

## Existing boundaries

- Journal: `systemia/newsroom/editorial-claim-preflight.mjs` and independent 10/10 editorial gate; do not weaken or replace.
- Harbor approved company Facebook Page story: `systemia/distribution/harbor/gravity-story-gate.mjs` with separate Page authority, visual rights and provider receipt; never reuse personal publisher permission.
- Founder personal Facebook: separate founder creator preflight and final personal approval. No auto-post from this module or GitHub Actions.
- Source policy never grants photo/video reupload rights by mere attribution; use approved native share or verified rights clearance.
