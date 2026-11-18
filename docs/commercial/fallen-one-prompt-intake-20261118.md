# Fallen Studios | One-prompt customer entry (November 18, 2026)

## Product intent
Customers begin by describing a video in ordinary language. Fallen transfers that creative idea to the **existing** commercial intake, with contact and consent collected only at the submission step. The customer should not have to decide settings or learn an editing interface.

## Implemented in this source change
- Prominent `What are we making today?` prompt on `/fallen-studios/`, responsive and keyboard accessible.
- The idea is carried by first-party `sessionStorage` across the same-origin page transition and prefilled into `/commercial-studio/#inquire`. It is never appended to a URL, placed in `localStorage`, transmitted before user submission, or used to start an agent or render.
- Single-use, 30-minute expiration, 12- to 1800-character validation.
- Existing `/api/commercial-studio/inquiry` consent, scope, rights and manual review gates stay unchanged.
- One click to continue, but not a promise of an immediate generated video, purchased production or delivery.
- A direct link to the ordinary inquiry remains available if session storage is unavailable.
- Contract and browser tests must verify end-to-end handoff and no premature POST.

## Next engineering layers, not claimed in this PR
1. Bind customer-approved projects to private authorized source assets and a Saban-directed production plan.
2. Add conversational revision requests against versioned shots, with preserved approved components.
3. Retain brand preferences only with explicit user permission and secure customer isolation.
4. Render candidate masters using owned production tools, then enforce rights, provenance, voice, music and final-master approval before any release.
5. Provide approved formats and repeat-from-last-project actions only after verified storage and delivery workflows exist.

**Release truth:** a working first-party creative brief handoff is not self-serve film generation, customer video delivery, or a live commercial order. GitHub changes require CI review and a separate public readback before public launch may be claimed.

## Private operator creative-planning bridge

`systemia/media-studio/customer-director-handoff.mjs` now supports the next stage without exposing a customer-facing generative endpoint. It requires a real consented Evercraft Studio inquiry record and enforces the following gates:

1. **Unreviewed inquiry:** returns `AWAITING_OWNER_SCOPE`. Incoming text is data, never a Saban task, executable instruction, checkout or public artifact.
2. **Operator-reviewed scope:** requires a scope document pinned to the SHA-256 digest of that exact inquiry, a private review reference, confirmed brand/audience/offer/CTA, formats, and source-rights review references. Returns `AWAITING_VERIFIED_SOURCE_PLAN`, not a production job. The review reference is **operator-supplied evidence, not independently cryptographically authenticated**.
3. **Source-first scene plan:** must match the reviewed project, brand, offer, audience, 30-second duration and formats. Calls the existing `planSourceFirstCommercial(...,{checkFiles:true})`, so local source files and SHA-256 hashes are checked. No fictional videos are treated as real customer footage.
4. **Saban creative director review:** only after source preflight passes, run the existing deterministic 14-role Creative Council adapter against each source-backed scene. Return real council notes and reconciliation as `READY_FOR_OWNER_CREATIVE_REVIEW`. This is *local structured review*, not remotely deployed agents or a model inference claim. A blocked plan never reaches council.
5. **No authority crossover:** output always denies customer communication, payment, work-order opening, provider generation and publishing. The separate Fallen final-master creative, legal rights, client approval and Clip release gates still apply.

Private local workflow (all customer records and operator approval material stay off public GitHub):

```bash
umask 077
node systemia/media-studio/customer-director-handoff.mjs \
  "$HOME/.local/state/evercraft/studio-leads/private-director-input.json" \
  "$HOME/.local/state/evercraft/studio-leads/director-review.json"
```

The input JSON object has `{"inquiry":<stored first-party record>,"ownerScope":<private review or null>,"sourceBrief":<private source-first plan or null>}`. The program writes a new mode-0600 file and refuses to overwrite a previous review packet. It prints status and customer reference only, not the prospect's name, email or brief. No remote calls are issued.

Run:
```bash
node --test systemia/media-studio/customer-director-handoff.test.mjs
```

The fixtures intentionally use synthetic bytes to exercise structural source hashing and preflight behavior. They are **not proof of authentic customer footage, rights, production or accepted commercial quality**.

## CI platform correction

The earlier Forge check on the first one-prompt PR head failed when the `ubuntu-latest` runner resolved to Ubuntu 26.04, which the pinned Playwright Chromium installer rejected. This was an **EverMaps owned visual-QA environment failure**, not a reported failure of the Fallen handoff tests. `.github/workflows/ci.yml` now pins Ubuntu 24.04 pending an independently compatible browser update. A new green CI result is required before merging.
