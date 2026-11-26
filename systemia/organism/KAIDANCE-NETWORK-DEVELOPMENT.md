# KAIDANCE → Evercraft Network / Saban: five-minute mission review

Status: **source integration for the existing KAIDANCE heartbeat**, awaiting merge into main and actual owner-resident observation. This is not a new cron job, independently running worker, deployed network service, continuous code-generation agent, or verified hardware recovery.

## The connection

Kaidance's canonical company heartbeat already inventories `evercraft-network` under the `education-network` lane, but prior to this change that lane carried **no active development adapter**. Network/Saban revival remains in draft PR [#2240](https://github.com/jgaethle10/forge-operator/pull/2240). The new adapter observes that **same PR** every scheduled five-minute heartbeat, without reading Base44 or creating a replacement scheduler.

- Mission: `evercraft-network-saban-continuity-revival`.
- Stable goal: `network-cross-device-encrypted-recovery`.
- Registry: `registry/kaidance-network-development.v1.json`.
- Existing workflow: `.github/workflows/kaidance-frontier-field.yml`, cron `*/5 * * * *` (best effort, NOT a guaranteed wall-clock schedule).
- Existing authority: Systemia review and existing Saban Network branch. No delegated GitHub write access.
- Read-only entrypoint: `systemia/organism/kaidance-network-development.mjs`.
- Existing company bridge: `kaidance-company-heartbeat-runner.mjs` and `kaidance-next-action.mjs`.
- Private/CI observation: `artifacts/kaidance-network-development/latest.json`, `mission-snapshot.json` and cached `state.json`.

The adapter uses a short-lived GitHub Actions token with read-only `contents`, `actions`, and `pull-requests` permissions. It reads **only** the configured Network draft PR and bounded pull-request Actions history for that PR's exact head SHA; no user-selected URL, arbitrary command or PR write. The workflow runs the adapter before the existing company heartbeat and supplies the observation file as a source to the established company queue. It does not create another Systemia service or send messages to NextGen/Penguin.

## Five-minute review contract

Each heartbeat can detect a new PR head, an exact-head CI pass/failure/pending run, or source inaccessibility. When the evidence fingerprint changes, Kaidance emits one stable `network:...` work key. The existing company next-action reconciler considers that work key alongside the rest of Evercraft. Repeated unchanged heartbeats reuse the decision and must **not** pretend to produce new engineering work.

A successful `Network Saban Offline Resilience Tests` and `Forge checks` combination means **source CI green** for that exact head. It does not verify an encrypted cross-host delivery or real WAN outage. When those are green the next scoped action is `run_authorized_cross_device_encrypted_outage_test`, not `deploy_network`.

Every candidate reports:
`execution_authorized:false`,
`code_write_authorized:false`,
`production_mutation_authorized:false`,
`field_validated:false`.

No code-generation worker is started; no PRs are created, merged or pushed; no carrier is contacted; no firewall or router is changed; no satellite or field coverage is asserted. Missing token, stale/forged receipts, PR identity mismatch, unverified checks or current-head CI failures remain `held` or review-only. This intentionally does **not** satisfy the future requirement for autonomous code development on every heartbeat, which still needs a registered Systemia/Saban worker, scoped write permission, resource budget, immutable evidence and an independently verified execution receipt.

## Proof and deployment gate

```bash
node --test tests/kaidance-network-development.test.mjs tests/kaidance-network-heartbeat-integration.test.mjs
node systemia/organism/kaidance-network-development.mjs --out artifacts/kaidance-network-development
```

The second command requires a valid private `GITHUB_TOKEN` to read the connected PR metadata; without one it writes a **held** report rather than inventing a green state. GitHub Actions supplies only an ephemeral read token. The next existing company heartbeat consumes the output with `SYSTEMIA_NETWORK_DEVELOPMENT_RECEIPT_FILE`.

Actual owned deployment is only verified after the existing `kaidance-company-heartbeat` resident service is shown live with independent, consecutive cycle receipts, and the downstream Systemia goal is observed. Source merge and CI success alone do not establish an active five-minute private runtime. Do not export local network addresses, pairwise keys, field state directories, or private receipts into the public PR.
