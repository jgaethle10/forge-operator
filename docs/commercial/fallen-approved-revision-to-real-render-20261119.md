# Fallen | Approved revision to real encoded master (2026-11-19)

## Goal

Close a missing engineering gap between **a real customer review note** and an **actual rendered, technically accepted MP4** while preserving the prior timeline. This adds an operator-local integration atop already-owned Evercraft source, **not another renderer**.

The source of truth is still the existing:
- Preview Desk review note
- Timeline Version Vault
- \`stagePreviewNoteHandoff\` with explicit operator approval
- \`runShotTournament\` and its eight judge/verified observation contracts
- \`replaceTimelineClipAsset\` for only the selected picture clip
- \`finalizeStudioDelivery\` for actual FFmpeg H264/AAC encoding and \`assessStudioMaster\` QC
- \`saveTimelineVersion\` to append a new version **only after** the encoded output and master QC succeed, and the original vault head has not changed during rendering.

## Operator-only entrypoint

\`\`\`bash
node --import tsx systemia/media-studio/approved-revision-render.mjs \
  /private/evercraft/revision-render-job.json
\`\`\`

The job contains \`context\` (the already existing private Preview Desk roots and manifest), \`noteId\`, \`proposalPacket\`, \`expectedBridgeDigest\`, \`operatorApprovalReference\`, \`tournamentInput\`, \`winnerRelativeMediaPath\`, \`operatorRightsRefs\`, \`operatorVisualReviewRefs\`, \`snapshotScopeReference\`, and a new \`outputDir\` under a private operator-controlled root. The output directory must not exist yet. All \`private:\` references are **operator assertions**, not authenticating digital signatures or automatic legal rights proof. Never commit this job or private paths/media to GitHub.

The \`tournamentInput\` must be a source-evidence-bearing \`evercraft.fallen.shot-tournament-run.v1\` input with at least two candidates and actual observed review score references. The selected winner must refer to a local MP4 under the private media root with an exact SHA-256 file hash, valid video stream, required duration and matching format. The candidate identity/shot/need must match the staged existing Saban candidate request, and the original video clip must not be locked.

**On success:** A real H264/AAC MP4, an exact master QC receipt, a render receipt and a non-publishing Clip intake manifest are written to the private output directory. The approved changed clip is appended to the existing timeline version vault only after technical QC acceptance. The previous timeline, original source assets and approved clips remain recoverable. The output marks \`PRIVATE_RENDER_TECHNICALLY_ACCEPTED_PENDING_HUMAN_REVIEW\`.

**On failure:** The source timeline and vault head stay unchanged. Any partial output is **not** customer delivery. The output directory should be inspected and cleaned by an authorized operator.

## CI verification

Run:

\`\`\`bash
node --import tsx --test systemia/media-studio/approved-revision-render.test.mjs
\`\`\`

This test produces *actual encoded MP4 files* using FFmpeg, real AAC audio from an oscillator, verifies the note-to-Saban-to-tournament binding, performs an FFmpeg render with master QC, checks output bytes/stream codecs and retains both vault versions. The workflow uploads final MP4 and QC receipts as a synthetic-only 14-day artifact.

**The CI clip is a generated test pattern and oscillator.** It establishes a functioning transport/render/QC/versioning path, not human creativity, camera quality, real actor rights, Bella voice performance, actual audience effectiveness or a deliverable client commercial. Judge observations and rights assertions in the test are synthetic fixtures. The generator does not automatically produce new shot options; it only admits already-created and reviewed footage.

## Remaining release gates

A real pilot still needs owner-approved authentic source shots, sound and captions, independently verified rights, actual visual observation receipts, real Shot Tournament admission, audio listening and visual review, mobile playback QA, client signoff, commercial audio QC and export, authenticated private access, and authorized delivery. A successful technical render grants **no** checkout, external publication, or automatic Clip distribution.

Preserve Evercraft-owned-only infrastructure: GitHub canonical, Systemia/Saban for orchestration, and no Base44 or other third-party production runtime.
