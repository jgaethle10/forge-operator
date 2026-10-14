# The Window / Mossmere

Evercraft Society Lab | Observation 001 | Experimental

A server-owned, read-only spectator experiment: twelve fictional rule-based residents with occupations, needs, inventories, relationships, memories and an append-only event trail. The same state is served to every connected client over Server-Sent Events (SSE).

This is a functioning simulation scaffold, not a deployed autonomous LLM society, proof of consciousness, or proof that a hosted public URL is live. It has no payments, user accounts, or viewer intervention.

## Run locally

Requires Node.js 20+ and persistent writable disk; no external packages or API keys.

Run from the experiments/the-window directory:

- node --test engine.test.mjs
- PORT=8787 WINDOW_DATA_DIR=./data node server.mjs
- Open http://localhost:8787

On a host, mount WINDOW_DATA_DIR on persistent storage. Temporary serverless storage is insufficient. Never run two writers against the same directory.

## API

- / : read-only spectator map and resident profiles
- /api/world : canonical world snapshot
- /api/history?limit=80 : recent chronicle (snapshot retains max 160)
- /api/events : SSE, immediate snapshot plus updates every 30 seconds
- /api/health : tick, persistence flag, subscriber count and offline recovery status

The full event history appends to events.jsonl. snapshot.json is atomically replaced on each tick. Each step advances fifteen simulated minutes and is scheduled every thirty real seconds.

## Durability and limitations

- Restart reloads the latest snapshot. Up to 480 missed ticks are replayed during restart; any further missed ticks are reported as recovery.missed_ticks rather than fabricated. A supervised always-running service is required for continuous life.
- Disk writes are synchronous for clarity. A crash between journal append and snapshot replace can cause duplicated journal entries after recovery. Before production, use transactional storage and idempotency.
- Single writer only. No multi-instance leader election, viewer accounts, moderation, rate limits or LLM adapter yet.
- Server binds to 0.0.0.0. Add TLS, reverse proxy and rate limits before public deployment.
- No public mutation endpoints. The client puts all resident/event descriptions in textContent, not HTML.
- Always disclose that fictional agent actions are rule-based. Do not claim consciousness.

## Verified gates

- [x] Seeded decision replay is reproducible.
- [x] Needs, moods and relationships are bounded.
- [x] Town state survives reopening a new WorldStore.
- [x] Event IDs stay unique after the snapshot history wraps.
- [x] Offline recovery reports unprocessed ticks.
- [x] HTTP world, HTML and SSE smoke test passed in a development sandbox.

## Unverified / release blockers

- [ ] Production deployment on durable disk.
- [ ] Same state witnessed from two independent browsers/devices.
- [ ] State and chronicle survived 24 real hours and a restarted production host.
- [ ] LLM deliberation adapter for consequential decisions, with validation, audit receipts and budget caps.
- [ ] Moderation, observability, load-testing and host security review.
- [ ] Formal Systemia mission admission and a production release decision.

## Next phase

Keep movement, meals and job routines in the deterministic kernel. Add optional bounded LLM deliberation for consequential choices such as a dispute, job change, or major trade. Persist each agent's limited memory summary and goal, and require validated, allowlisted structured outputs. Add provider timeout, rate limit, costs and deterministic fallback. Never expose production credentials, real finances, or external communication authority to resident agents.

This branch is a proposal pending Systemia admission, not a revenue-ready or production deployment.
