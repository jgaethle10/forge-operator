# FIRST-CONTACT-001 | Pixel measurement uncertainty and camera calibration gate

**November 15, 2026 | Research software, not a verified physical measurement**

## Why this gate exists

Two projected image rays can meet cleanly and still indicate a false 3D location. Errors arise before triangulation when a target center is measured a pixel or two away from the correct position, and when a focal length, lens calibration, or camera pose is wrong. The new `pixel-error-sensitivity.mjs` simulates these effects under **explicitly invented assumptions**.

It performs synthetic forward projection from a known ENU target into two rectified camera models, adds *independent Gaussian image-center localization noise* and optionally a shared pixel offset and shared focal-scale bias, then returns to a 3D estimate using the existing `pixel-bearing.mjs` and `triangulation.mjs` modules.

The output reports accepted/rejected ray solutions, the reasons for rejecting them, and median/P95/maximum 3D position error **only among accepted synthetic solutions**. The results cannot be treated as confidence bounds for real video.

## Reproducible software check

Run from a checkout of `research/first-contact-uap-001`:

```sh
node --test systemia/research/first-contact/*.test.mjs
node systemia/research/first-contact/pixel-error-cli.mjs systemia/research/first-contact/fixtures/pixel-error-random-only.json
node systemia/research/first-contact/pixel-error-cli.mjs systemia/research/first-contact/fixtures/pixel-error-shared-focal-bias.json
```

Both files contain **invented** cameras, target positions, source pixels and error assumptions. They are not photographic or scientific evidence.

The invented setup uses a 3-meter transverse camera baseline and stationary reference target approximately 10 meters ahead, with 1280×720 rectified images and 800-pixel focal lengths. The first scenario assumes 0.25-pixel independent image-location noise, the second assumes zero random noise but 5% shared focal-length error. In the latter case, rays can agree closely and still give a wrong physical range. This is a *known-failure software demonstration*, not a measured property of any real camera.

## Before real field results may be trusted

1. **Measure camera optics.** For each camera, record the actually calibrated focal length, principal point, distortion correction and any scaling/cropping/focus/zoom changes. `rectifiedImage: true` is not evidence that correction was done.
2. **Measure target localization scatter.** Estimate target-center uncertainty in actual rectified video from repeated annotations or a validated detector, retaining the source frame references. An assumed 0.25-pixel sigma has no physical authority unless measured.
3. **Test systematic errors independently.** Re-check focal calibration, principal-point shifts, roll/pitch/yaw camera alignment, and surveyed optical centers. Repeated image detections cannot diagnose every shared bias.
4. **Verify clocks and identity.** Both images must truly correspond to the same known stationary target, with camera capture time and camera identity independently established.
5. **Predeclare budgets before capture.** Choose required accuracy, maximum ray miss, minimum parallax, maximum rejection fraction and minimum sample count, then retain externally verifiable evidence of when those limits were fixed.
6. **Run the existing field code.** Process genuinely measured, rectified pixels through `pixel-calibration-cli.mjs`; run `field-evidence-cli.mjs` against the local source file hash manifest. Do not upload the native video to public GitHub.
7. **Require an independent reviewer.** The reviewer checks survey ground truth, optics, clock synchronization, annotations and original records before any field-accuracy status is asserted.

## Interpretation safeguards

- `SYNTHETIC_PLANNING_ONLY` means only the assumptions and geometry have been stress-tested; it does not mean a camera is ready.
- P95 from a filtered synthetic population must be reported **with its rejection fraction**, not as unconditional 95% coverage.
- A larger camera baseline may reduce range sensitivity to small image errors under a fixed geometry, but cannot repair a false calibration, mismatched frames or incorrect target identity.
- This simulation covers independent Gaussian pixel noise, fixed common pixel offsets and common focal-scale errors only; it omits lens distortion, intrinsic cross-covariance, temporal jitter, rolling shutter, real pose/survey uncertainty, atmosphere, actual detector errors and all unmodeled systematics.
- No physical footage, live camera, Systemia agent, independent field survey or evidence of unusual propulsion is included in this push.

**The real next milestone is still physical:** two permitted calibrated cameras observing an independently surveyed known stationary marker, a reproducible transformation from *actual* image pixels to ENU positions, and a separate review of achieved error versus predeclared tolerances. An operator-edited JSON assertion is not independent proof.
