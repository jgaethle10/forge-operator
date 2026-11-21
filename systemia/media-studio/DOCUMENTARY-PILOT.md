# Fallen Studios: documentary pilot admission

Engineering preview for issue #1874. This is a **private media-intake bridge**, not a new video renderer, a customer contract, or a finished documentary. No footage, personal data or real client approval is in this public repository.

## Purpose

Reuse ForensiScope's authorized-source validator for real media bytes, hash integrity, symlink rejection and admitted-root restrictions. Require explicit permission to **edit** and **privately preview**, provenance records, a privacy review and documentary claim classification. Pass accepted media to the existing Fallen Timeline/render/QC flow only after separate human review. Systemia remains the mission authority. No paid provider, hosted service, upload, checkout, publication or outbound contact is invoked by this script.

## Private manifest example (replace placeholders)

This example is **not** an actual rights record. Store real manifests and releases outside GitHub.

    {
      "schema":"evercraft.fallen.documentary-intake.v1",
      "projectId":"private-project",
      "targetDurationSec":60,
      "sources":[{
        "id":"camera-01",
        "kind":"original_camera",
        "source":{"path":"/private/media/clip.mov","sha256":"sha256:REPLACE_WITH_EXACT_64_HEX_DIGITS"},
        "authorization":{
          "confirmed":true,
          "scope":"documentary_postproduction",
          "authorized_by":"PRIVATE_RIGHTS_HOLDER",
          "confirmed_at":"2026-11-05T00:00:00Z"
        },
        "permission":{
          "permittedUses":["documentary_edit","private_client_preview"],
          "evidenceRef":"PRIVATE:WRITTEN_LICENSE"
        },
        "privacyReview":{"status":"cleared","evidenceRef":"PRIVATE:PRIVACY_REVIEW"},
        "provenance":{"captureDateState":"unknown","recordRef":"PRIVATE:CAMERA_ORIGIN_LOG"}
      }],
      "claims":[{
        "id":"claim-01",
        "kind":"firsthand_account",
        "text":"Example attributed statement only",
        "sourceIds":["camera-01"],
        "onScreenAttribution":"Statement attributed to speaker"
      }]
    }

If capture date is known, use "captureDateState":"known" with "capturedAt". Do not invent timestamps or locations. For an independently sourced public record, use "kind":"public_record" and a specific "evidenceRef"; factual authenticity is still subject to a human source check. Claims labeled "unverified_claim" and "opinion" require on-screen attribution.

## Operator commands

    node systemia/media-studio/documentary-intake.mjs \
      ./private/documentary-manifest.json \
      ./private/documentary-receipt.json \
      /private/media

- Exit 0 means ready for **private editing only**, NOT client approval.
- Exit 2 means blocked by missing or inconsistent intake evidence.
- Exit 1 means invalid usage or I/O error.
- Receipts must stay private, not in public GitHub or Clip.
- A declared license, authorizer identity or privacy clearance is **not independently authenticated by software**. Human verification is required.
- Test fixtures are 1-second synthetic FFmpeg media used solely for gate verification, not proof of an excellent cinematic deliverable.

## Next hard readiness gate

1. On owned Node002/approved node, run actual FFmpeg/FFprobe and ForensiScope strict doctor with a durable receipt. Node002 in shadow mode is not assumed to accept remote execution.
2. Obtain explicitly authorized genuine moving footage and verify each right and source.
3. Complete a 45–60-second source-led narrative with properly attributed claims, original/cleared score, reviewed captions and creative direction.
4. Pass actual master and audio/visual QC, full-phone playback, source hashes, rights review and client approval. Link evidence to #1619 and #1874.
5. Verify separately scoped price, contract, checkout and secure delivery. The public $50 social commercial does **not** price documentary production. No client assets are reused in public showcases without separate written permission.

**NO-GO for a claimed customer-quality paid documentary teaser until those real-world gates pass.**

## Documentary encoded-master preflight (new)

The second gate reads the **actual encoded MP4**, probes video/audio with FFprobe,
measures **final AAC** integrated loudness and true peak with FFmpeg EBU R128,
and binds those measurements to SHA-256 of the exact final master. It requires
45–90 seconds, H.264/AAC, 24–60 fps, exactly one video and audio stream,
-18 to -14 LUFS, and true peak at or below -1 dBFS. Internal synthetic proofs
require a 720px short edge; a genuine authorized client preview requires 1080px.

Place this JSON in a **private** file, with the actual master's SHA-256:

    {
      "schema":"evercraft.fallen.documentary-master-preflight.v1",
      "classification":"internal_spec",
      "declaredSyntheticOrFirstParty":true,
      "expectedSha256":"REPLACE_WITH_64_HEX_DIGITS"
    }

Then run:

    node systemia/media-studio/documentary-master-preflight.mjs \
      ./private/master.mp4 \
      ./private/master-manifest.json \
      ./private/master-qc-receipt.json

For an `authorized_client_preview` classification, an independently verified
`rightsAuthentication`, `privatePreview` client consent, successful private
`intakeReceipt`, human `editorialReview` and named `creativeReview` full-playback
evidence are additionally required. Software verifies the presence and shape of
those declarations, **not their authenticity**. A passing status is only
`ready_for_client_review`, never an authorization to send, invoice, publish,
or reuse privately supplied video in the portfolio.

The targeted workflow generates a real 45-second **synthetic FFmpeg test pattern**
solely to verify encoding, exact-master measurement, positive internal state,
and fail-closed release checks. The test pattern is **not** field footage,
an approved demo reel, a polished documentary, or evidence of an owned-node run.
A separately produced local original motion-graphics spec can inform visual
direction but cannot close #1619's real-media acceptance criterion.
