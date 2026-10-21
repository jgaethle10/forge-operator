# Fallen documentary preflight (proposal)

## Intent
A separate **local review tool**, deliberately downstream of asset selection and upstream
of an authorized Clip publish. It does not replace existing Fallen Studio master QC,
narrative-film admission, shot tournament, the independent visual observer, licensing,
or a human editor. No provider calls, no payment, no social publication, no runtime deployment.

The Nebraska pilot exposed two separate problems: earlier browser previews depended
on external assets and did not play reliably, and synthetic imagery could be mistaken
for evidence of particular games. This preflight audits those failure modes.

## Run
Requires Node 22 and local `ffmpeg` and `ffprobe`:
```sh
node --test systemia/media-studio/documentary-preflight.test.mjs
node systemia/media-studio/documentary-preflight.mjs \
  /path/to/documentary-review.json /path/to/final.mp4 /path/to/report.json
```
The CLI writes a report even when editorial or portability checks reject. Exit code 1
means a blocker. It never emits a release or publication authorization.

## Input
The review JSON has schema `evercraft.fallen.documentary-preflight-input.v1` and:
- `project`: canonical `evercraft.fallen.timeline.v1` with a tracked picture timeline
- `editorialReviewerRef`: named human-review record reference, **not a fabricated approval**
- `claims`: `{id,text,sourceRefs,reviewState,reviewerRef}` for each factual claim
- `scenes`: one per video/overlay clip, binding `clipId`, `assetId` and
  `assetSha256` to the timeline; each has `portrayal` of `actual_event`,
  `archive`, `illustration`, or `synthetic`, `claimIds`, and
  `rights:{status,evidenceRef,usageScope}`
- For `actual_event`: `eventRef`, `eventDate`, `captureDate` (same day)
- For `archive`: `captureDate` is mandatory
- For AI scenes: `disclosureText` and `disclosureReviewRef` are mandatory.

**Important:** metadata and named refs are only assertions. The program cannot
authenticate a Creative Commons license, inspect the underlying source article,
independently substantiate a claim, or verify that disclosure really appears on screen.
Thus even a complete preflight is `preflight_complete_human_review_required`, **not**
`publish_ready`. It never grants publishing authority.

## MP4 portability
The media step checks existence, SHA-256 if supplied to the library API, top-level MP4
boxes and faststart order, H.264 video, AAC audio, minimal usable dimensions, and full
FFmpeg decode. `technically_accepted_device_playback_unverified` is the highest
possible media status. It cannot claim real iPhone/browser playback or viewer access.

## Integration boundary
The existing Studio delivery and Clip publish gates remain authoritative.
Attach this report to editorial review, then only route after separate clearance
of rights, facts, visual QC, creative quality and explicit founder authorization.
Do not integrate an auto-publish path.
