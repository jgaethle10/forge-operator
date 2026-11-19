# Fallen | Harbor source footage qualification on NextGen

Status as of **2026-11-19**: operator-local source and tests, **not** proof of a transferred real customer batch. The first-customer private Harbor transfer still requires its own independently verified receiver and authorized transport. See \`docs/commercial/HARBOR-FALLEN-FIRST-PRIVATE-TRANSFER-20261119.md\`.

This stage is the shortest path from **12 private customer media files on an owned Evercraft receiver** to an inspectable Fallen source shortlist. It reuses \`scripts/nextgen/verify-harbor-private-media-import.mjs\` and does not copy private customer media to GitHub, third-party services, or a public web endpoint.

## Two independent gates

1. **Bytes and receiver.** Actual Harbor manifest and the NextGen receipt must agree on filename, size, exact SHA-256, source media type and receiver hostname. Every file is rehashed on the receiving machine before contact frames are prepared. A sender-supplied receipt cannot become an authenticated receiver or a rights approval.
2. **Operator source review.** Optional private per-file decisions are \`hold\` (default), \`exclude\`, or \`consider\`. \`consider\` requires actual human-supplied rights and visual-review evidence references, subject descriptions and allowed story roles. The program checks syntax and hashes, **not the authenticity of a person's identity, the visual claims or a license**. Previously rejected source digests are excluded. No automatic thumbnail scoring or content authenticity claims.

## Private operator review file

Keep filenames and this entire file on the owned NextGen workstation. Example is illustrative and deliberately incomplete:

~~~json
{
  "schema":"evercraft.fallen.private-operator-review.v1",
  "projectId":"private-customer-project",
  "operatorRef":"private:real-operator-reference",
  "excludedPreviousAssetDigests":[],
  "perAsset":{
    "asset-001.mp4":{
      "decision":"consider",
      "rights":"owned",
      "rightsEvidenceRef":"private:actual-rights-receipt",
      "operatorReviewRef":"private:actual-human-viewing-record",
      "subjects":["description actually observed in reviewed footage"],
      "roles":["hook","proof"]
    },
    "asset-002.jpg":{"decision":"exclude"}
  }
}
~~~

All omitted files default to HOLD. Valid roles: \`hook\`, \`proof\`, \`payoff\`, \`cta\`, \`support\`. Avoid false testimonial, before/after, person-identity and worker-endorsement claims. Exact private file paths, source subjects, photos, and rights stay off public GitHub.

## Command on authenticated owner-controlled NextGen

Only **after** the 12-file receiver-side verification has really passed and the receipt exists locally:

~~~bash
node systemia/media-studio/harbor-private-media-qualify.mjs \
  /private/harbor-transfer/manifest.json \
  /private/harbor-transfer/assets \
  /private/harbor-transfer/receiver-receipt.json \
  /private/fallen/operator-source-review.json \
  /private/fallen/empty-source-qualification-output
~~~

Outputs under the private, newly created \`0700\` directory:

- \`contact-frames/source-001.png\` etc, one 640x360 FFmpeg frame per image/video, file permissions 0600, to be visually judged by an authorized operator.
- \`private-media-qualification.json\`, including exact SHA-256, ffprobe codec/dimensions/duration/audio presence, individual HOLD/CONSIDER/EXCLUDE states, and a partial \`sourceAssets\` array ready for an operator to map into the preexisting source-first commercial brief.

Readiness states: \`NEEDS_OPERATOR_SOURCE_REVIEW\`, \`NEEDS_APPROVED_REAL_VIDEO_HOOK\`, or \`REVIEWED_SOURCE_CANDIDATES_AVAILABLE\`. Even the highest is **not production admission**, no approved storyboard, no commercial render, no human consent assurance, no audio review, no customer authorization, and no publish/send/payment authority. The opening requires a genuinely reviewed moving-video subject; the script will not turn a static shot into a fictitious on-camera performance.

The existing approved source-first commercial workflow still requires actual scenes, offer/CTA, timed voice takes, score, source rights, and human production review before a commercial-quality FFmpeg render. Use \`systemia/media-studio/commercial-assembly.mjs\` and the original customer preflight, not this source shortlist as an implicit final master.

## Proof and limitations

~~~bash
node --test systemia/media-studio/harbor-private-media-qualify.test.mjs
~~~

CI creates real small test-pattern MP4 and PNG files, exercises actual FFprobe and FFmpeg contact frame extraction, and validates good, stale, rejected, corrupted, symlinked, and missing-evidence cases. Those fixtures are **not** a customer video, licensed commercial photography, a filmed human, or a creative-quality pass.

No Base44 or third-party hosting/runtime added. GitHub remains canonical, with execution and customer permissions governed by Systemia.
