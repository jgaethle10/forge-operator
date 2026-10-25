# Fallen Commercial Audio Lab v1

Commercial postproduction guard for Evercraft / Fallen. Technical audio acceptance is not creative or publication approval.

## What it actually does

- Inspects the exact audio stream and hashes the exact file.
- Measures integrated LUFS, true peak (dBTP), loudness range, and silent passages using FFmpeg.
- Rejects missing/silent, too quiet, too loud/over-peak, or excessive-gap material.
- Masters an existing MP4 with both video and audio using measured two-pass EBU R128 loudnorm; video is stream-copied and audio is encoded at 48 kHz AAC 256 kbps.
- Measures the encoded output again, refusing to release or overwrite the target if QC fails.
- Reports receipts that do not grant creative, rights, source, or publication approval.

The defaults are a working Evercraft social-commercial house target, not a universal broadcaster standard: -16 LUFS ±1.5 LU, at most -1.0 dBTP, silence run at most 1.25 seconds. Mastering targets -1.5 dBTP to leave headroom for AAC overshoot. Client/platform variants may require separate approved policies. Intentional dramatic silence requires explicit policy review rather than silent bypass.

## Commands

Requires Node 22, ffprobe, and ffmpeg on PATH.

    node systemia/media-studio/commercial-audio-lab.mjs audit --input finished.mp4
    node systemia/media-studio/commercial-audio-lab.mjs master --input draft.mp4 --output mastered.mp4
    node --test systemia/media-studio/commercial-audio-lab.test.mjs

An audit rejects with exit code 2. The master command does not overwrite previous output and has no auto-publishing path. Use --expected-sha256 DIGEST to pin source identity.

## Human creative gates remain mandatory

Picture: real/factually appropriate subject, art direction, readable composition, convincing motion, tasteful editing, no template feel.

Performance: natural first line, credible voice casting, convincing inflection/emotion, correct pronunciation, no synthetic uncanny cadence.

Music: composed around the brand and edit, distinct motif, convincing production and instrumentation, purposeful rise and release, legitimate rights.

Sound design: concrete sync effects, tasteful ambience, transitions, impact only where deserved, dialogue never buried.

Final release: source licensing/provenance, client claims, picture approval, multi-device headphone/speaker listening, captions, destination format, and owner publish gate.

The existing Saban Creative Council can fan creative work across roles; this module only implements the final technical audio measurement and correction boundary. It does not start a remote worker, invoke paid audio providers, or claim that agents have auditioned the mix.

Future integration: call auditCommercialAudio as a required gate for commercial MP4 delivery, and retain receipt alongside existing master-qc receipt. Avoid calling every video release-ready until both technical and human gates pass.


## Real commercial Clip handoff integration

Fallen finalizeStudioDelivery now recognizes qualityMode: "commercial". When selected it:
1. Renders the actual MP4;
2. Runs the existing picture/codec master gate;
3. Runs this commercial audio lab against the final encoded MP4;
4. Writes <slug>.commercial-audio-qc.json, requiring ACCEPTED with a digest matching the render receipt;
5. Includes the bound commercial audio QC receipt path in the Clip intake manifest.

A rejected or unmeasured commercial cannot claim ready_for_clip_intake. This mode does not perform automatic re-mastering, as the owner must accept all mix changes. Set project.audioMaster.targetLufs to the approved destination target, review the audio, and re-render when needed.

Legacy standard and narrative_film modes preserve their existing admission behavior and do not silently claim commercial-audio approval. Commercial mode is explicitly opted into by the caller; no existing clients are automatically migrated.
