# Evercraft Worlds | Living Lobbies: Business-first pilot

**State: source-only policy and synthetic tests.** There is no hosted multiplayer presence, live agent cognition, chat, customer payment or launch proof. Use Systemia as the admission and orchestration authority before activating any real-world action.

## One engine, multiple contexts

Reuse public/worlds/ for the canonical 3D renderer, input, physics, world builder, and scene persistence. Do not build a second independent renderer or duplicate identity. The five planned contexts are Business & Connections, Explore, Play, Learn, and Community. Only Business is eligible for adult human contact proposals in this policy pilot. Other contexts remain contact-disabled until age-aware safety design and moderation exist.

Existing public/the-window/world.mjs has deterministic society behavior, not a live population of independent LLM agents. The existing Worlds vault stores scene-only data and must never receive human profiles, private conversations, player positions, or agent memories.

## Authority and consent

- **Evercraft Identity:** proves a human subject. The owned agent identity attestation needs separate implementation; don't trust client-provided agent names, identity flags or age claims.
- **Evercraft Passport:** authorize actions with product evercraft-worlds, resource worlds:lobby:business, and short, narrow, revocable scopes.
- **Owned presence service (not built):** resolve from an authenticated server-owned registry, tracking online state, verified roles, lobby occupancy and verified adult eligibility. Never pass browser-posted objects directly into the policy's resolvePresence callback.
- **Block/moderation service (not built):** server-owned bilateral block checks. Block lookup failure is a denial, not permission.
- **Systemia:** orchestrates approved tasks. Saban execution, persistent AI memory, directory publication, message delivery and payments need separately approved action scopes and audited receipts.

Required Passport scopes:

| Scope | Holder | What it enables |
|---|---|---|
| worlds.contact.initiate | Human or verified agent | Propose a one-to-one approach |
| worlds.contact.receive.human | Recipient | Opt into proposals from other humans |
| worlds.contact.receive.agent | Recipient | Separately opt into proposals from agents |
| worlds.introduction.propose | Verified facilitator agent | Suggest an introduction |
| worlds.introduction.suggest | Both adult humans | Opt into suggestions, not sharing or direct introductions |

A returned **proposal_only** is never authority to send a message, invite, share contact details, execute work or persist personal memory. A recipient must separately accept a *specific* proposal; suggested introductions require **two independent acceptances**. Grant revocation, moving lobbies, going offline and blocking must invalidate pending requests in the future dispatch service.

## First delivered vertical slice

- systemia/worlds/living-lobby-policy.mjs: read-only, fail-closed decideWorldsApproach and decideWorldsIntroduction.
- tests/worlds-living-lobby-policy.test.mjs: synthetic regression coverage for granular scopes, adult eligibility, missing trust, consent withdrawal, bilateral blocks, lobby mismatch, agent-human boundaries, no private data in decisions.
- .github/workflows/worlds-living-lobbies.yml: limited, read-only PR validation using Node 22.

Run: node --test tests/worlds-living-lobby-policy.test.mjs

## Gates before anyone enters

1. Add actual server-authenticated user and agent presence, authoritative Passport grant issuance/revocation, and block/report service.
2. Build expiring, consented invitation acceptance and durable moderation receipts. No unsolicited messages or private location exposure.
3. Connect this authorization engine to the existing Worlds renderer. Keep scenic simulations and people/agent identity stores isolated.
4. Add an agent concierge with strict compute limits and tool-action permits; no fake autonomous behavior claims.
5. Make a real private test with two consenting adults and one agent, including revocation and restart persistence.
6. Resolve owned Worlds HTTPS ingress blocker #1994, Systemia admission, physical iPhone QA and independent release evidence.
7. Only then test opt-in real-business meeting and Saban job, with payments treated as an independent checked transaction.

Never ship anonymous public matchmaking by exposing this pure policy module as a caller-controlled endpoint.
