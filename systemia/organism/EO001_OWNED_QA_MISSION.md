# EO-001: an owned Systemia mission instead of founder-in-the-loop QA

**Status: draft source and offline integration proof; not yet field-admitted or resident on Node002.**  
**Architecture:** Original Systemia goal runtime + owner-only goal store -> bounded Forge internal QA -> durable private receipt -> external delivery reconciliation -> Lab independent inspection.

## What actually moves now

`systemia/organism/eo001-owned-qa-mission.mjs` is a narrow, concrete adapter using the **existing** `goal-runtime.mjs` and `goal-store.mjs`. It does not create a competing mission database, identity provider, imaginary new original agent, or a fake signed receipt.

- It locates **exactly one** already-generated private Gate 0 bundle under the owner-controlled EO-001 handoff state.
- Before claiming internal QA, Systemia creates an owner-only persistent goal with three dependency-bound work keys.
- It runs the real independent Python Forge reviewer from the existing EO-001 source, using the original private sanitized receipt and Lab offline-review JSON. That reviewer authenticates the fixed-schema agreement and validates source-versus-ZIP SHA-256 equivalence. No model run occurs.
- Successful internal QA becomes a private mode-0600 receipt and a stored immutable bundle hash. Restarting or repeating the mission does not rerun completed work. An interrupted **read-only** QA step can be reconciled; changed or corrupted evidence causes a hold.
- The external-delivery work key uses Systemia's **forced signed human gate**. This source does not grant the approval, use Discord, copy files out, or infer delivery from a filesystem write. Chandra's evidence attachment was **already sent manually on November 9**, but we have no independently authenticated owned Discord receipt; thus external delivery remains `NOT_VERIFIED_BY_OWNED_PROVIDER`, not `not sent`.
- The final Lab-review work key remains pending. Nothing claims Chandra has inspected the file or that the EO-001 four-case Qwen experiment is approved.

The CLI prints a safe summary, not a private JSON or original raw evidence payload. The persistent goal state remains in `~/.local/state/evercraft/eo001-handoff/systemia-missions/` under the owner's custody.

## What this is not

This is **a deterministic internal QA worker, not a commissioned Raven specialist**. It does not prove original agent roster restoration, independent hardware provenance, Juniper/Sentinel worker lifecycle, Saban remote dispatch, or any paid production effect.

No Base44 traffic, new host, node elevation, service modifications, remote agent enrollment, provider payments, email, Discord send, or model inference occurs.

## Resident pickup option, disabled by default

`systemia/organism/eo001-resident-timer.mjs` renders a narrowly bounded user-systemd timer/service for a **previously approved, owned NextGen checkout**. The timer would recheck the same private mission every five minutes while the user-systemd instance is running. Duplicate QA is suppressed by persisted mission state.

The optional `--write-units` mode **only writes two user-owned unit files**; it does not call `systemctl`, enable, start, or restart anything. In the default mode it only reports preparedness. Units specify the actual local Node executable and existing source file; use `ProtectSystem=strict`, `ReadWritePaths` restricted to the EO-001 private directory, `RestrictAddressFamilies=AF_UNIX`, `NoNewPrivileges=yes`, and `PrivateTmp=yes`. An authorized owned operator must independently verify these restrictions work on the actual HP/WSL2 user-systemd deployment, using an approved source revision and a documented rollback, before installation and enablement. WSL cold-boot persistence is **not** established by this timer.

**No live unit installation/activation is claimed.** It must not silently override Node002's existing signed shadow telemetry or the separately registered narrow hash-only outbound worker.

## Evidence / acceptance

```sh
node --test tests/eo001-systemia-owned-qa-mission.test.mjs
node --test tests/eo001-resident-timer.test.mjs
```

Offline tests use actual Forge QA code and synthetic private handoff artifacts. They verify no premature delivery, mutation/replay hold, restart reconciliation and opt-in-only user-unit creation. They cannot certify deployed agent execution.

**Operational acceptance still requires** current owned NextGen checkout+source pin, owner-approved readonly user-unit deployment (or admission into an already-running Systemia resident), actual QA field receipt, authenticated status/receipt export through the existing Yard/Remote Operator control path, independent external-delivery evidence, and a separate original commissioned-agent canary. Maintain #1707 and #1332 as open field blockers until that happens.

Tracking: [draft PR #1937](https://github.com/jgaethle10/forge-operator/pull/1937), [original commissioned roster draft PR #1706](https://github.com/jgaethle10/forge-operator/pull/1706), [Node002 remote authority #1332](https://github.com/jgaethle10/forge-operator/issues/1332), [EO-001 #1705](https://github.com/jgaethle10/forge-operator/issues/1705).
