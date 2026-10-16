# Game Fabric · Youth & Development Intake Bridge

**Scope:** Review-only integration seam inside the existing Systemia source repository.

This folder does **not** contain the proprietary Youth Practice Room source, a live coaching app, or youth/player records. The v0.1 offline demonstration is held in the existing Game Fabric Terminal Vault. Its verified custody URL and source checksum are recorded in `youth-bridge.mjs`.

## Purpose

`createYouthGameFabricHandoff(record)` validates a limited portion of the offline exports from the Youth Practice Room and Development Studio, preserving an internal review record with:

- source schema, SHA-256 fingerprint and release custody;
- total practice duration or three-session learning progression;
- explicit non-contact, group-only and staffing-review controls;
- pending Systemia mission state and missing human/release gates.

Use the canonical mission `sports-weekly-opponent-intelligence-001`. This is an **adapter**, not a new sports ontology, scheduling agent, player-development profile, or replacement for Game Fabric / Chronosport / Talent Atlas ownership.

## Run the focused tests

```bash
node --test systemia/game-fabric/youth-bridge.test.mjs
```

These are synthetic contract tests. Passing them **does not** prove practice safety, organizational adoption, game-film rights, system deployment, or Systemia admission. The initial offline prototype separately reported 63/63 browser checks and an 80-case configuration matrix; that earlier QA is not rerun by this repository test.

## Gates and data policy

- **Systemia admission remains PENDING.** Nothing in this module grants it.
- Adults retain supervision and curriculum/safety decisions. No athlete identities, medical details or private minors' information belong in this repository.
- This validator is a first-line denylist, **not** a privacy certification or a substitute for a security review.
- Coach notes can contain unrecognized identifiers; external intake must add data minimization and independent privacy assessment before any upload route is enabled.
- The public GitHub repository is not suitable for proprietary film, private student information, private playbooks, or production secrets.
- No automatic organization outreach, payments, external release, or live production changes are authorized by this module.

**Next:** Human-reviewed Systemia intake, a permissioned adult-coach pilot, then a coach-room release with separate verification receipts. Keep the original offline artifact and protected source in the Drive vault until an appropriate private code repository and deployment pathway are established.
