# Website Audit cinematic flagship | source-first production handoff

**State:** Preproduction. The prior browser-poster package is a graphics engineering canary, **not** an approved commercial. Founder rejected its creative quality. No claim of professional filmed footage, mastered audio, live audited buyer checkout, or public distribution is authorized.

## The finished experience (25 seconds, not a 12-second animated poster)

| Time | Picture and camera | What must be real | Sound |
| --- | --- | --- | --- |
| 00:00–00:05 | After-hours small-business workspace. Human action in a 35mm medium/wide, deliberate motivated push. Notifications appear; the owner looks up at a silent phone. No fabricated conversion numbers. | Owned/licensed filmed person and workspace, not a synthetic dashboard. Screen text need not contain fake metrics. | Room tone, one restrained tactile interaction, no stock trailer boom. |
| 00:05–00:10 | Physical camera transition into a spatial interpretation of a visitor journey. The path bends, fragments and loses momentum. Interpretive visualization, never presented as a real customer's analytics. | Acquired/generated 3D footage or physically grounded shot, with synthetic label and rights/provenance if generated. | A rhythm introduced by movement, not generic digital beeps. |
| 00:10–00:15 | Freeze motion. Diagnose: camera crosses into an **actual captured** Evercraft Website Audit workflow. Keep the observed product UI clearly separated from illustrative visuals. | Verified, approved, personally captured product UI, redacted customer data, and actual current functionality. If unavailable, hold the shot. | A clean sonic drop, room tone breath, intelligible narration only if actually recorded. |
| 00:15–00:21 | Five actionable recommendations become physical, prioritized fixes. Use true sample output if available. Never portray invented customer findings as real. | Five verified axes / demo output with provenance. Require proof that the delivered $49 service really includes the advertised top five fixes. | Music resolves toward clarity; crisp but sparse UI interaction. |
| 00:21–00:25 | Clean product name and $49 price lockup over a captured product/world hero. Calm after movement; verified purchase destination only. | Brand-approved mark, independently checked public offer/checkout and accessible fulfillment path. | Mixed resolution and short tail, not abrupt silence. |

**Suggested original copy (subject to founder sign-off):**
"The traffic came. The customers didn't. Stop guessing. Find your five fixes." End card: "Evercraft Website Audit | Quick Win Audit | $49." This is illustrative marketing language, not a claim about a named customer's observed funnel.

## Available zero-subscription footage scouts (NOT yet downloaded or admitted)

- Coverr: [A man working on a laptop at the office](https://coverr.co/videos/a-man-working-on-a-laptop-at-the-office-ateyvbvtie). Source page indicates free commercial rights. Candidate opening, not product evidence.
- Pexels: [Person typing on a laptop in dark environment](https://www.pexels.com/video/person-typing-on-laptop-in-dark-environment-34771077/). Source page says free to use. Candidate macro insert, not branded UI.
- Coverr: [Focused worker working on a laptop](https://coverr.co/videos/focused-worker-working-on-a-laptop-tzg4iv3grt). Source page indicates free commercial rights. Candidate reaction/over-shoulder beat.

**Admission requirements:** Download original/source media through its legitimate page; retain source URL, license snapshot, author attribution where required, local SHA-256, format/duration, crop/performance test, and rights for the actual use. No downloaded footage or rights verification is claimed by this packet. Avoid presenting a recognizable stock actor as a real Evercraft customer.

## Engineering route

1. **Evidence and acquisition:** Use Fallen's existing semantic must-show contracts and Creative Council. Assign real_person_at_work, visitor_journey_visualization, real_audit_ui, five_actual_fixes, verified_offer_end_card. Explicitly list each missing asset.
2. **Generation (only if approved and executable):** Use Fallen Visual Model Fabric via independently verified adapters and any required paid-generation authorization. Never promote a planning record or provider declaration to a generated media receipt.
3. **Media observation:** Run existing Fallen observe and Shot Tournament on actual asset bytes/frames; insist on digest-bound observation, subject coverage, rights, continuity and human beauty approval. A geometry-only layout pass is insufficient.
4. **Editorial:** Assemble via existing Fallen media-studio renderer or exact-frame Visual Stage, preserving a non-destructive cut for shot replacement. Target both 1920x1080 and 1080x1920 framing; observe and check both crops.
5. **Sound:** Obtain actual narration (if used), rights-cleared original score/bed and specific effects; mix with intelligible narration, intentional quiet, controlled peak and loudness measurement. Scripted sonic notes are not produced audio.
6. **Live claim/checkout:** Independently test the live $49 offer and fulfillment route using approved methods before publishing the offer link. Never pretend preview.invalid is public.
7. **Release:** Delivery requires actual MP4, frame QA, mastered sound, shot receipts, proof of product functionality, founder visual approval and explicit publication authority.

## Concrete exit gates

- No headline/browser overlap at every target aspect ratio. Use commercial-layout-qa.mjs plus real raster review.
- No unlabeled synthetic footage or fake customer numbers, fake UI, invented audit result or unsupported $49 promise.
- At least one real human-action shot and one **actual** product capture; at least one noticeably distinct physical/spatial shot rather than another dark panel.
- Sound is auditioned, not inferred from cue sheets.
- End card links to a verified public route. Founder approves the completed experience.
- Until then: previsualization_only; not render-approved for distribution.

This is a specific production work packet, not a completed cinematic commercial. Production, payment, publication and remote-compute permissions are all separate gates.

## Physical HP NextGen workbench: real-footage intake (implemented)

The bounded local intake entrypoint is `systemia/graphics-command/website-audit-cinematic-intake.mjs`.
It does **not** fetch stock media, create footage, call models or grant remote compute authority.

Run in a **new isolated worktree** to avoid perturbing Node002's existing operational source/graphics timer:

```bash
cd "$HOME/evercraft-qa/forge-operator" || exit 1
git fetch origin commercial-visual-honesty-20261019
WORK="$HOME/evercraft-qa/worktrees/website-audit-cinema"
test ! -e "$WORK" || { echo "WORKTREE ALREADY EXISTS: inspect before using"; exit 1; }
mkdir -p "$(dirname "$WORK")"
git worktree add --detach "$WORK" FETCH_HEAD
cd "$WORK" || exit 1
node --test systemia/graphics-command/commercial-renderer.test.mjs systemia/graphics-command/website-audit-cinematic-intake.test.mjs
```

Create the non-secret manifest once:

```bash
INTAKE="$HOME/evercraft-qa/production/website-audit-cinema"
node systemia/graphics-command/website-audit-cinematic-intake.mjs --init "$INTAKE"
```

The generated `film-intake.json` is deliberately blocked: five named assets, unknown rights and missing evidence.
For each shot, add a **real** video in `media/`, a rights evidence file in `rights/`,
pin `sha256` to the actual asset bytes using `sha256sum`, record provenance
under `sourceRef` and choose a truthful rights state. Record at least one actual
product capture evidence ref and five distinct real output evidence refs for the
five-fixes shot. Merely typing evidence refs is not visual verification; the resulting
clip still needs a separate human review and observable product proof.

Check readiness, without rendering:

```bash
node systemia/graphics-command/website-audit-cinematic-intake.mjs --inspect "$INTAKE" "$INTAKE/film-intake.json" "$INTAKE/review"
```

If **and only if** all five source bytes, metadata, rights files and evidence
references are admitted, the command writes a ready-to-review Fallen plan.
It fails with exit code 2 and a detailed `film-admission.json` when any are missing.

After approval to create a **silent picture preview**, not a finished film:

```bash
node systemia/graphics-command/website-audit-cinematic-intake.mjs --render "$INTAKE" "$INTAKE/film-intake.json" "$INTAKE/preview-001"
```

This calls the existing Fallen media-studio renderer, with no external provider,
payment, publishing or automated URL fetching. It generates a local 25s 16:9 MP4
and SHA-256 receipt only on successful assembly. The renderer intentionally
strips sound, so mastering/sound/voice and human beauty review remain distinct
required work. No 9:16 export is implied by this preview. Never advertise it
as an audio-finished 25-second cinematic commercial.

**Hard truth boundary:** `picture_preview_ready` is byte/provenance-format
readiness only, not proof that the frames genuinely show the claimed subject.
No computer-generated intake metadata can grant founder release approval.
