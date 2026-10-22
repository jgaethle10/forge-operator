# The Window / Mossmere

Evercraft Society Lab | Observation 001 | Experimental

A server-owned, read-only spectator experiment: twelve fictional rule-based residents with households, aspirations, occupations, needs, inventories, relationships, memories and an append-only event trail. The same state is served to every connected client over Server-Sent Events (SSE).

This is a functioning simulation scaffold, not a deployed autonomous LLM society, proof of consciousness, or proof that a hosted public URL is live. It has no payments, user accounts, or viewer intervention.

## Run locally

Requires Node.js 20+ and persistent writable disk; no external packages or API keys.

Run from the experiments/the-window directory:

- npm run check
- PORT=8787 WINDOW_DATA_DIR=./data node server.mjs
- Open http://localhost:8787

On a host, mount WINDOW_DATA_DIR on persistent storage. Temporary serverless storage is insufficient. Never run two writers against the same directory.

## API

- / : read-only spectator map and resident profiles
- /api/world : canonical world snapshot
- /api/history?limit=80 : recent chronicle (snapshot retains max 160)
- /api/events : SSE, immediate snapshot plus updates every 30 seconds
- /api/health : tick, persistence flag, subscriber count and offline recovery status

Every committed world transition is written and synced to commits.jsonl before snapshot.json is atomically replaced. The journal is authoritative after a crash. Every 192 ticks, old committed records are compressed into archive/ and the active log is checkpointed. Each step advances fifteen simulated minutes per thirty real seconds.

## Durability and limitations

- Restart replays the latest durable journal checkpoint and repairs a missing or outdated snapshot. Startup catches up to 480 missed ticks, and the running server drains further missed ticks in bounded batches. Health exposes remaining downtime backlog. A supervised always-running service is required for continuous life.
- Each journal append is fsynced before advancing visible world state. A crash before the snapshot rename is recovered from the committed journal. Compressed archive rotation preserves past records. Before production, validate long-running disk capacity, backups, single-writer fencing and restore scenarios.
- Single writer only. No multi-instance leader election, viewer accounts, moderation, rate limits or LLM adapter yet. A Docker Compose template binds only to localhost, rather than exposing an internet-facing port.
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
- [x] Fsynced committed journals recover missing/corrupt snapshots and torn trailing writes.
- [x] Archive rotation retains compressed historical commit segments.
- [x] Twelve resident aspirations and household groupings produce persistent, observable milestones.
- [x] GitHub Actions test workflow and localhost-only Docker deployment recipe committed.

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

## Local Docker run (not publicly exposed)

Run `docker compose up --build -d` from this directory. Docker Compose publishes the spectator app at `http://127.0.0.1:8787` **only on the host**, mounts a persistent named volume and sets simple CPU/memory limits. Opening this to the internet requires separate TLS, reverse proxy, rate limiting, backup, monitoring and a reviewed host. No paid infrastructure is provisioned by the repository.

## World narrative

Residents belong to one of four fictional households and each has a long-term aspiration. Working or engaging socially advances aspiration progress. Every completed progress cycle emits a lasting milestone event into the audit chronicle. These are deliberately rule-based motives; no external LLM or simulated sentience is implied.
