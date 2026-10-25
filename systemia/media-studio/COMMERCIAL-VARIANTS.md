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
