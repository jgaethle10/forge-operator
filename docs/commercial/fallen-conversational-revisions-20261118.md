# Fallen Studios | Conversational revision foundation

**Goal:** A customer should be able to tell Fallen in ordinary language what to change, without learning timeline machinery. This source module is **not** a publicly deployed editor. It is a local, deterministic revision-proposal contract built directly on existing `timeline.ts` and `studio-agent.ts`.

## Current bounded behavior

An authorized caller provides a private project, its exact version and timeline digest, an operator-scoped reference, and an instruction such as:

- “Keep the first 10 seconds. Make the ending more exciting.”
- “Make the intro more cinematic.”
- “Change the voice to something warmer and more natural.”

The result is an immutable-base **proposal**, not a changed video. Visual requests select a clearly identified existing picture clip and emit one `regenerate_clip` candidate plan through the existing Studio Agent contract. The shot will still need asset generation, source review, continuity and Shot Tournament approval. Voice-only requests generate an audition request with existing audio preserved; they never use the visual regeneration path.

If the request is ambiguous, touches a locked track, overlaps a protected region, conflicts with the verified project version, or asks for both protected media and global voice replacement, the proposal reports an explicit clarification or rejects. There is no broad free-form “change anything” execution.

## Approval gate

`stageApprovedConversationalRevision` requires an operator-provided approval reference and exact proposed digest. It independently reconstructs the proposed change against the current timeline, then invokes the existing Studio Agent only to **stage candidate needs**, verifying that the project digest did not change. The proposed approval reference is not independently authenticated by this module: authentication, customer isolation and authority must be established by the private caller.

**No provider calls, asset generation, payment, publication, or customer delivery occur.** These steps remain outside the product and subject to the established media/rights/performance gates.

## Verification

```bash
node --import tsx --test \
  systemia/media-studio/timeline.test.ts \
  systemia/media-studio/studio-agent.test.ts \
  systemia/media-studio/conversational-revision.test.ts
```

This is an intentionally narrow but working path toward Issue #2244. Still required: private authenticated customer project access, version snapshots and rollback storage, audio audition generation, preview playback, reversible project mutations, repeat-project templates and real delivery. No public SaaS readiness claim until those pass.
