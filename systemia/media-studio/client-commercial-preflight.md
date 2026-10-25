# Evercraft || Fallen Studios: client commercial preflight

This is an **internal fail-closed evidence gate**, not checkout, payment, client delivery, or automatic publishing. The introductory 30-second offer is not hardcoded into the quality policy.

## Before production

1. Confirm the client's exact audience, business, offer, CTA, channels, aspect ratio and scope in writing. Don't accept confidential assets through public comments.
2. Storyboard at least three beats: opening hook, grounded business evidence, and CTA. Beat durations must total the client's agreed duration.
3. For every final-master asset (footage, logo, music, graphics, generated content), retain its unique asset ID, commercial-use license/permission evidence, and a real human review. Customer permission to deliver a video is separate from permission for repeated promotional reuse.
4. Confirm revisions, turnaround, and any on-location filming or paid providers separately. A $50 offer does not grant third-party spending authority.

## Production and QA

- Use the existing Fallen Creative Council, Shot Tournament, production-grade checks and source/identity continuity safeguards.
- Finish with Fallen Timeline Export and standard Master QC. Preserve the exact master SHA-256, video dimensions, duration, FPS, input asset IDs and existing production receipts.
- Run independent final-audio inspection on the same rendered bytes. Existing Fallen commercial audio lab and the newer inspection receipt both use the commercial-audio-qc.v1 schema. The client-release gate recognizes the lab's sha256 field or the inspection gate's masterSha256 field and requires measured loudness (-18 to -14 LUFS), peak <= -1 dBTP and exactly one audio stream. Listen on a phone for voice realism, pronunciation and music balance.
- Run final-picture inspection on the exact master using the storyboard beats. The 4fps luma difference scan looks for long static runs and low-motion stretches by beat, but does NOT prove visual beauty or realism. If motion review is required, record a named creativeReview.visualExceptions entry with beatId, reason, evidenceRef and reviewedBy. Conduct a human creative review confirming brand accuracy, real subject visibility, mobile readability, motion and continuity, factual claims, mix quality, natural voice (when narration exists), and a clear CTA.
- Execute the separate client-commercial release preflight using JSON input. See the executable generic fixtures in the tests for the complete shape.

## Operator commands

    node systemia/media-studio/commercial-audio-qc.mjs ./private/master.mp4 ./private/audio-qc.json
    node systemia/media-studio/commercial-visual-qc.mjs ./private/master.mp4 ./private/storyboard.json ./private/visual-qc.json
    node systemia/media-studio/commercial-release-preflight.mjs ./private/order-preflight.json ./private/release-preflight.json
    npm run test:media-studio

The release input schema is evercraft.fallen.client-commercial-release-input.v1 and includes order, storyboard, renderReceipt, masterQc, audioQc, visualQc, productionGrade, rights, creativeReview, and clientApproval; clipManifest and promotionalReuse are optional.

## Interpretation

- **blocked:** technical, creative, timing, rights or scope evidence absent, rejected or inconsistent.
- **ready_for_client_preview:** internal gates pass; client approval is still outstanding.
- **reviewed_for_delivery:** client's approval evidence is present, but external delivery, shipping, publishing, posting, payment or provider generation still require the preexisting explicit authority controls.

CLI exit 0 = not blocked, 2 = blocked with reasons, 1 = bad input/runtime failure. The report binds render, technical QC, audio QC and optional Clip manifest to the same final-master SHA-256. An operator-supplied rights declaration is **not** independently authenticated by this code; verify original rights evidence before production and delivery.

## Promotional reuse

Commercial-delivery approval never silently becomes portfolio permission. Periodic reposts or local business spotlights require separate explicit promotional reuse consent and evidence, with the agreed channels and any withdrawal requirements respected.

## Limits

The gate does not itself detect phoneme sync or visual identity drift, establish license validity, grant publication authority, accept payment, send client videos, run a Saban swarm, or perform a cinematic render. Those remain separate governed production stages.

## One-command first-customer gate (preferred)

Use the existing Fallen studio delivery to render the master MP4 and produce render, master QC and Clip-intake receipts. Then store the **private** order brief and human-review evidence as one local JSON document with schema evercraft.fallen.client-commercial-gate-request.v1. Keep customer information out of GitHub and social comments.

The JSON document contains studioDelivery with videoPath, renderReceiptPath, masterQcReceiptPath and clipManifestPath; order, storyboard, rights, productionGrade, creativeReview and clientApproval. Paths may be relative to the private request file. See the executable fixtures in customer-commercial-gate.test.mjs for the structure.

    node systemia/media-studio/customer-commercial-gate.mjs ./private/customer-request.json ./private/customer-preflight.json

The command verifies the three existing receipt paths against the actual video, performs final-audio mastering inspection without altering the video, performs beat-specific final-picture motion inspection, and combines the results with rights, visual-coverage, creative review and customer-approval requirements. It writes an operator-readable JSON decision and exits nonzero when blocked. It **does not** render new content, copy customer media to GitHub, send the preview, request payment, or grant publication authority. A client-approved case still requires explicit operator delivery through governed Evercraft Clip/Shipping.
