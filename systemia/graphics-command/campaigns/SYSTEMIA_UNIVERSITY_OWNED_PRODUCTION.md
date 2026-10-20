# Systemia University | Owned commercial-production canary

Mission: [P0 Graphics Department #1450](https://github.com/jgaethle10/forge-operator/issues/1450)
PR: [Graphics → Fallen #1471](https://github.com/jgaethle10/forge-operator/pull/1471)
Creative: original 30-second fictional reenactment, **"I Said Draft."**
Founder thesis: **You can delegate the work. Not the responsibility.**

## Current truth (do not overstate)

This is a source-stage bridge that compiles a Graphics Department brief into an **actual native Fallen Studio Draft** and Voice Foundry audition queue. Its CI is a real software test and artifact, **not** a finished advertisement.

- Picture production requests: **7**, no final admitted moving-shot assets.
- Dialogue production requests: **7** (the AI agent and a human owner), **no performed or approved voices**.
- One music request, three SFX requests; **no source score or SFX admitted** by this branch.
- Seven native subtitles, immutable scene timing, and explicit fictional product/UI scenario.
- `exportAllowed: false` and `publicationAuthority: false` remain hard gates.
- University enrollment/fulfillment, approved logos, and working public CTA are **not verified**. See [#1344](https://github.com/jgaethle10/forge-operator/issues/1344).

## Run the actual existing Fallen compiler

On a review checkout with Node 22 and dependencies:

```bash
node --import tsx --test \
  systemia/graphics-command/fallen-studio-handoff.test.ts \
  systemia/graphics-command/fallen-voice-foundry-handoff.test.mjs

node --import tsx systemia/graphics-command/fallen-studio-handoff.ts \
  systemia/graphics-command/campaigns/systemia-university-owned-handoff.v1.json \
  /tmp/systemia-university-owned-fallen-canary

node systemia/graphics-command/write-voice-foundry-queue.mjs \
  /tmp/systemia-university-owned-fallen-canary/fallen-studio-draft.json \
  /tmp/systemia-university-owned-fallen-canary
```

Outputs are `fallen-studio-draft.json`, `production-needs.json`, `handoff-receipt.json`, `voice-foundry-session.held.json`, `voice-cue-timing.held.json`, and `voice-handoff-receipt.json`. The GitHub Actions canary uploads these as an artifact with no publication authority or network provider call.

## What the Voice Foundry queue IS and is NOT

The queue is **shaped for** the `planVoiceSession` contract under [Voice Foundry #1465](https://github.com/jgaethle10/forge-operator/pull/1465). Every cue ID is exactly the existing Fallen speech `ProductionNeed.id`; dialogue text, speaker ID, ordered start time, and duration are copied from the compiler and checked against timeline clips.

Every profile ID, accent, performance direction, approval receipt, and corresponding voice audio is **unset**. `profiles:[]` is intentional; the actual Voice Foundry source must reject the session as **held**. If a later approved casting process supplies those values, it must pass that separate engine's own strict human-audition, commercial-rights, locale/accent and consent gates. A model name, example voice or made-up reviewer ID must never be accepted as proof.

**Do not retrofit a pretend voiceProfileId into the produced timeline.** After actual casting approval and verified rights, create a new reviewed `StudioDraftPlan` revision with locked voiceProfileIds, recompile, independently check text and cue digests, run `preflightVoiceFoundrySpeech` in the governed provider adapter, then accept actual media using Fallen production receipts and review. A cast is **not** approval for paid generation or publication.

## Next P0 integration work

1. Voice Foundry #1465: actual recorded/licensed expressive takes, two independent audition reviews with locale-qualified listening, objectively probed files, approved speaker continuity and exact duration.
2. Fallen: visual shots with authentic moving content, provenance and permission, rendered with owned World Engine when possible; no generic text card substitution and no stock-asset rights shortcuts.
3. Admit actual footage and audio into the immutable Fallen edit via `studio-resolve`. The existing Shot Tournament and production admission rules must remain enforced.
4. Export 30-second 16:9 and corresponding true-resolution 9:16 mobile cut, verify with ffprobe + loudness and phone-speaker checks; document actual render bytes and source digests.
5. Founder watches and approves. Only then evaluate real University landing page and checkout from a non-admin browser before an external release. All operations remain manual fire.

## Proof versus product

CI tests prove determinism, exact cue alignment, absence of unauthorized cast, and that missing sources keep the project blocked. They **do not** prove voice beauty, film-grade physical motion, student delivery, enrollment, payment, or public deployment. Human judgement and independent canaries are still needed.
