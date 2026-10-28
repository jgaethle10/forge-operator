# EPS RC02: Real performance capture intake

This is an executable pathway from owner-cleared field recordings to an **actual Fallen preproduction plan**, not a rendered commercial. The standard is Relay RC35, and the prior EPS RC01 slideshow remains rejected.

## The six exact shots for one documented EPS job (30 seconds total)

| Time | Shot | Required source and sound |
|---|---|---|
| 00–05 | Actual EPS crew member surveys an outdoor job | A real person visibly speaking into the shot: "There's some work to do out here." Original **embedded** spoken audio, live motion, job and person permissions |
| 05–09 | A second natural human crew beat | Real person visibly speaking: "Alright. Let's get after it." Original embedded speech, not dubbed TTS |
| 09–14 | Real cleanup action | Rake, debris, grass, or other activity actually done on that same job; original location sound |
| 14–19 | Close-up craftsmanship | Real hands and tools performing physically meaningful work, not a camera move over a still |
| 19–26 | Truthful completed-job reveal | Same documented job, real action in frame, no fake before/after |
| 26–30 | Natural moving EPS ending | One clear video action suitable for logo, address/site and final spoken line: "Evercraft Property Services. Your property, taken care of." Last line requires a separately approved voice take |

Do not force an employee or customer to perform an endorsement. Both on-camera speeches are **scripted** and require informed talent consent. A document link claiming consent is *not* independent legal proof. If the footage depicts another property or different job, don't splice it into a fake transformation.

## Capture suggestions

On a recent iPhone, use the native Camera app at 4K/30fps (1080p/30 is acceptable), rear camera, steady handheld or tripod, no digital zoom, and natural daylit exposure. Keep subjects comfortably inside central 9:16 safe area when recording horizontally for 16:9 and 9:16 outputs. Have speakers face mostly toward camera and record near the phone, with equipment powered down for their lines. Allow one second of room tone before and after each line, and keep source takes unedited. For work shots capture actual tool action, not posed static pictures. Collect an extra 10–20 seconds of outdoor ambience and isolated tool sounds for the mix.

No creator should impersonate a customer or give a fabricated endorsement. Gather actual rights, crew consent and property/customer permission before using identifiable subjects. If those elements are absent, **hold**.

## Inputs to the executable intake

Run `node systemia/media-studio/eps-real-performance-intake.mjs /private/eps-intake.json /private/eps-rc02-receipt` on an authorized machine with the six raw MP4s in place.

Manifest shape:

```json
{
  "schema":"evercraft.eps.real-performance-intake.v1",
  "productionId":"eps-rc02-owner-reviewed",
  "actualEPSJobRef":"OWNER_PRIVATE_JOB_ID",
  "verifiedEstimateUrl":"https://YOUR-VERIFIED-EPS-ESTIMATE-PAGE",
  "clips":[
    {
      "sceneId":"site-first-look",
      "path":"/private/eps/site-first-look.mp4",
      "mediaType":"real_recorded_video",
      "rights":"owned",
      "motionVerifiedByHuman":true,
      "commercialUseApproved":true,
      "epsJobRef":"OWNER_PRIVATE_JOB_ID",
      "clientJobPermissionRef":"PRIVATE_DOCUMENT_REF",
      "propertyFilmingPermissionRef":"PRIVATE_DOCUMENT_REF",
      "personConsentRef":"PRIVATE_DOCUMENT_REF",
      "sourceRefs":["PRIVATE_CAPTURE_RECEIPT"],
      "reviewRefs":["PRIVATE_HUMAN_VISUAL_AND_RIGHTS_REVIEW"],
      "observedSubjects":["speaking-human","visible-human-action"]
    }
  ]
}
```

Supply six distinct clip entries using these exact IDs: `site-first-look`, `crew-response`, `clear-the-space`, `work-the-detail`, `reveal-the-work`, `moving-signoff`. For the last four, `observedSubjects` must include `visible-human-action`; for the first two it must include both `speaking-human` and `visible-human-action`. Every clip showing a person needs a consent reference.

## What the computer verifies, and what it cannot

The intake hashes each actual source file, rejects duplicate/reused footage and missing real-job permission declarations, checks actual video stream/duration/framerate/resolution, compares decoded moving frames and **requires embedded audio** for speaking scenes. It then emits Fallen's 30-second source-first plan, six governed creative jobs, a source ledger, voice audition directions, music and sound cue maps, and a gated receipt.

The code **cannot** tell whether an actor's mouth really said the script, whether the job or rights evidence is genuine, whether the edit is beautiful or whether a composed score sounds excellent. Those require independent review. An accepted intake is *preproduction ready*, not customer-approved film, not a rendered MP4 and not Clip publishing authority.

No paid GPU rental, video generation, voice synthesis, publishing or local hardware action occurs through this code. Real clips are still needed. Output remains private until approved.
