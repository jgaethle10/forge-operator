# EO-001 Gate 1 integrated offline source checkpoint

**State:** research draft / NOT FROZEN / NO physical execution admission.

## Why this branch exists
Integrate existing research *without* silently replacing reviewed physical
NextGen source checkouts or granting model/remote/service permissions.

Source ancestry: Forge PR #2047 at
`ea25386e56095362623cffeebb7d128b66351cfb`.
This already contains the gateway source and timing/fingerprint fixtures of
PR #2033, the cgroup resource-readback and new-session witness from
the earlier research chain, and the escaped-session **negative** control.

Ported into this branch:
- PR #2045 exact offline-only supervisor observer and adversarial tests
  (source `bdef0490c82bb1a56c940981c8681555507b7fe8`).
- PR #2042 owned user-systemd bus environment checks and cleanup ID
  preservation, adapted to retain the newer v4 synthetic session witness
  contract (source `1e89a0c914fd2d59d789e91a32ed475ace720973`).
- Narrow `authorized_at:at.toISOString()` guard reconciliation in
  `systemia/saban/microseed-pairing.mjs`, matching current main's blob,
  to address the two unrelated full Forge CI failures on the source ancestry.

**The resulting source revision must be independently reviewed and pinned.**
Individual prior revision reviews do NOT automatically transfer to combined
source. A passing integration CI is not a physical proof, a Lab freeze, or an
authorization for Qwen.

## Evidence currently present
- Operator-supplied physical NextGen read-only cgroup preflight at
  `03de0fcf1fedd2d9848c4d3ce22a47a068359cb0`.
- Operator-supplied one-shot synthetic scope resource readback at
  `1e89a0c914fd2d59d789e91a32ed475ace720973`.
- Offline/CI real Linux process-group escape *negative control*: a detached
  child can survive parent process-group termination. It is not a systemd
  cgroup forced-kill proof.
- Independent supervisor observation contract tests operate on injected
  kernel/systemd fixture data, not NextGen procfs.

## Joint Lab boundary
Lab PR #51, experimental contract v0.2, is **NOT FROZEN**.
Prior to any model scenario the same full integrated revision, runtime/model
hashes, precise prompt/context bytes, effective generation settings,
15-second full warmed decision / six decisions per case, startup/warmup
and cleanup budgets, and dual independent matching freeze approvals remain
required. No provider effects, Systemia hold release, worker deployment,
commissioned-agent restoration, or production privileges are authorized.

## Missing proof
- No reviewed live supervisor collector observing an active physical scope.
- No independently verified cgroup subtree empty after killing a still-live
  separately detached descendant.
- No PID-reuse-safe process handle and boot/starttime identity protocol
  with a safe signaling strategy.
- No model-appropriate resource limits or swap policy; synthetic 256 MiB is
  **not** a Qwen sizing claim.
- No actual four-case Qwen Gate 1 decisions or external Lab approval.
- No independent original-host provenance attestation.

All negative cases must remain preserved. A broad CI failure must be
explained or resolved and not hidden behind focused green tests.

## Product reusability
The cgroup observation/receipt validation could eventually support
Black Box incident reconstruction and Spider Society containment evidence,
but this draft does not claim these products are integrated or commercial.
