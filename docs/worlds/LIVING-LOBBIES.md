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

## November 15 follow-up: private invitation acceptance proof

`systemia/worlds/living-lobby-invitation-proof.mjs` now provides an **in-process test kernel**, not a live messaging service or persistent queue.

- A trusted host verifies a human/agent session before submitting an invitation. Client-claimed subject IDs are not authority.
- Every proposal and acceptance rechecks current lobby presence, Passport scopes and block state.
- Human approaches require the named recipient to accept independently.
- Agent-facilitated introductions require **both humans to accept independently**. Neither the facilitator nor the proposer can accept for them.
- Invitations expire after five minutes by default, are bounded in count, and support participant cancellation.
- Even `consent_complete` returns `delivery_authorized:false`: an authorized delivery mechanism, durable state, rate limits, session-to-presence binding and anti-abuse audits remain unbuilt.

Run `node --test tests/worlds-living-lobby-policy.test.mjs tests/worlds-living-lobby-invitations.test.mjs`. This is synthetic proof only, not evidence of authenticated internet participants or messages.


## November 16: private presence kernel, integrated proof

Added \`systemia/worlds/living-lobby-presence-proof.mjs\` and \`tests/worlds-living-lobby-presence.test.mjs\`. This is an **ephemeral server-owned data structure**, not an HTTP service or a public multiplayer API.

- A trusted server verifies a real Identity session or agent attestation, its validity window, and its current revocation status. The registry does not take browser-claimed role, consent, name, location or age flags.
- A server-owned adult eligibility service must affirm the adult pilot gate for each human; age is never revealed in the policy projection.
- Passport scopes \`worlds.presence.enter.human\` and \`worlds.presence.enter.agent\` are required at admission and on every subsequent presence resolve, alongside current Identity revocation and adult checks.
- Each returned opaque presence ID is tied to one verified subject and one session or agent attestation. A second device cannot silently take over an existing presence. No roster endpoint or direct contact discovery is provided.
- Default lease is 60 seconds, capped at 120 seconds. A trusted same-session renewal is required to stay visible. Entries are bounded (default 100, max 500); a process restart deliberately discards all active presence.
- Internal \`resolvePresence\` returns the minimal fields required by the existing Living Lobbies policy and invitations. **Never return it directly to the browser.** No credentials, precise position, conversations, names or memory are stored.
- Synthetic integration proves a human-to-human proposal and a two-human, one-agent introduction, with each recipient independently accepting; even completed consent does not permit message delivery.

Run \`node --test tests/worlds-living-lobby-policy.test.mjs tests/worlds-living-lobby-invitations.test.mjs tests/worlds-living-lobby-presence.test.mjs\`.

**Live blockers:** Connect verified Identity session validation including session revocation; issue actual Passport grants through authorized UI; add durable, privacy-preserving invitation state; implement authenticated per-session transport, blocking and abuse moderation; physical iPhone/network testing; and verify the owned Worlds HTTPS release. No customer-facing multiplayer is deployed by these tests or source changes.


## First-party signed Identity integration

The private presence kernel can now use \`systemia/worlds/living-lobby-identity-bridge.mjs\` for human sessions. Its trusted host supplies the active Identity instance and signing keyring, with:

- \`verifyEvercraftSession\` validating the exact session signature and expiration.
- \`EvercraftIdentity.assertSessionActive\` checking the current session revocation and subject-wide sign-out cutoff at admission **and on subsequent presence lookups**.
- Keyring retirement invalidating cached sessions; this bridge retains only opaque subject/session references, issued/expiry timestamps and signing-key ID, **not** display names, password material or bearer tokens.
- An independent owned, verified **agent attestation** adapter is still required. An AI agent does not become authenticated by sending an \`agent\` string.
- Adult eligibility and Passport rights are separate mandatory services. The Identity signature alone does not establish that a human is an adult or has opted into networking.

Test against real first-party signed synthetic sessions and private temporary Identity state with:
\`node --test tests/worlds-living-lobby-identity-bridge.test.mjs\`.

These source tests do not register people, expose a shared websocket, publish account identity or activate any customer-facing multiplayer session.
