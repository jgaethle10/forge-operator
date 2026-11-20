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

## Systemia → Harbor automatic source-reference handoff (source integration)

When founder commentary originates in a verified Systemia evidence stream (e.g. AAAR, TOWI, FAIE, Rockies), `systemia/newsroom/systemia-harbor-upstream.mjs` now exposes `prepareSystemiaFounderCreatorReview()`. This is the **integration** between the existing authenticated upstream projection callback boundary and the canonical founder preflight above. It calls the existing `prepareSystemiaHarborCandidate()` first and the real `preflightFounderPersonalPost()` second. The two checks are deliberately separate: **upstream fact/source authority is not founder editorial authority, and neither is Meta personal-profile authority.**

The future authorized Systemia resident supplies verified producer registration, an actual source receipt bound to its revision, and a real independently verified public-safe projection. Without those trusted callback verifiers, the handoff **always holds**. The founder draft must bind the exact upstream source department, mission ID, artifact ID, revision and receipt reference, and every factual claim must use an `upstream_claim_id`, the original cited URL, a truth-state no stronger than its source, and an exact `copy_span` found in the proposed caption. The preflight refuses extra model-invented source URLs and facts. A preview from another source revision cannot silently be reused.

A passing response is a **redacted** candidate containing only source identity, exact-copy digest, policy/example file hashes and the human-review next step. It never emits or transmits the personal narrative and never asserts live Harbor ingestion, independent editorial acceptance or personal Facebook publishing. This cannot yet automatically enforce itself inside an external Harbor agent: live resident invocation and signed source verification remain a separate deployment requirement. Plain first-person experiences without an upstream research mission may still use the canonical founder preflight directly.

## Next stage: signed inbox → existing Systemia Intake Fabric, no second queue

The source adapter at `systemia/newsroom/founder-editorial-intake.mjs` now takes the **actual owner-private 0600 packet and separately provisioned trust file**, calls this owner's existing two-actor signed inbox preflight, and then submits an **inert, redacted** candidate to `EvercraftIntakeFabric`. There is no new reviewer queue, outbound publisher or direct third-party host. It requires an independently existing Passport `intake.write.agent` grant for the named owner adapter, **including on duplicate retries**. It never grants the Passport scope for itself. A distinct Harbor reader must hold `intake.read` for the exact candidate. The reader returns local review readiness only; no live Harbor network pickup ACK is inferred.

The Intake content reference and fingerprint bind the original signed packet digest, verified source revision, founder exact copy hash, five canonical policy file hashes and the actual reviewed founder example digest. No original creator prose, NASA source URL, signer's keys, partner/customer data or post text is added to the Intake ledger. The stored source trust state remains `untrusted_external` because signed source provenance does not make a draft safe instructions. Model-supplied trusted callbacks cannot enter the adapter; it reads the original owner-installed trust material through `inspectOwnedHarborFounderPacket()`.

The resident/operator API is:

```js
import {stageOwnedFounderEditorialIntake,inspectFounderEditorialPickup}
  from './systemia/newsroom/founder-editorial-intake.mjs';

// From the ACTUAL authorized owner host only. Private paths are illustrative.
const stage=stageOwnedFounderEditorialIntake({
  packetFile:'/owner/private/editorial/source-packet.json',
  trustFile:'/owner/private/systemia/trust-anchor.json',
  intakeStateDir:'/owner/private/systemia/intake',
  passportStateDir:'/owner/private/systemia/passport',
  adapterActorRef:'adapter:approved-systemia-editorial'
});
// A separate Passport-authorized reader may inspect the exact candidate:
const read=inspectFounderEditorialPickup({
  candidateId:stage.candidateId,
  expectedContentFingerprint:stage.contentFingerprint,
  intakeStateDir:'/owner/private/systemia/intake',
  passportStateDir:'/owner/private/systemia/passport',
  readerActorRef:'adapter:approved-harbor-editorial'
});
```

Do not execute this as a production workflow until those owner paths and real grants actually exist and are verified. The functions do not issue or bypass grants. The API does not send a packet to Harbor's remote account or make Meta calls. A private local read is not a remote authenticated Harbor pickup or final editorial review.

Run `node --test systemia/newsroom/founder-editorial-intake.test.mjs systemia/newsroom/harbor-founder-owner-inbox.test.mjs` on the owned source checkout. The shared `.github/workflows/systemia-harbor-upstream.yml` includes the full source, signed-owner, Intake/Passport and canonical founder regression suites. CI uses **generated synthetic keys only**, never owner real credentials or media.

**Remaining production handoff:** install the new adapter in the authenticated local Systemia resident, prove an actual signed owner packet from an approved department, provision independent key trust and Passport grants, read the intake candidate from real authorized Harbor and write a genuine signed pickup/ACK to the existing audit system. These have not been proven by a GitHub merge.
