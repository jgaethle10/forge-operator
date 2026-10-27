# Fallen Commercial Three Format Render and Review Gate

**Purpose:** one client-approved source-first assembly renders into three separate exact-media masters using manually reviewed framing, with evidence that people can inspect.

Inputs must already pass APPROVED-COMMERCIAL-RENDER.md, including genuine source footage, owned or licensed audio, approved voice takes, original score and approved timed SFX.

## Invocation

    node --import tsx systemia/media-studio/commercial-variants.mjs ./my-three-format-batch.json ./artifacts/spot-preview plan
    node --import tsx systemia/media-studio/commercial-variants.mjs ./my-three-format-batch.json ./artifacts/spot-render render

Input schema:

    {
      "schema":"evercraft.fallen.commercial-variant-batch.v1",
      "assembly": {"schema":"evercraft.fallen.commercial-assembly.v1", "...":"Full approved assembly; brief.formats must include all three"},
      "framing": {
        "16:9":[{"sceneId":"hook","focalX":0.5,"focalY":0.5,"reviewRefs":["owner-framing-review-123"]}],
        "1:1":[{"sceneId":"hook","focalX":0.4,"focalY":0.5,"reviewRefs":["owner-framing-review-124"]}],
        "9:16":[{"sceneId":"hook","focalX":0.2,"focalY":0.5,"reviewRefs":["owner-framing-review-125"]}]
      }
    }

The example shows the hook only. An executable brief requires **exactly one framing decision per scene** in original order for each format.

0 means crop toward the left/top, 1 toward the right/bottom, and .5 center. Decisions and review reference identifiers are externally supplied declarations, not proof that a person actually inspected the output. All values must be finite within [0,1]. The renderer no longer silently applies center cropping when the three-format lane is used.

The render output has these directories:
- horizontal-16x9
- square-1x1
- vertical-9x16

Each has its own actual rendered MP4, two-pass AAC mastering receipt, master QC, final commercial loudness/peak QC, digest-bound Clip intake manifest and JPEG screenshots extracted at each scene midpoint from the **final encoded output**.

The root variant-review-pack.json lists all actual MP4 paths and hashes, all frame paths and hashes, framing decisions, and the review checklist. It deliberately records releaseState = blocked_pending_human_review and humanApproved = false.

### Why this matters

Automatically center-cropping horizontal source footage to a vertical frame can leave the customer or actual service out of picture. Explicit focal positions fix the geometric risk, but do **not** establish picture quality or guarantee captions/graphics are in platform safe areas. Every result still requires operator review on a real screen, appropriate audio playback, independent rights confirmation and client signoff.

### CI versus customer proof

CI uses synthetic FFmpeg color/test-image movies and oscillator audio to exercise **actual MP4 encoding and exact final-file QC** across all three formats. The CI artifact is engineering evidence only; it is not a commercial, no service quality is depicted, the generated tones are not human voice, and no customer approval occurred.

No paid media generation, third-party API, transfer of private customer footage, automatic Clip publishing, payment or release is authorized by this lane.


## Offline customer review desk and independent integrity verification

After a three-format render, use the actual local proof bundle, not a reconstructed upload or unverified links:

    node systemia/media-studio/commercial-review-desk.mjs verify ./artifacts/spot-render/variant-review-pack.json
    node systemia/media-studio/commercial-review-desk.mjs gallery ./artifacts/spot-render/variant-review-pack.json ./artifacts/spot-render/review-desk.html

Open the resulting review-desk.html from the same local directory containing the video folders. It has native full-playback video controls for all three formats and all actual JPEG review captures, plus the human evaluation checklist. No JavaScript, network calls, publishing action, or AI-generated substitute is required.

The verification gate checks:
- Exact SHA-256 of all three encoded H264/AAC MP4s and each captured JPEG
- Frame JPEG type, each shot-to-framing identity and the complete three-format set
- Actual video/audio codec, dimensions and expected duration via FFprobe
- The exact final MP4 hash and path bound to Clip media intake, audio QC and the two-pass mastering receipt
- Explicit continued blocking of release and Clip publication authority

It does not detect whether a client looks good, whether the captions are visually safe, whether the narration sounds natural, or whether the supplied review/rights references are genuine. Those need human verification.

A separately collected human decision may be recorded, without conferring publishing authority, using:

    node systemia/media-studio/commercial-review-desk.mjs attest ./artifacts/spot-render/variant-review-pack.json ./artifacts/spot-render/human-review-evidence.json ./human-review-decision.json

The decision is a JSON object with schema evercraft.fallen.commercial-human-review-decision.v1. It includes a nonblank reviewerId, a reviewedAt ISO time, the exact packDigest from verify, and three entries in reviewedMedia of the shape { "format": "16:9", "sha256": "..." } (same for 1:1 and 9:16). The checks object sets each of the six named humanReviewRequirements from the pack to true, and the acknowledgement value must be exactly:

    I personally reviewed all three final encoded videos and their evidence frames.

The tool records the self-attestation and validates that the specifically named bytes still exist unchanged. It does not authenticate the reviewer's identity, independently observe the review or authorize customer delivery, platform publication or payment. A separately authorized real-world release process remains mandatory. An invalid, missing, stale or mismatched acknowledgment is rejected.

CI warning: The automated synthetic fixture test exercises this viewing and integrity machinery with oscillator audio. The test's synthetic reviewer declaration is test data, not a human review or license certification. Only actual paid-client or owner-approved media can be used to demonstrate creative quality.


## Mobile-first commercial subtitles (source and screen preflight)

For commercial deliveries, approved SRT captions are checked before video assembly for sequence numbers, monotonic cue timing, no overlaps, total runtime, maximum two lines, per-line width, non-markup text and excessive reading speed. The same SRT is preflighted separately for 16:9, 1:1 and 9:16. Portrait text has a stricter width limit, so a horizontal layout that passes does not automatically authorize the phone edition.

The explicitly commercial-only timeline setting captionStyle = commercial_safe applies calibrated FFmpeg/libass subtitle positions. Existing ordinary and narrative-film timeline projects retain their previous subtitle behavior.

At 1080x1920, captions sit about 78-79% down the full frame, leaving a substantial gap above the lower app-interface zone. Square and widescreen get their own calibrated positions. The subtitle font is approximately a 50px actual on-screen glyph at 1080px output width, with white high-contrast lettering and a dark outline. These are internal engineering safe bands, not claims of exact compatibility with every TikTok, Facebook or Instagram UI overlay. Brand fonts and wording still require visual approval.

Test with:

    node --import tsx --test systemia/media-studio/commercial-captions.test.mjs systemia/media-studio/commercial-caption-render.test.mjs

The second test renders actual subtitles against a black video using FFmpeg and asserts the visible caption ink stays within per-format review bounds. Actual commercials still need playback on physical phones and an owner/client viewing decision. The optical test doesn't prove the words are tasteful, the font is the best brand choice, or all future platform UI overlays are clear.
