# HAVENLY | The Feeling of Home: verified real-footage intake

This is executable pre-production, not a synthetic video masquerading as a customer commercial. Seven owner-authorized real video sources become a 30-second source-first Fallen timeline, Saban scene work orders, rights ledger, draft SRT and separately listed music, voice, Foley and branding requirements.

## Locked sequence

| Time | Scene | Genuine footage requirement |
| --- | --- | --- |
| 00:00-00:04 | arrival | Door opens and real keys contact a surface |
| 00:04-00:08 | counter | Cleaner hand visibly wipes a counter |
| 00:08-00:12 | water | Actual running water in a sink |
| 00:12-00:17 | bedding | Hands pull bedding neatly into position |
| 00:17-00:22 | room-reveal | Real room finished in natural daylight |
| 00:22-00:26 | care-detail | Real team work detail; no unapproved Nikki likeness |
| 00:26-00:30 | ending | Real interior to support later verified brand/logo and CTA |

Voice begins at 22 seconds. Natural human performance lines: "Come home to a space that feels cared for." and "Havenly Cleaning. Come home to a haven." Audition three emotional performances of each, then choose. Music: original intimate felt piano and acoustic strings, 76-84 BPM, with keys, cloth, water and bedding recorded Foley. Current music, SFX and approved actual performance recordings remain missing.

## Execute on an authorized owned computer with the real videos

Create a private input JSON:

    {
      "schema": "evercraft.havenly.live-footage-intake.v1",
      "productionId": "havenly-oct26-v2",
      "clips": [
        {
          "sceneId": "arrival",
          "path": "/private/owned-footage/arrival.mp4",
          "mediaType": "real_recorded_video",
          "rights": "owned",
          "commercialUseApproved": true,
          "propertyFilmingPermission": true,
          "peopleVisible": false,
          "containsNikki": false,
          "representsHavenlyJob": false,
          "sourceRefs": ["private-rights-document"],
          "reviewRefs": ["owner-footage-review"]
        }
      ]
    }

The sample shows ONE clip; supply seven entries in the scene order above. Every clip must be a distinct valid video of adequate runtime with declared commercial/property rights; if it shows people, personConsentApproved must be true. If it includes Nikki, nikkiLikenessPermission must be true. If described as a genuine HAVENLY job, clientJobRepresentationPermission must be true. These fields are attestations, not independent verification.

    node systemia/media-studio/havenly-real-footage-intake.mjs ./my-private-havenly-input.json ./work/havenly-real-v2

Outputs: real-file SHA-256 rights ledger, seven-shot source-first plan, seven Saban creative jobs, 30-second scene timings, voice audition sheet, original music score map, foley spotting sheet, original brand/audio requirements, draft subtitles and preproduction receipt.

Fails closed on absent/too-short media, wrong kind, reused footage, missing commercial/property or person consent, unsupported real-job claims. Original assets remain local, and no remote upload, paid generation or publishing occurs.

## Remaining requirements before the first actual customer-quality commercial

Verify the images really depict each promised scene; obtain real approved logo/CTA, natural narrated takes, score and Foley. Render three formats with Fallen's actual approved commercial assembly, inspect on physical phones and record genuine human/client creative approval. The draft 9:16, square and 16:9 outputs are NOT produced by this intake program. Commit to GitHub does not deploy or execute on the owner's HP/Chromebook; local media and authorized execution are still required.
