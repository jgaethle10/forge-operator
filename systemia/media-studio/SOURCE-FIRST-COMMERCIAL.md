# Fallen Source-First Commercial Planner

Customer creative starts with **real verified footage and the client's brand**, not a generic synthetic poster that we try to turn into an advertisement.

The planner creates a timecoded 30-second story and the necessary governed Saban assignments. It is not a render engine, an image/video model, an online storage layer or a claim that a provider has produced music or voiced the script.

## Invocation

    node systemia/media-studio/commercial-shotlist.mjs ./my-customer-brief.json ./artifacts/my-commercial-plan
    node --test systemia/media-studio/commercial-shotlist.test.mjs

This requires the actual file bytes to exist on the executing machine. Source media digests and rights must be present. A missing, modified, recycled, or rights-unverified asset blocks planning. The opening must show a licensed/owned real video subject, with an explicit hook. Shot subjects must already be represented in the selected asset's supplied subject manifest (which still requires human visual verification before customer delivery).

## Brief contract

    {
      "schema":"evercraft.fallen.commercial-brief.v1",
      "id":"customer-spot-001",
      "brand":"CUSTOMER BUSINESS NAME",
      "audience":"customer segment",
      "offer":"a truthful customer-approved CTA",
      "durationSec":30,
      "formats":["9:16","16:9","1:1"],
      "excludedPreviousAssetDigests":[],
      "sourceAssets":[
        {
          "id":"real-opening",
          "path":"/approved/customer-real-action.mp4",
          "sha256":"SHA-256 hex digest of actual source file bytes",
          "mediaKind":"video",
          "rights":"owned",
          "evidenceState":"observed",
          "sourceRefs":["signed-intake:SOURCE-001"],
          "subjects":["visible-human-action"]
        }
      ],
      "scenes":[
        {
          "id":"hook",
          "beat":"hook",
          "durationSec":3,
          "assetId":"real-opening",
          "intent":"Show real service and movement immediately",
          "mustShowSubjects":["visible-human-action"],
          "voiceLine":"A compelling opening line.",
          "voiceMood":"warm, curious and conversational",
          "scoreEnergy":0.3,
          "scoreMood":"curiosity",
          "sfxCues":[{"atSec":0.8,"description":"physically justified sync sound"}]
        }
      ]
    }

The illustrative fragment above is not executable until a full 3-or-more-scene, exactly 30-second plan is supplied with valid source hashes and all real files available. Final scene must be CTA. The preferred voiceLine must be short enough to fit the selected beat; 3 words per second is the hard planning ceiling, not permission to deliver fast artificial speech. Saban voice direction requests three auditions per spoken beat.

Outputs:
- source-first-plan.json with exact timestamps, SHA-256 provenance, roles and release gates
- saban-creative-inventory.json for 14-role Saban creative execution
- voice-auditions.json to direct and evaluate natural narration
- music-cue-map.json with score energy and intended emotional arc
- sound-spotting-sheet.json for synchronized effects, not generic whooshes

## Important authority boundaries

- Rights and claimed subjects are supplied by the brief and not independently legally certified by this tool. The planner verifies source file hashes, not depicted objects or permissions.
- Output is planning material, never a finished MP4. The receiving Saban creative adapter produces direction notes, not music or visual assets.
- A later renderer must verify input footage codecs, actual subject representation, editorial quality, voice casting, score originality and scene-level sound design.
- Finished commercial MP4 must use Fallen qualityMode: commercial and pass bound loudness/master QC plus an actual human creative approval before release.
- No live paid inference, server deployment, automatic publishing, or customer contact is authorized.

For an operational proof of proposed role execution, run Saban after planning:

    node systemia/saban/multiplier.mjs --software fallen-creative-council --inventory ./artifacts/my-commercial-plan/saban-creative-inventory.json --agents 56 --workers 4 --execute --reconcile

Example above assumes four shots (4 × 14 = 56) and valid owned/local permissions; change agent count when there are more shots.

## Explicit customer-photo commercial mode (not source-camera footage)

A small local business may supply permission-cleared project photographs rather than
moving video. The default `real-video-first` admission remains unchanged. To plan
an honest photograph-led commercial, set `sourceMode: "customer-photographs"` and
`photoSourceTruthAcknowledged: true` in the brief, and choose a genuine observed
image for the hook (with owner/client rights receipt and SHA-256). Its opening scene
must declare `stillMotionTreatment: "editorial-camera-only"`.

This is **editorial camera movement across a still photo**, NOT recorded worker motion,
a before/after assertion, a live-action source, or evidence of generated video.
The returned timeline records `videoFirst: false` and
`motionOrigin: "editorial-crop-of-still"`; Saban gets a corresponding
`editorial-camera-on-still` instruction. The result also requires a narration plan,
`photoOnlyMotionTruthReviewRequired` and all existing voice, music, sound, client
and publishing gates. Customer-photo mode is forbidden as a way around the separate
EPS Relay-floor standard.

For locally owned Bella audio **auditions**, see
`systemia/media-studio/voice-foundry/bella_native_audition.py`. It requires
preinstalled native Kokoro and locally cached, reviewed weights and creates only
private unapproved WAVs and receipts. Do not put customer scripts or photos in
public GitHub. Finish with approved voice and music in the existing Fallen
commercial assembly and customer commercial release gate.
