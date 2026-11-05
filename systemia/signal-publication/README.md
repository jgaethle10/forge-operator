# Evercraft Signal | Official-source Watch v1

Read-only source observation for Signal editorial operations. **Not** a public emergency alert feed or an independent radiation-monitoring system.

## Source scope and evidence limitations

The adapter uses exactly two allowlisted Savannah River Site official releases (#2 and #3) and the official news-release archive. It detects disappearance of known official phrases, source retrieval failures, and untracked release links. This is not a full semantic comparison, so matching phrases do not prove that no other text changed.

Each receipt records: retrieval time, official URL, content SHA-256, known-assertion check, explicit source coverage state, and candidate release links. Unavailable sources are monitoring gaps, not negative hazard results.

The Systemia Signal Fabric bridge returns normalized candidate records marked as *not sent*. Review candidates never become verified contamination or urgent public hazard alerts.

## Workflow

Workflow: `.github/workflows/signal-official-watch.yml`.

GitHub Actions schedule: six-hour interval (subject to GitHub scheduling, permissions and source availability), plus manual dispatch. Each run uploads a 30-day receipt artifact and a short operator summary. An actual scheduled run is required before reporting operational uptime.

Tests: `node --test tests/signal-official-watch.test.mjs tests/signal-fabric-bridge.test.mjs tests/signal-incident-public.test.mjs`

Source observation command: `node systemia/signal-publication/official-watch.mjs --out artifacts/signal-official-watch/latest.json`

## Hard boundaries

- This monitor does not independently measure radiation, exposure or a contamination plume.
- FAA restrictions are not contamination boundaries.
- A quiet source or an unavailable source never proves safety.
- A changed phrase or new release link triggers **editorial review**, not publication or emergency instructions.
- No paid checkout, public case modification, subscriber alert or private notification is performed.
- The public incident page remains a dated editorial snapshot, not a live service.

## Next gate

Attach approved receipts to Systemia's persistent incident ledger, replay and acknowledgment system; then build a typed public freshness view with measured source-health evidence. Add new independent source families only after verifying their reliability and time semantics.
