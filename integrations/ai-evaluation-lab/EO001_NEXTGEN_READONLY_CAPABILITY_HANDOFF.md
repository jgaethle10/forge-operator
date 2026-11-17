# EO-001 Gate 1 | NextGen read-only kernel capability handoff

**Status: SOURCE REVIEW ONLY. No physical NextGen inspection has been run by this GitHub change.**
Lab [draft PR #51](https://github.com/kaulastudies/ai-evaluation-lab/pull/51)
is **NOT FROZEN**. Forge
[draft PR #2149](https://github.com/jgaethle10/forge-operator/pull/2149)
is not an executable physical Gate 1 experiment.

## Purpose and precise evidence class

The opt-in `eo001-nextgen-readonly-capability-preflight.mjs` checks
**only host-level, read-only Linux cgroup v2 metadata**. It deliberately does
**not** need an existing synthetic scope, does **not** create one, and does
**not** open or write `cgroup.kill`. It opens a fixed native
`/sys/fs/cgroup` directory with `O_RDONLY|O_DIRECTORY|O_NOFOLLOW`,
confirms the cgroup2 mount type, reads the root
`cgroup.controllers`, `cgroup.subtree_control` and `cgroup.type` controls,
and reads the observer's unified membership and boot UUID from procfs.
Kernel metadata reads are bounded. Empty controller files are valid
capability-negative observations, not successes or parser failures.

The returned JSON reports only booleans for the root `cpu`, `memory` and
`pids` controller names, a domain-type value, and **SHA-256 digests**
of boot UUID, observer membership and root directory identity. It excludes
raw boot UUID, raw cgroup path, hostname, username, PID, token, model response
and private evidence. Even digests can be correlatable across receipts;
**do not post raw output publicly without a specific privacy review**.

A report with state `ROOT_CGROUP2_READONLY_METADATA_REVIEW_REQUIRED` means
only that expected controller names and a domain root were observable.
If missing, the explicit state is `ROOT_CGROUP2_CONTROLLERS_INCOMPLETE_HOLD`.
If the kernel mount or records cannot be inspected, the CLI prints a
bounded `HOST_READONLY_PREFLIGHT_BLOCKED` negative result and exits 2.
Do **not** relabel a negative outcome as passing cleanup evidence.

## Opt-in invocation when the physical host owner chooses

This chat session has **no private NextGen command bridge**, so GitHub CI
cannot establish HP NextGen/WSL2 kernel capabilities. The physical operator
must independently choose the intended host and a locally verified checkout
containing the reviewed source. **No Git fetch, package installation, WSL
restart, service change, or branch switch is required by this preflight.**

From a **locally source-verified checkout** (Node.js 22, Linux/WSL2):

```bash
node integrations/ai-evaluation-lab/eo001-nextgen-readonly-capability-preflight.mjs
```

Run from the working tree's root. This is a single read-only process; there
are no CLI options, config changes, side effects or network calls. Retain
the result privately with its locally verified source Git revision/hash.
If source checkout or host identity is not known, **hold** rather than run
an unpinned copy. There is no need to rerun the previous Gate 0 handoff.

CI uses an injected **temporary fake cgroup filesystem** and must never be
labeled as a physical NextGen/HP capture. The fixture's cgroup2 response
is simulated; host-run results require separate independent provenance work.

## Evidence NOT established by any result

- No existing named synthetic scope was found or inspected by this module;
  `cgroup.kill` presence at the intended target leaf is **NOT PROBED**.
- No user systemd manager, user-scope delegation, effective write access or
  kernel `cgroup.kill` usability was proven.
- No target ownership, live detached session child, exact scope resource
  limits, same-original-scope FD across stop, bounded recursive
  `populated=0` cleanup or negative-receipt sink was proven.
- No stop mechanism has been selected, reviewed or approved as a physical
  execution route; `systemd StopUnit` and held-FD `cgroup.kill` have
  materially different semantics and must not share a permit.
- No Lab/owner approval, contract freeze, model inference or Systemia
  resident service action occurred.

## Independent review sequence after a genuine physical receipt

1. Verify the **host/source provenance privately**, including kernel
   source context and a separately recorded Git source pin. Review only
   minimized, consented findings with the Lab.
2. If the root capability metadata is missing, stop the investigation at
   the hold. Do not try to fix delegation or enable controllers automatically.
3. Only if an already-existing, independently authorized, exact synthetic
   scope is made available, separately review the existing
   `eo001-cgroup-kill-readonly-capability.mjs` held-FD survey, observer
   boundaries and its independence constraints. No stop is permitted.
4. Obtain a **method-specific** reviewed protocol amendment for actual kernel
   stop semantics, race boundaries and privacy-minimized evidence. Then
   require a distinct host-owner admission and independent Lab review
   of the same configuration before **any** physical synthetic stop.
5. Keep the Qwen four-case experiment and the Lab v0.2 freeze on HOLD until
   there is genuine, separately examined, bounded synthetic containment proof.

This preflight is a capability **inventory**, not a containment **test**.
