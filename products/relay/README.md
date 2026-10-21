# Relay | Evidence-backed private pilot intake

**Status: local pilot verified. Public launch and deployment are NOT approved.**

Relay is Evercraft's post-meeting alignment product. This record is an engineering intake, not a claim that the source code has been imported or deployed through Systemia, Fallen or Yard.

## Product source and reproducible proof

- Founder-provided/source archive: https://drive.google.com/file/d/1VX_L92dbn9gGZP92mybgF7wK7yXXnjy-/view?usp=drivesdk
- Archive SHA-256 at intake: `a148f99608c3480683a661e8eb6b88da11653cf357e882c4db93743b1fe8d3ea`
- Original marketing archive: https://drive.google.com/file/d/1edxUk6TA3NQDpGVREwCqijBcTkoq0Pc3/view?usp=drivesdk
- Source: independent Node.js local server, static browser UI, end-to-end Node test. No Base44 dependency.
- Repro: extract the product ZIP, change into `relay-private-pilot`, run `node --test tests/e2e.test.mjs`. For local owner preview start with an explicitly private `RELAY_OWNER_TOKEN` and follow the README.
- Oct 19 verified local test: 1 test passed, 0 failed. End-to-end narrative exercised two fictional replies, one potential date/milestone contradiction, a human-confirmed version 1 decision, and one acknowledged version. This is *not* a customer result.

## Canonical truth boundaries

Implemented locally: owner-created meetings, two to twelve individually link-bound participants, independent structured check-ins, date/milestone comparison, recorded human resolution, versioned summary, individual acknowledgment, local persistence and restart test.

Not yet established: calendar-triggered prompts, automatic messages, semantic AI inference, secure account tenancy, SSO, public TLS deployment, link revocation/expiration, enterprise-ready retention/consent, billing, paying customers, ROI, or native Systemia/Fallen/KSS runtime integration.

The detection engine is deterministic and limited to structured milestone/date comparison. It does not evaluate free-text meaning, verify whether the meeting occurred, adjudicate truth, or guarantee understanding from an acknowledgment.

## Launch evidence and editorial treatment

The earlier 12-second demo with synthesized tone/beep audio failed creative review. On Oct 19 a 28-second silent 1920x1080, 30fps product walkthrough and a six-image 1080x1350 evidence carousel were produced from the original UI interacting with its local Node API through a restricted browser bridge. Both use fictional participants and require human brand/editorial approval. The silent walkthrough is **not** an approved cinematic commercial.

## Required release admission

1. Import source as reviewable individual files and add CI for backend, browser UI, and security tests. This intake alone does not accomplish that.
2. Protect tokens and sensitive records; implement invitation expiration, revocation, identity and tenancy boundaries, consent and retention policy, and backups before external access.
3. Validate calendar integration and notifications only when individually demonstrated.
4. Use only truthful product captures for marketing. Synthetic cinematics need explicit illustration labels and continuity/brand approval.
5. Have Fallen perform true scene and soundtrack production under its verified creative gates. Do not replay the rejected synthetic score.
6. Keep Systemia/Founder approval for any deploy, public demo link, buyer communication, or publishing.

No deployment, paid model generation, outreach, or publication is authorized by this intake.
