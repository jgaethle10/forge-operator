# Evercraft commissioned video-editing evaluation: source-bound pilot specimen

**State:** Internal technical specimen for scoping. **NOT a completed customer commission, dataset, editing trajectory, approved public reel, transferable license, or TimelineBench-compatible delivery.**

## Why this exists
A prospective buyer asked whether Evercraft could supply newly commissioned short-form video editing evaluation tasks. This document demonstrates the *format-level verification plan* that can be independently inspected before a paid task is agreed. Buyer acceptance schema, ownership, task count, annotated trajectories, human editor review, budget and licensing are **unresolved**.

## Real source available for a private rights review
- Artifact: `fallen-internal-original-real-ui-source` from [GitHub Actions run 40267553373](https://github.com/jgaethle10/forge-operator/actions/runs/40267553373), artifact ID `12629457263`.
- MP4: `evercraft-studio-actual-site-visual-source_1080x1920.mp4`.
- SHA-256: `9f39fc6a6266ac53017c253de94aa87e37c7d7b55c8afb64f4ca40515383fdb3`.
- Receipt reports 18.4 sec, 1080×1920, H.264, 30 fps, silent, four real browser scenes.
- **Release label from source receipt:** `INTERNAL_REAL_UI_CAPTURE_REVIEW_ONLY`; `client_portfolio_approved=false`; `paid_campaign_authorized=false`; `release_state=REJECTED_FOR_PAID_PORTFOLIO_UNTIL_OWNER_CREATIVE_REVIEW`.
- All assets/usage rights require an explicit review before any customer handoff or training rights; a public website screenshot is not automatically a cleared licensed dataset.

## Candidate task, conditional on a buyer-supplied approved source
Construct a 15-second 9:16 short-form story edit introducing an existing software service using source-approved capture: (1) opening product in action, (2) visible use case, (3) substantiated differentiation, (4) truthful end-card call to action. No invented testimonials, fabricated performance claims, altered UI results, stock actors, or uncleared music/voice.

### Bounded deliverables
1. `brief.md` specifying story, creative constraints, frame/time cuts, rights and what must not be claimed.
2. `source-manifest.json` with the **actual** bytes' hashes, source owners, permitted usages, and known limits.
3. `reference.mp4`, an actual decoded output (not a written promise), after a signed source-license review.
4. `evaluation-receipt.json` from `systemia/media-studio/evaluation/check-sourcebound-video.mjs`, checking source SHA, container codec, frame shape, duration, audio-track policy, and resolution.
5. Independent **human editor** judgments for legibility, coherent cuts, purposeful pacing, truthful claims, and creative quality, including signed reviewer notes. The script is strictly a technical preflight, **not an artistic quality score**.
6. A rights/consent record for commercial training, derivative work, resale or sublicensing **only if those permissions are expressly granted**.

### Evaluation rubric
| Dimension | Automated? | Acceptance threshold |
|---|---|---|
| Input provenance | Yes | Exact SHA-256 of authorized input file |
| Output exists and decodes | Yes | ffprobe finds video stream and duration |
| Delivery shape | Yes | 1080×1920 H.264 at 30 fps, for the example brief |
| Duration | Yes | 14.5–15.5 seconds |
| Audio | Yes | Silent or an explicitly licensed/approved track per task rules |
| Shot narrative | Human | Four distinguishable beats with intentional progression |
| Claims and representation | Human + rights review | No invented outcome or unsourced claim |
| Visual and editorial quality | Human | Text readable on mobile, purposeful motion and pacing |
| Transfer/training eligibility | Legal/rights review | Written rights granted for the exact proposed use |

### Technical demonstration (internal only)
```sh
node systemia/media-studio/evaluation/check-sourcebound-video.mjs \
  --input /path/to/approved-input.mp4 \
  --sha256 EXPECTED_SHA256 \
  --min-seconds 17.9 --max-seconds 18.9 \
  --width 1080 --height 1920 --fps 30 --audio none
```
The command can validate the *actual original internal capture* with its SHA above, but **does not prove the commissioned 15-second derivative was edited, approved, or delivered**.

## Commercial discussion
- Prior buyer correspondence established a **budgetary** starting point of **USD $750** for one small evaluation-design pilot with buyer-supplied, rights-cleared inputs, subject to written acceptance criteria.
- A package including new media assets or editor trajectories is separately scoped and priced; this specimen creates **no offer/charge/order**.
- Async email scoping preferred; never send unreleased clips, consumer data, IP, or synthetic quality claims as customer proof.

**Gate:** Buyer shares exact task schema, intended use/rights and budget → authorized source approval → commissioned task → measurable output → independent editor approval → customer acceptance → paid receipt.