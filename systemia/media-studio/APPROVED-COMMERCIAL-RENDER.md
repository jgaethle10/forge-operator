# Fallen approved commercial assembly and render v1

This lane turns a source-first customer commercial brief and **actual owner-approved, licensed, locally available media files** into an editable Fallen Timeline, and can run Fallen's commercial renderer/QC to output an MP4.

It does not create pictures, voice performances, musical compositions or sound-effect recordings. Those must exist as verified source files before final rendering. Saban's 14-role creative council produces proposals and rejection criteria; the production crew or connected, explicitly authorized providers must produce and approve real media.

## Commands

Requires Node 22, npm dependencies with tsx, FFmpeg and FFprobe.

    node --import tsx systemia/media-studio/commercial-assembly.mjs ./approved-assembly.json ./artifacts/my-spot plan
    node --import tsx systemia/media-studio/commercial-assembly.mjs ./approved-assembly.json ./artifacts/my-spot render

Plan writes commercial-editable-project.json and does not render.

Render creates a real MP4, render receipt, master QC receipt, commercial audio QC receipt, and Clip intake manifest through finalizeStudioDelivery() with qualityMode: commercial. It also writes commercial-render-receipt.json. The final audio gate checks the actual encoded media bytes, not merely requested mastering settings.

Both modes fail on missing rights declarations, missing or changed file bytes, wrong voice script, unlocked voice profile, invalid clip timing, inadequate source duration, unavailable score/SFX, or missing reviewed SRT subtitles when narration exists.

## Assembly contract

    {
      "schema": "evercraft.fallen.commercial-assembly.v1",
      "brief": { "...": "A full, valid evercraft.fallen.commercial-brief.v1 object; see SOURCE-FIRST-COMMERCIAL.md" },
      "format": "16:9",
      "fps": 30,
      "destinations": ["youtube"],
      "title": "Client-approved campaign title",
      "description": "Approved factual offer",
      "language": "en",
      "approvedAudio": {
        "voices": [
          {
            "sceneId":"hook",
            "scriptText":"Exact line from the brief",
            "voiceProfileId":"approved-voice-profile",
            "offsetSec":0.1,
            "durationSec":2.5,
            "path":"/absolute/path/approved-voice-take.wav",
            "sha256":"SHA256_HASH",
            "rights":"owned",
            "sourceRefs":["source-receipt"],
            "reviewRefs":["owner-listen-review-id"]
          }
        ],
        "music":{
          "path":"/absolute/path/licensed-or-original-score.wav",
          "sha256":"SHA256_HASH",
          "rights":"licensed",
          "sourceRefs":["music-rights-receipt"],
          "reviewRefs":["owner-score-review"]
        },
        "sfx": [
          {
            "sceneId":"proof",
            "atSec":5.3,
            "durationSec":0.4,
            "path":"/absolute/path/approved-spot.wav",
            "sha256":"SHA256_HASH",
            "rights":"owned",
            "sourceRefs":["sfx-rights-receipt"],
            "reviewRefs":["owner-sfx-review"]
          }
        ],
        "captions":{
          "path":"/absolute/path/approved-captions.srt",
          "sha256":"SHA256_HASH",
          "rights":"owned",
          "sourceRefs":["caption-script"],
          "reviewRefs":["caption-human-review"]
        }
      }
    }

Supply exactly one selected narration take per voiced scene, with the exact corresponding script. Provide a full-length score and exactly one matched sound effect for every scheduled sound spotting cue. All referenced inputs must exist on the execution host. The score target is currently -16 LUFS with a -1.5 dBTP requested limiter, subject to actual final measured commercial QC. Some content may fail QC and require remixing.

## Critical limitations

- Rights, human review, and source descriptions are declared through receipt references; the program does not independently authenticate those declarations or listen to the media. It verifies file hashes, stream types, timing and the technical render.
- The real MP4 is not itself proof of a world-class commercial. Cinematography, voice casting, music, taste, pacing, material honesty, small-speaker audition and final customer approval remain necessary.
- This does not authorize paid provider generation, external outreach, platform publishing, payment or release to a customer.
- The integration test creates synthetic FFmpeg fixtures only to verify real encoding, sound mixing, captions and the exact Clip-admission gates. Test fixtures are never represented as production client work.
- Each destination/format is a separate render and requires its own final measurement and viewing review. No 9:16 cropping quality guarantee is inferred from a 16:9 render.

## Next production proof

Use owner-licensed real customer footage, approved music and voice/SFX stems, and SRT captions to produce a complete 30-second master. Run Visual Observer/Shot Tournament and record human viewing/listening review before allowing the Clip publication gate. This is the verified exit criterion for issue #1619.
