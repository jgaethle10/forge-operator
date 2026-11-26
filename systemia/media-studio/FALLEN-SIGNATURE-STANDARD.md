# Fallen Signature Standard | Current-main integration

**State:** Source-review release gate. No public deployment, platform post, client delivery, paid generation, or artistic quality claim is authorized by this file.

**Why this belongs in the existing production stack:** Evercraft's current source-first commercial assembly can already create H.264/AAC video and produce render, technical-master, audio, picture, rights and storyboard preflight receipts. A passing encode or technical receipt does not mean the film is persuasive, beautiful or suitable for a customer. This source-only slice ports the independent Signature creative gate from the unmerged November 16 draft without bringing the unrelated Founder Desk runtime or other stale branch changes.

## Required route

1. Assemble authorized real footage, stills or explicitly labeled synthetic concept material through the existing `commercial-assembly.mjs` and Studio Delivery path.
2. Run `customer-commercial-gate.mjs` against the exact final encoded master, with matching render, master-QC, audio and picture receipts, verified source rights, storyboard, production-grade and owner-approved client scope.
3. Have the human director actually watch/listen to that exact final file, record the enumerated Signature checks, and re-run the customer gate with `signatureReview`. A re-encode or changed upstream release digest invalidates the old review.
4. Keep customer delivery, promotional reuse, Clip publication, provider payment and broadcaster acceptance behind their **separate** explicit approval channels.

## Source interfaces

- `systemia/media-studio/fallen-signature-gate.mjs` exports `assessFallenSignatureQuality({release, review, includesNarration})`.
- `release` is the existing `evercraft.fallen.client-commercial-release-report.v1` generated from all existing technical, rights and customer preflight inputs.
- `review.schema` must be `evercraft.fallen.signature-review.v1`, with the **exact master SHA-256** and `release.reportDigest`, an identified human reviewer/date and private signoff evidence reference, `overallDecision:'approved'`, and **zero unresolved defects**.
- Every `REQUIRED_CREATIVE_CHECKS` entry needs `{passed:true,evidenceRef:'private evidence location'}`; checks cover the opening, audience story, actual brand/offer, visual authenticity, varied shots, pacing, readable CTA, original or appropriately licensed music, deliberate audio mix, no placeholders, professional finish.
- Every `REQUIRED_PLAYBACK_CHECKS` entry needs the same explicit pass/evidence on **phone speaker, headphones and desktop screen**.
- A narrated job requires `voiceAudition.passed:true`, evidence reference and `pronunciationVerified:true`. A nonnarrated job requires `noNarrationConfirmed:true`; missing narration scope blocks.
- The canonical `customer-commercial-gate.mjs` now calls Signature after the independently evaluated preflight and makes its top-level status `blocked` when Signature rejects. Existing `release` and machine-QC results stay visible to help repair the media. There is no bypass when creative review is missing.

The CLI for a standalone privately reviewed Signature report remains:

```bash
node systemia/media-studio/fallen-signature-gate.mjs /private/film-signature-input.json /private/film-signature-report.json
```

The canonical full gate remains:

```bash
node systemia/media-studio/customer-commercial-gate.mjs /private/customer-commercial-request.json /private/customer-commercial-gate-report.json
```

### Verification (source and CI, **not** human creative signoff)

```bash
node --test systemia/media-studio/fallen-signature-gate.test.mjs systemia/media-studio/customer-commercial-gate.test.mjs
```

The existing `fallen-commercial-audio-lab.yml` runs both tests alongside real FFmpeg/FFprobe release checks. Regression tests deliberately falsify master hashes, render receipts, narration review, shot originality, audio mix and playback.

## Limits and security

A supplied human identity, reviewer timestamp or `evidenceRef` is a **self-attestation**, not a cryptographically authenticated human signature and not proof that the reviewer actually watched the film. Rights evidence likewise requires independent review. This gate **cannot autonomously judge beauty**. It prevents the production software from silently assuming that beauty, consent and brand quality are proven by objective encoders or AI reports.

Never send a private customer video, voice script, license file, unredacted review evidence or credential into the public repository or CI. Human verdicts and original media stay owner-private. No test fixture is a sample of actual Evercraft customer delivery.

Earlier RC01/RC02 motion concepts remain internal learning material. This Signature gate is meant to reject weak real-world releases, not rebrand a procedural animation as world-class film.
