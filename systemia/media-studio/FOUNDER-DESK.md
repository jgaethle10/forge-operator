# Fallen Founder Desk v0.1 | Owned local production workflow
Evercraft / Systemia / Fallen Studios | 2026-11-16 | Internal owner pilot

## Why this exists
The owner should be able to commission, plan, review and produce commercials through the same customer workflow without writing command-line JSON for every cut. Previously, Tile Works, Pacific Mechanic, Flame & Brew and Icy Tai repeatedly reached partial output with unresolved voice, score, source permissions, motion, branding or final quality; technical render success was mistaken for commercial success.

## Start (only after this branch is checked out locally)
Requires Node 22 for the studio and separately FFmpeg/FFprobe plus tsx for actual authorized commercial assembly. From the owned repository root:
    node systemia/media-studio/founder-desk.mjs
Open http://127.0.0.1:8793 on the SAME host. Default private storage:
    ~/.local/share/evercraft/fallen-founder-desk
Override with FALLEN_PRIVATE_DESK_DIR and FALLEN_FOUNDER_PORT. This is a localhost owner pilot, not remotely deployed or hardened for Internet exposure. It does not require GitHub during runtime.

## One-screen owner workflow
1. Select an existing client or type a name to create a new private job.
2. Describe the goal, audience, verified offer and CTA in plain language.
3. Upload actual source photos, video, approved narration and licensed/original music. Source bytes live on the local machine, not GitHub. The upload is NOT an asset-rights audit, and is not a video-quality audition.
4. Record a genuine rights-evidence reference and human reviewer for each accepted asset. The desk tracks the attestation; legal license authenticity still requires independent inspection.
5. Download a production packet for the source-first planner. When a full owner-reviewed commercial-assembly.v1 file with exact local asset hashes and audio is available, import it through the one-screen UI and select "Render approved assembly".
6. The action invokes the existing Fallen commercial assembly renderer with technical audio/QC on the local Node runtime. A failed render remains blocked. A successful one is labeled "rendered_technical_only", never "finished" or "ready to send".
7. The existing customer-commercial-gate and new Fallen Signature gate still require exact-master technical, rights, picture, voice, music, device-playback, human and client signoffs. Do not send through Clip or the station without a separate authorized delivery gate.

## Seeded project recovery state
The PRIVATE local first run creates job records without media, invoices or contact data:
- **Tile Works:** V5 "LOOK CLOSER" source plan and intended native Bella voice. No verified final voice, original score, commercial contact or client-approved master. Recover existing user-supplied photo source bytes locally.
- **Pacific Mechanic:** Unverified production sources. Recover original brief and footage first; do not invent details.
- **Flame & Brew:** Separate business. Prior animated previews are not final authentic food commercials; rights-cleared food footage and a real scored/narrated master required.
- **Icy Tai:** Separate business. Confirm exact spelling and customer brand assets before finalizing; real product footage and independent rights review required.

The starter jobs preserve existing private progress if the owner restarts the program. The repo contains no customer uploads or the owner's private reviews.

## Authentic photo-motion route
For a real client such as Tile Works whose source package contains authorized photographs rather than moving footage, Fallen's source-first planner now recognizes creativeStandard: source-photo-motion-v1. Its brief must include a named photoMotionApproval reviewer, review timestamp, evidence reference, and noSyntheticAction=true. Each still scene requires a motionTreatment from macro_push, gentle_pan, subtle_parallax or matched_frame. The opening still must show an actual observed subject, not stock pretending to be client work or synthetic visualization. A photo-based plan is NOT a finished master; every resulting render needs final motion, continuity, authenticity and Signature review. Existing video-first and EPS Relay-floor controls are unchanged.

## Hard boundaries
- This local pilot is not customer SaaS, remote login, Stripe checkout, a voice synthesizer, an AI scene generator, a music composer, a self-serve broadcaster submission or a replacement for Saban.
- A browser does NOT get to bypass Fallen Signature even for the founder.
- Technical rendered status never equals approved, fulfilled, paid or broadcast.
- This release uses 250 MB per upload and basic local storage; larger assets and cross-device access still need an owned private upload service with authentication, quotas and retention.
- Asset source hashes prove only bytes, not rights, factual accuracy, client approval or beauty.
- The approved assembly JSON is still an expert-mode bridge and must be eliminated from the normal user experience in the next phase.

## Required next engineering
**P0 (quality completion):** real Bella voice audition lane, music audition/select/approve lane, producer-directed visual edit decisions with a per-beat "no repeat" test, actual phone playback review UI, station-specific separate preset.
**P0 (workload removal):** make Director / Saban build source-first project and assembly manifests directly from the one-screen intake, with explicit approval for paid provider execution. Automatically requeue only defects with bounded retries and preserved evidence, not brute-force endless generation.
**P1:** Replace uploaded JSON with guided audio/visual source selection, integrate exact-master Signature evidence into reviewer UI, verify shipping controls cannot bypass it.
**P2:** Authenticated remote customer portal, media partner requests, subscription access and metering. Only after cost and quality pilots.

## Test
    node --test systemia/media-studio/founder-desk.test.mjs systemia/media-studio/fallen-signature-gate.test.mjs
GitHub CI additionally exercises customer-commercial-gate and commercial-release-preflight using real FFmpeg fixtures.

## Safety
The server binds 127.0.0.1, enforces a local host/Origin check and short-lived process token for mutations. This is a convenience boundary for owner use, not a professional multi-user authentication scheme. Do not port-forward it to the Internet. Back up the private directory securely, retain customer approvals appropriately and keep licensed music and customer source files out of public repositories.
