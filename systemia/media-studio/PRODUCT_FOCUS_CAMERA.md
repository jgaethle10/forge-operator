# Fallen product camera | evidence-bound direction

**Status: engineering candidate. Not a film, not an AI-video generator, not a publication approval.**

Fallen's Product Focus compiler now supports source-relative camera keyframes on an existing, provenance-tagged screenshot or video. This prevents the old pattern of embedding an entire desktop UI as an unreadable rectangle inside a portrait presentation.

## Production entry

```bash
npm run media:studio -- product-focus \
  systemia/media-studio/fixtures/relay-product-focus.json \
  /tmp/relay-camera.stage.json /tmp/relay-camera.receipt.json
npm run media:studio -- stage \
  /tmp/relay-camera.stage.json /tmp/relay-camera.html
```

For distributed exact-frame rendering, use the resulting stage with the private Fallen Render Worker and an SHA-256-verified `asset://` manifest. Do not give the private renderer a public HTTP media link or an unscoped filesystem path.

## Camera contract

- `focus` nominates the initial subject rectangle in **original source pixels**.
- Optional `focusPath` has 2 to 12 strictly increasing `t` positions from 0 to the full shot duration. Each position names the content and narrative **action** it should communicate and the subject region it follows.
- Source windows interpolate in the original image. The full image is not stretched, and typography overlays do not move with the crop.
- The compiler rejects invalid geometry, out-of-bounds source regions, mismatched start frames, empty action labels, and a zero-change camera path.
- Optional `protectedRegions` explicitly identify text or visual evidence that a human editor requires fully visible at nominated times. The compiler rejects paths that crop these regions at those moments. This is geometric protection, **not** OCR, automatic semantic recognition, or a guarantee that text is legible at phone size.
- A native Visual Stage validator and the independent private render-worker validator reject unbounded camera paths, out-of-order keyframes, distorted crops, and paths that extend outside the authorized source.

## Relay benchmark

Use the real local pilot capture with fictional participants. Direct visual attention to the pair of conflicting November 2 interpretations, the detected structured contradiction, then the human approval form. This is a three-way camera movement, **not three independently generated scenes**. Do not claim that the system understands human communication semantically: Relay v0.1 detects structured milestone differences through deterministic comparisons.

A local Python rendering canary tests the *geometry* of the shot; it is explicitly not proof that Fallen's Chromium worker produced a final video. GitHub CI independently checks the real compiler, HTML render hooks, CLI-to-HTML proof and private render-worker policy. Exact rendered pixels and small-type legibility still require human review.

## Release boundary

Mark a source-focused camera result as `candidate_requires_visual_review`. Audio sync, brand rights, genuine acting, environment continuity, target-device legibility, and end-to-end native-render output quality are unverified. No creative score, release authorization, or AI-generation quality claim follows from passing this contract.

Next: verified native rendered frame pair at 0s and 6s; shot-to-shot continuity; film audio synchronization; phone-scale content readability; then Creative Council review before Clip intake.

## Native Chromium parity and pixel proof (October 19)

A production audit found that `visual-stage-html.ts` supported source-relative crop/camera movement while the private worker's independent `render-worker/runtime.mjs` ignored `sourceWindow` and `sourceWindowKeyframes`. This meant compiler and worker policy tests could pass although an exact Chromium frame showed no directed crop. The private runtime now supports the same bounded crop and camera interpolation as Visual Stage.

The private worker CI runs three *actual* Chromium frame renders over a deterministic, entirely synthetic red/green/blue source bitmap. A dependency-free Node PNG fixture generator, decode routine and receipt verifier inspect the RGB center pixel of each PNG, require distinct frame SHA-256 values, reject console errors, and confirm asset-scoped SHA-256 verification and zero external network authority.

This is **synthetic rendering evidence only**. It demonstrates working source camera movement and protects against runtime regression. It does not prove readability of real Relay product copy, a final MP4, film sound quality, native Kennedy Space Station handoff, or cinematic merit. Preserve the output frame receipts in the CI artifact when the workflow passes.

The earlier static local camera preview and an exported PNG pixel-proof serve different purposes. Do not use one as a substitute for the other.

## Phone-scale source admission (October 19)

The local Relay pilot has a 1440 x 2408 desktop screenshot and a native 390 x 3170 responsive phone capture. The pilot stylesheet uses 14px base text. In the earlier 1010px-wide portrait evidence viewport, a 1019.2px source-width desktop crop projects that text to approximately **5.0px** at a 390px viewing width. The mobile source at a 386.04px crop projects the same 14px-height text to approximately **13.2px**. This is a geometric planning estimate, not an OCR result or a measured end-user comprehension score.

`criticalText` lets an editor annotate a source-region, source glyph height, and minimum target display height. The compiler checks that the region remains in frame and rejects the projected text if it falls below the annotated minimum (default 9px). No source font height is guessed by the program. `targetPhoneWidthPx` defaults to 390px.

`protectedRegions` now supports a single time `t` **or** an interval `startSec`/`endSec`. An interval checks the interpolated camera window at every native 30-fps frame instant plus interval endpoints, blocking an important region that disappears between two safe keyframes. This is time-sampled geometric protection, not a proof of legibility/contrast at every possible subframe.

**Source-selection recommendation:** for legible mobile product closeups, prefer a capture made at the device layout rather than shrinking an entire desktop screenshot. Missing source-context, privacy restrictions, synthetic content disclosure, final pixel review, and accessibility/contrast checks remain separate gates. The app UI is the real private pilot, not a published/customer-ready release.
