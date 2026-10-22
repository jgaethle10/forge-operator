# Fallen Observational Motion Review

This is an **optional diagnostic**, not an auto-editor, video model, source authenticator, beauty model or publishing authority. It responds to the founder's rejection of the Nebraska Study 04 as a synthetic, music-led picture montage.

## What actually runs
`observational_motion.py` decodes local video frames with OpenCV, tracks real pixels between time-separated samples, models the common pan/zoom/roll of each sampled scene with RANSAC, and reports the minority of picture motion not explained by that camera transform. It is intentionally a *conservative proxy for independently moving contents*, not proof of actors, filmed contact, cinematography or even real footage: multilayer animation or AI videos can also pass.

An editor supplies independent `requiresIndependentMotion` expectations for specific shots. The tool **does not decide what narrative story the shot should show** or infer required action from words in a prompt. If a shot requires independent motion but lacks measured evidence in most sampled pairs, the report rejects. It also reports measured counts and per-pair residuals for human inspection. A missing picture is not silently represented by a stock still.

Input schema: `evercraft.fallen.observational-motion-input.v1`, example:
```json
{"schema":"evercraft.fallen.observational-motion-input.v1","shots":[
 {"id":"line-of-scrimmage","startSec":0,"durationSec":3,"requiresIndependentMotion":true},
 {"id":"deliberate-photo-hold","startSec":3,"durationSec":2,"requiresIndependentMotion":false}
]}
```

Run on any real, local master:
```sh
python -m pip install numpy==2.2.6 opencv-python-headless==4.11.0.86
python systemia/media-studio/observational_motion.py master.mp4 shot-intents.json motion-report.json
python -m unittest discover -s systemia/media-studio -p test_observational_motion.py -v
```
Exit 1 means *a declared motion expectation has not been met*. A deliberately held archival photograph can be valid art if the editor marks it accordingly. Failures must prompt review, not automatically force synthetic action.

## Existing Nebraska benchmark, October 20, 2026

The 22.5-second **Opening Study 04** (original synthetic storyboard art; externally edited, not native World Engine) was assessed using five timed camera-shot intervals. All **5/5** failed the expectation of independent scene action; the sampled residual-motion fractions were at most 0.0042 in that local run. File SHA-256: `8e416edee10e205f87002436287939ba900d784b9f149b1591026eda2b10f04a`.

This is an honest *negative regression reference*. The video isn't checked into GitHub; CI separately creates two exact local footage fixtures: static scenery and a moving foreground with independent pixel trajectories. Static rejects, foreground passes, and both retain `publicationAuthorityGranted:false` and `sourceAuthenticityNotProven:true`.

## Caveats and authority
- Weak textures, motion blur, compression, little movement, micro-shots and camera parallax can fool the heuristic.
- Global affine compensation is approximate, not 3D visual odometry or semantic action recognition.
- A moving CGI character can pass, without being real, licensed, credible or narratively relevant.
- No transcript, camera metadata, audio ducking, dialogue, rights, authentic 2026 Nebraska footage or score quality is verified here.
- **Even a passing scene needs** actual source lineage, rights, original context, creative observation and founder editorial release.
- This adds to existing Fallen film admission and documentary preflight #1437, and remains review-only in Nebraska draft #1473. No automatic Clip publishing.

**Next production proof:** source-cleared live-action Nebraska material with genuinely observable events, authorized natural interview/field audio, and directed passages of silence. Use this report to reject motionless imitations, never to certify storytelling quality.
