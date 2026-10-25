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
- Run independent final-audio inspection on the same rendered bytes. Check LUFS and true peak; listen to the final version on a phone for voice realism, pronunciation and music balance.
- Conduct a human creative review confirming brand accuracy, real subject visibility, mobile readability, motion and continuity, factual claims, mix quality, natural voice (when narration exists), and a clear CTA.
- Execute the separate client-commercial release preflight using JSON input. See the executable generic fixtures in the tests for the complete shape.

## Operator commands

    node systemia/media-studio/commercial-audio-qc.mjs ./private/master.mp4 ./private/audio-qc.json
    node systemia/media-studio/commercial-release-preflight.mjs ./private/order-preflight.json ./private/release-preflight.json
    npm run test:media-studio

The release input schema is evercraft.fallen.client-commercial-release-input.v1 and includes order, storyboard, renderReceipt, masterQc, audioQc, rights, creativeReview, and clientApproval; clipManifest and promotionalReuse are optional.

## Interpretation

- **blocked:** technical, creative, timing, rights or scope evidence absent, rejected or inconsistent.
- **ready_for_client_preview:** internal gates pass; client approval is still outstanding.
- **reviewed_for_delivery:** client's approval evidence is present, but external delivery, shipping, publishing, posting, payment or provider generation still require the preexisting explicit authority controls.

CLI exit 0 = not blocked, 2 = blocked with reasons, 1 = bad input/runtime failure. The report binds render, technical QC, audio QC and optional Clip manifest to the same final-master SHA-256. An operator-supplied rights declaration is **not** independently authenticated by this code; verify original rights evidence before production and delivery.

## Promotional reuse

Commercial-delivery approval never silently becomes portfolio permission. Periodic reposts or local business spotlights require separate explicit promotional reuse consent and evidence, with the agreed channels and any withdrawal requirements respected.

## Limits

The gate does not itself detect phoneme sync or visual identity drift, establish license validity, grant publication authority, accept payment, send client videos, run a Saban swarm, or perform a cinematic render. Those remain separate governed production stages.
