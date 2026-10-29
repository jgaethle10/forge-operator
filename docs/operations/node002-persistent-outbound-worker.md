# NextGen Node002: persistent outbound hash worker commissioning

**Status: REVIEW HELD until source and physical host approval.** This document is for the *existing* Windows 11 HP NextGen running Ubuntu WSL2. It does not authorize new hosting, public ports, arbitrary command execution, remote filesystem operations, a second device identity, RIVET/AliEV data, or Base44.

## Why this is the current lane

PR #1299 was an earlier unsigned owner-local inventory prototype. It does **not** run the live NodeSeed broker protocol and must not be installed as a second worker. The current supported worker source is PR #1686:

- `scripts/node002-persistent-outbound-worker.mjs` supervises the **existing** local NodeSeed as an *outbound* broker agent.
- `systemia/network/outbound-node-agent.mjs` uses broker challenge and NodeSeed Ed25519 attestation, then authenticates encrypted command envelopes. Its Node002 policy allows only health/capacity and 120-second-bounded `systemia.content-hash.v1` leases, jobs and release.
- The restricted worker now binds the exact locally preflighted device fingerprint **both during registration and on every subsequent advertised-capacity poll**. A changed identity is a hard error, not a re-enrollment invitation.
- The canonical NodeSeed `/v1/jobs` accepts an outer `idempotency_key` and `input:{payload:{value:...}}`; a duplicate nested input idempotency key is optional but, if present, must agree. This is validated by the end-to-end CI proof.

The existing v1.2 **shadow telemetry service** and the read-only Fabric runtime remain separate; do not switch off or repurpose either.

## Source gates before host installation

1. Independent source review of PR #1686 with a pinned **full 40-character Git commit SHA**; GitHub Actions is evidence of source tests, not physical commissioning.
2. Verify the live owner-controlled HTTPS broker `https://fabric.systemiacommandcenters.com/v1/remote/health` and its **exact broker instance and private Yard deployment receipt**, not merely a healthy public `/mcp`.
3. Verify the *existing* loopback NodeSeed receipt under `~/.local/state/evercraft/organism/compute/nodeseed-receipt.json` and 0600 allocator-token path. Do not paste tokens or keys into chat/logs/GitHub.
4. Ensure the temporary `node002-live-bridge-canary.mjs` and any competing `remote-admission-service.mjs` process are absent. Never run two agents against the same identity and lease stream simultaneously.
5. Confirm the tested worker source has the exact device-key binding and canonical hash-job transport. Never relax this policy to repair a denied payload.

The worker's own `--preflight` is **read-only** and checks the receipt, local capacity, and pinned public broker. It does not install a service.

## One-time operator commissioning on the existing HP

Do this only after review of the exact source SHA and while Ubuntu WSL2/systemd and the existing NodeSeed are healthy. Work in an immutable detached worktree; never install from a mutable day-to-day checkout.

```bash
set -euo pipefail
REPO="$HOME/evercraft-qa/forge-operator"
WORKTREE="$HOME/evercraft-qa/node002-persistent-worker-reviewed"
EXPECTED_REF="<independently-reviewed-full-40-hex-commit>"

test -d "$REPO/.git"
git -C "$REPO" fetch --no-tags origin feat/node002-persistent-outbound-worker-20261028
test "$(git -C "$REPO" rev-parse FETCH_HEAD)" = "$EXPECTED_REF"
test ! -e "$WORKTREE"
git -C "$REPO" worktree add --detach "$WORKTREE" "$EXPECTED_REF"
node "$WORKTREE/scripts/node002-persistent-outbound-worker.mjs" --preflight
```

Only if preflight succeeds and the operator intentionally approves persistent outbound **hash-only** work:

```bash
bash "$WORKTREE/scripts/install-node002-persistent-outbound-worker.sh" \
  --repo-root "$WORKTREE" --expected-ref "$EXPECTED_REF" --activate
```

The install is **ordinary-user** systemd only; no sudo, public HP ports, OS-wide service, or arbitrary SSH/RDP agent. No installation was performed by authoring this documentation. To inspect without printing a token:

```bash
node "$WORKTREE/scripts/node002-persistent-outbound-worker.mjs" --status
systemctl --user show evercraft-node002-outbound-worker.service \
  -p ActiveState -p SubState -p NRestarts -p ExecMainPID --no-pager
```

A local status `ready_now:true` means *fresh successful broker polling according to the worker's own recorded state*. It is **not** enough by itself for an independent production claim. Broker health alone is also not enough.

### Physical cross-machine acceptance (separate operator-approved pilot)

1. From the **existing Penguin/Yard private broker control surface**, independently verify the outbound session for exact Node002 identity and public-key fingerprint, recorded timestamp, and absence of any second competing session.
2. Submit **one fixed `systemia.content-hash.v1` job** with a small harmless JSON `value`, TTL <=120,000 ms, and a unique idempotency key. Route only through a short-lived broker allocator grant, never a browser-exposed admin token. Do not substitute `inventory` or generic `exec`.
3. Confirm that actual HP NodeSeed returned the expected SHA-256 digest, matching broker request/job IDs and worker receipt; verify from an independent trusted control path and retain the private Yard transport receipts.
4. Prove replay behavior with a same-key retry, lease release and revocation/disconnect, and service restart. An uncertain completion must be held, not re-run blindly.
5. Separately establish a **device-origin signed completion** if the result is to be claimed as a cryptographically independently verified physical execution. Session-encrypted broker responses and `registered_worker_receipt` hashes alone are not a device-signed compute receipt.
6. Verify recovery after a **real Windows reboot or WSL shutdown**. A Linux user systemd service cannot wake Windows/WSL by itself; the existing WSL startup keeper and scheduled tasks must remain separately commissioned.

Until this physical acceptance is complete, status must remain `source_ci_passed_physical_worker_not_proven`, with no production service / first autonomous job claims.

## Stop and rollback

```bash
systemctl --user stop evercraft-node002-outbound-worker.service
systemctl --user disable evercraft-node002-outbound-worker.service
```

These stop/disable only the **new** user-level worker. Preserve the existing shadow agent, private inbox, Fabric runtime, public Penguin ingress, key material and previous service definitions. Review the active lease and broker session before deleting private state; do not erase ambiguous completion evidence.

**No credentials, device private keys, remote operator grants, or unredacted hardware inventory should appear in PR comments, GitHub Actions logs, or public terminal output.**
