# Fallen Signature Standard v1
Evercraft LLC | Fallen Studios | Candidate release standard | November 16, 2026

## Promise
A render is NOT a finished commercial. A completed timeline, successful encode, beautiful still image or passing automated QC never authorizes a client-ready, television-ready or public-ready claim.

**Release rule:** reject, repair and re-render until both the existing customer-commercial gate and the signed Fallen Signature creative gate accept evidence tied to the same final encoded master. A successful review still does not authorize payment, client delivery, public posting, broadcaster submission or use in a portfolio. Those are separate governed actions.

## The irreversible stop signs
Any of these blocks the commercial. There is no automatic waiver based on urgency, price or subscription tier.

1. **Story.** The opening earns attention, introduces the actual product/subject quickly, and the rest of the spot has a coherent progression, meaningful proof and a clear single call to action. No filler copy masquerading as storytelling.
2. **Visuals.** Every shot shows intentional subject/action and consistent brand/product identity. No accidentally repeated footage, repeated trims, unapproved stock masquerading as client work, motionless filler, inconsistent AI characters, distorted products, or low-effort title-card sequences. An intentional still shot is allowed if the director documents its purpose and the resulting commercial still meets the full standard.
3. **Voice.** If narration is present, audition the FINAL encoded audio for natural performance, pronunciation, pacing, emotion, absence of clipping/robotic artifacts and correct brand names. A passing waveform or TTS render is not proof. Nonnarrated work must explicitly record that narration was not ordered.
4. **Music and sound.** Music is original or licensed for the actual commercial use, intentionally chosen for the client and emotionally supportive, not a random backing track. Dialogue is intelligible; music, transitions and effects are balanced. No source-noise surprises, shrill drones, sudden volume jumps or clipped endings.
5. **Brand trust.** Claims are supported by client-approved evidence. Logos and offers are accurate; all media, voices, music and typography have appropriate commercial-use permission. Permission to complete the client's job does not grant promotional reuse rights.
6. **Presentation.** Text is legible on a phone, transitions support the story, the CTA is visible long enough to understand, and the export has no glitches, spelling errors, visible placeholders or misaligned captions.
7. **Human experience.** The FINAL exact master is actually watched on a phone screen with phone speaker, listened to with headphones, and viewed on a desktop screen. A reviewer signs off on the craft and records evidence references. Every unresolved substantive defect means BLOCK.
8. **Technical.** The existing independent render, master, audio, picture, source-rights, storyboard, production-grade and preflight checks must pass first. The current social-commercial preflight expects an H.264/AAC final, >=1080-pixel short side, nominal 23.9-60.1fps and measured integrated loudness from -18 to -14 LUFS with true peak <= -1 dBTP, among other checks. These are Evercraft's CURRENT social-delivery rules, NOT a substitute for a receiving broadcaster's specifications.

## Stages and what they mean
- studio-draft-plan: planning only; no customer asset is promised.
- ready_for_client_preview: existing technical/rights/creative release accepted, client approval pending. This remains insufficient WITHOUT Signature clearance.
- signature_ready_for_client_preview: prior gate accepted AND director reviewed the actual final master, all signature checks and all required playback modes accepted. Client delivery STILL requires a separate authorized handoff.
- signature_reviewed_for_delivery: prior gate and Signature review accepted and a separate client-approval receipt exists. **Not** proof of delivery or publication.
- blocked: any missing/mismatched evidence, signed review, audio/picture defect or unresolved concern. Repair and rerun; never relabel.
- **Broadcast-ready is not an output of this gate.** Each station/network's exact traffic specifications, legal requirements, captioning and format acceptance must be independently verified before submission. Shawnee's offer is an opportunity, not blanket acceptance or placement authorization.

## Machine-enforced review
Code: systemia/media-studio/fallen-signature-gate.mjs, called by customer-commercial-gate.mjs.

The private customer-commercial-gate-request.v1 accepts an additional signatureReview object. It is **required to obtain any non-blocked customer-commercial-gate result** under this patch. A missing review fails closed.

Required fields:
- schema: evercraft.fallen.signature-review.v1
- masterSha256: the EXACT rendered master digest
- releaseReportDigest: the EXACT independently generated customer-commercial release report digest
- reviewedBy, ISO reviewedAt, signoffEvidenceRef, overallDecision: approved
- unresolvedDefects: []
- checks: each required check from REQUIRED_CREATIVE_CHECKS in the module must have passed=true and a private evidenceRef
- playback: phoneSpeaker, headphones, desktopScreen, each with pass and private evidenceRef
- voiceAudition: passed=true, evidenceRef and pronunciationVerified=true when order.includesNarration=true
- noNarrationConfirmed=true when order.includesNarration=false.

Never place private customer briefs, voices, footage or customer records in the public repository. Evidence references should point to retained, access-controlled review records.

The gate cryptographically binds the **declared** review to the final master and upstream release report, but it cannot independently validate that a human really watched a video, that referenced evidence exists, that licenses are genuine, or that the creative is genuinely excellent. Human accountability is essential. The device checks are attestations, not automated playback tests.

Run tests:
node --test systemia/media-studio/fallen-signature-gate.test.mjs systemia/media-studio/customer-commercial-gate.test.mjs

## Subscription build order
Build now without guessing Shawnee's rates:
1. Customer workspace: brand identity, authorized media uploads, brief, saved concepts and project history.
2. Production job: estimate compute/voice/music/revision costs, reserve bounded capacity and keep versioned source receipts.
3. Review room: final-master preview, human Signature review, customer feedback and approved revisions.
4. Delivery library: final social format(s) and authorized Evercraft Clip handoff with receipts.
5. Repeat work: campaigns, seasonal variations, scheduled refresh requests and ongoing service capacity.
6. Optional station distribution request: collect customer consent, desired market, channels, budget and campaign date. Route to human media consultation until Shawnee's exact agreement and station specs are verified. Never advertise automatic on-air placement.
7. Subscription entitlements and pricing only after measured production costs, repeated customer demand and audited renewal/cancellation controls.

**Nonnegotiable commercial policy:** no membership level buys a lower creative standard. Different plans may buy more volume, formats or production assistance; every delivered commercial faces the same quality floor.

## Scope of this change
This branch adds the signed creative gate, layers it into the existing customer-commercial preflight, and adds regression tests. It does NOT retroactively validate past commercials or demonstrate a real customer master passing. It does NOT wire a shipping/distribution service to this gate, deploy paid self-service accounts, configure station placement, or establish a live subscription. Before launch, prove that all real delivery paths consume the accepted gate receipt and cannot bypass it.
