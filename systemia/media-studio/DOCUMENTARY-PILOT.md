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
