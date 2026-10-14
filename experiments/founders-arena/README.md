# Founders Arena · Window into a World (candidate v0.1)

A **standalone, offline, zero-dependency** spectator view of a deliberately small, deterministic, fictional society. This is a candidate surface for the existing Founders Arena research program, **not** a replacement for its existing civilization engine or an LLM-driven agent environment.

## Run

Open `window.html` in a modern browser. No server, keys, model downloads, SDK, or network requests are needed. Play or step forward, click residents to inspect their histories and relationships, drag the replay timeline backwards, export the exact event/snapshot record, and import a record with deterministic replay verification.

Optional local serving:

```sh
python3 -m http.server 8765 -d experiments/founders-arena
# open http://localhost:8765/window.html
```

## Model

- Four named **policy-based simulated agents**: builder, researcher, caretaker, explorer. These are not LLMs.
- Seeded pseudo-random action variation, shared food/wood/knowledge/resilience, weather stress, upkeep, relationship values, and bounded personal memory.
- Every observed world action is an event with its actor, day, category, measured delta, and an explicit *simulated* evidence basis.
- Self-contained, replayable JSON snapshots. Import rejects files whose snapshots do not match a fresh replay from the claimed seed.
- The display never represents numeric trust as real emotions, simulated events as observations of real people, or narrative summaries as validated scientific behavior.

## Architecture and next gates

**Current state:** isolated UI/logic candidate with deterministic testing. No live deployment, Systemia mission admission, graduate competency, biological modeling, real-agent autonomy, payment, or public spectator hosting is claimed.

**Next:** 1. Admit and deduplicate a Founders Arena spectator mission in Systemia. 2. Attach the original Founders Arena runtime as a *read-only* versioned event adapter with strict source provenance; leave the old engine untouched. 3. Add authoritative run IDs, hash-chained receipts and policy/agent version identity. 4. Test headless replay, accessibility, mobile performance, and long-running sessions. 5. Expose only approved non-private spectator data through a public route, with real deployment and health receipts. 6. Evaluate policy/LLM simulations in bounded Systemia University missions, not as entertainment-driven leaderboards.

**GitHub safety:** This candidate must not be merged or broadly CI-dispatched until the October 2026 recovery quarantine is reconciled. Avoid production/source release claims based only on this file.