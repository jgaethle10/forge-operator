# NextGen Node002: owned government-browser commissioning

**Goal:** verify real strictly local Playwright/Chromium rendering of public DSHS HRSN provider guidance on the existing HP Laptop 17 (hostname NextGen) under Ubuntu WSL2. Reuse the first-party Evercraft Browser Worker, not TinyFish or another browser agent. **Not a Systemia-dispatched remote job.**

The native worker launch is now bound to 127.0.0.1, without changing the existing remote operator or shadow telemetry services.

## Safe local run on the actual NextGen Ubuntu WSL terminal

Create a separate checkout so active resident Evercraft services are not changed:

~~~bash
mkdir -p "$HOME/evercraft-qa"
git clone --depth 1 --branch feat/node002-first-party-browser-local-canary-20261025   https://github.com/jgaethle10/forge-operator.git   "$HOME/evercraft-qa/nextgen-browser-commission"
cd "$HOME/evercraft-qa/nextgen-browser-commission" || exit 1

node scripts/nextgen-browser-commission.mjs --status
node scripts/nextgen-browser-commission.mjs --preflight

# Only if pinned Chromium is not ready, explicit user-space setup:
node scripts/nextgen-browser-commission.mjs --install

# Actual owned local Chromium page canary, no login or form:
node scripts/nextgen-browser-commission.mjs --run
node scripts/nextgen-browser-commission.mjs --status
~~~

The --run action requires Linux hostname NextGen. The target is hard-coded to https://www.dshs.wa.gov/information-potential-medicaid-contractors. It tests the worker's own public read-only API, checks page text, screenshot bytes and worker SHA256 receipts, and verifies an attempt to browse a private 127.0.0.1 target is denied. No user-supplied arbitrary URL or command is accepted.

## Evidence and limits

- Private local state: ~/.local/state/evercraft-nextgen-browser/preflight.json and last-run.json, permission 0600.
- A PASS records observed local host, source commit, verified read-only worker evidence hashes, private-target rejection and timestamp.
- Receipt remains **unsigned_local**. It explicitly states remote Systemia work admission NOT verified, cross-node dispatch NOT verified, human authenticated handoff NOT verified and application submission false.
- Does not change Node002 agent, node remote_jobs_enabled, Systemia, Passport, services, router, inbound firewall, public DNS, credentials, provider portals or fees.
- Setup is optional and uses existing native runtime's user-space npm/Playwright dependency flow, with no sudo/system package manager. Missing WSL Chromium libraries yield a fail-closed result.
- Local receipt is not production lease proof, agency registration or DSHS application. Statewide HRSN applicant form cannot be saved partway through; gather prerequisites before a human submission.

## Real physical WSL2 launch failure, 2026-10-26

The first physical NextGen `--install` reached Playwright's browser startup but returned `browserType.launch: Target page, context or browser has been closed`. The previous launcher truncated Chromium's actionable stderr, and automatically re-running `--install` is **not** a justified repair. `--run` then failed closed before browsing. The resident Node002 agent remains shadow, `remote_jobs_enabled:false`, and HTTP 402 telemetry remains independent.

**One safe next command, run from the already cloned checkout:**

~~~bash
cd "$HOME/evercraft-qa/nextgen-browser-commission" || exit 1
git pull --ff-only
node scripts/nextgen-browser-diagnose.mjs
~~~

Only paste these actual commands, **not** the Ubuntu welcome banner, previous shell prompts (`coach@NextGen:...`), or JSON output back into Bash.

The read-only diagnostic checks the **already downloaded** pinned headless shell and missing runtime `.so` libraries with `ldd`, then attempts just one local `about:blank` Chromium startup using `DEBUG=pw:browser`. It publishes a bounded **redacted** stderr-tail, missing shared-library names and failure class. It cannot install packages, change services, submit forms, enable remote control or run on other hosts. Share this bounded JSON diagnostic; then choose a minimal, evidence-backed repair, possibly OS-provided dependencies if **confirmed**, before any further `--install` attempt. Do not blindly run `sudo npx playwright install-deps`.

## Oct 26: physical NextGen missing-library root cause confirmed

Physical HP owner-provided read-only diagnosis (2026-10-26 19:15:27 UTC), Ubuntu 26.04 / Playwright 1.63.0:
- `binary_found: true`
- `chromium_launch_state: blocked_missing_shared_libraries`
- `libnspr4.so`, `libnss3.so`, `libnssutil3.so`, `libsmime3.so`, `libasound.so.2` absent.
- None of this proves public-browser execution, a government portal session, or remote agent dispatch.

Verified Ubuntu 26.04 package mapping: `libnss3` supplies `libnss3.so`, `libnssutil3.so`, `libsmime3.so` and depends on `libnspr4` (for `libnspr4.so`). `libasound2t64` supplies `libasound.so.2`.

This is a **real OS package installation** and cannot be done by the read-only GitHub agent. The device owner/admin should review the apt simulation before consenting to a limited install.

```bash
# On physical HP NextGen Ubuntu terminal (do not copy any old terminal transcript)
sudo apt-get update
apt-get -s install --no-install-recommends libnspr4 libnss3 libasound2t64

# Review apt's proposed changes; only if expected:
sudo apt-get install --no-install-recommends libnspr4 libnss3 libasound2t64

cd "$HOME/evercraft-qa/nextgen-browser-commission" || exit 1
node scripts/nextgen-browser-diagnose.mjs
node scripts/nextgen-browser-commission.mjs --preflight

# ONLY after preflight reports ready:true, test the public DSHS GET:
node scripts/nextgen-browser-commission.mjs --run
node scripts/nextgen-browser-commission.mjs --status
```

Do not rerun `--install`, reclone source, globally upgrade all packages, alter Playwright's pinned version, or change device shadow/telemetry settings. A successful dependency diagnosis is not a browser result; `--run` and its independently verifiable local receipt are still required. If apt proposes unrelated package removals or a significant upgrade, stop and inspect. If the browser still fails, report the **new** redacted diagnostic rather than guessing.

Official Ubuntu package references: https://packages.ubuntu.com/resolute/libnss3 ; https://packages.ubuntu.com/resolute/libasound2t64 ; https://packages.ubuntu.com/resolute/libnspr4 .

## Next milestone: real local NodeSeed / Yard / Browser Worker lease proof

The founder's **physical HP** produced a successful first-party public DSHS Chromium browser run on 2026-10-26 19:31:17Z through 19:31:21Z, with HTTP 200, exact SHA-256 hashes for text/screenshot/browser evidence, private-target rejection `true`, and local unsigned receipt `sha256:6e0acd8b3b00fb19ad469bfe9e3288c77113b25fabd11c0de33a8b073d014a39`. This local browser success is **not** NodeSeed/Yard execution or cross-node dispatch.

To test the **existing** Compute and Yard layers (rather than another homemade runner), a separate, manually fired script `scripts/nextgen-browser-yard-proof.mjs` runs an isolated ephemeral `startNodeSeed`, `YardOperator.deployRelease`, `yard.verifyRoute`, `yard.attestDeployment` and `yard.invokeBrowser` for **one** read-only public DSHS browser job. It confirms a bounded lease, browser evidence hashes and a blocked private destination; then stops the Yard deployment and closes NodeSeed.

It uses a new **ephemeral, untrusted software key**, a separate local proof NodeSeed ID, `127.0.0.1` only, no network capacity beacon, no Remote Operator, and does not touch the resident shadow agent. It deletes temporary session private keys and lease secrets after the run. Its final summary is local and explicitly **not a production signed receipt or registered hardware device identity**.

Run on the HP, in the **same existing checkout**:

```bash
cd "$HOME/evercraft-qa/nextgen-browser-commission" || exit 1
git pull --ff-only
node --test tests/nextgen-browser-yard-proof.test.mjs
node scripts/nextgen-browser-yard-proof.mjs --status
node scripts/nextgen-browser-yard-proof.mjs --run
node scripts/nextgen-browser-yard-proof.mjs --status
```

Expected pass state: `passed_local_compute_yard_browser`, `local_nodeseed_lease_verified:true`, `local_yard_health_receipt_bound:true`, `software_key_attestation_verified:true`, `lease_stopped:true`, `private_target_rejection_verified:true`. This establishes a **local** Compute lease and Yard invocation, **not** remote Systemia/Saban authorization. If any gate fails, the runner fails closed, attempts cleanup and reports a sanitized reason. No external form submission is possible.

The independent next gate after a local Yard pass is the *existing* broker and Passport-device-grant commissioning in issue #1332. No ad hoc SSH, public HP listener, remote job toggle, GitHub-provisioned control token, new machine or third-party browser is authorized by this local script.

### Local Yard routing regression, October 26

Physical HP output from 2026-10-27 02:06:20–02:06:23Z returned `state:failed_closed`, `failure_reason:yard_local_health_receipt_not_bound`, but also `lease_stopped:true` and `transient_key_state:deleted_ephemeral`. This is not a verified Compute/Yard browser result. The old validator incorrectly expected `yard.verifyRoute(...).ok:true`, which **cannot hold for a healthy but unbound private Browser Worker**. The canonical Yard API intentionally returns `{ok:false,state:'public_route_unbound',local_health_ok:true,health:{...}}` to avoid claiming an independently verified public HTTPS route.

The corrected local milestone validator now requires that exact private-unbound state, `local_health_ok:true`, exact browser engine identity, instance match and equality of the private browser health `deployment_receipt_ref` to the Yard deployment receipt. It **explicitly rejects public-route claims**, missing health evidence, and mismatched worker identifiers. Confirmed with regression tests, while local Command/Compute/Yard/browser and external dispatch remain separate gates.

The founder's saved original receipt is `sha256:73968cf32e4763af011c0707cd5c7393cf19cfb1b2d77cca795b465ee3783807` and should be preserved as a failed but correctly cleaned up predecessor, not relabeled green.

After updated branch is fetched, retry **once** from the existing HP checkout:

```bash
cd "$HOME/evercraft-qa/nextgen-browser-commission" || exit 1
git pull --ff-only
node --test tests/nextgen-browser-yard-proof.test.mjs
node scripts/nextgen-browser-yard-proof.mjs --run
node scripts/nextgen-browser-yard-proof.mjs --status
```

Do not run `--install`, `git clone`, or change the Node002 resident shadow agent. If another gate fails, preserve the distinct new failure and diagnose rather than repeatedly retrying.

## PHYSICAL LOCAL YARD / COMPUTE PASS and production dispatch inventory, Oct 26

The founder executed the full **physical** NextGen NodeSeed → Evercraft Compute lease → Yard → native Chromium browser proof on 2026-10-27 02:46:09–02:46:13Z at commit `1fec33f08d0e6cfa33dea15cd5863fd997b1603b`.

Observed: **7/7 local regression tests passed; `state:passed_local_compute_yard_browser`**, `local_nodeseed_lease_verified:true`, `local_yard_health_receipt_bound:true`, `software_key_attestation_verified:true`, `private_target_rejection_verified:true`, `lease_stopped:true`, and temporary proof key deleted. The final persisted private local receipt is `sha256:b94045c9db4dd614a0a565051b8fc95f5736edad6d55097900787007e75b886b`. This verifies physical **local** leased execution, **not** broker admission or a device-signed remote job receipt.

The user-visible next goal is to identify exact physical Node002 **production** broker enrollment blockers. The added `scripts/nextgen-dispatch-inventory.mjs` reads only the *existing* local shadow-agent status, user-mode organism service status, and a strictly allowlisted set of private receipt/config **presence flags**. It does not copy broker URLs, print tokens, run remote requests, create identity material, change permissions, configure brokers, write to disk, enable remote jobs, or submit provider applications.

On the actual HP, use the already cloned checkout:

```bash
cd "$HOME/evercraft-qa/nextgen-browser-commission" || exit 1
git pull --ff-only
node --test tests/nextgen-dispatch-inventory.test.mjs
node scripts/nextgen-dispatch-inventory.mjs --report
```

This report separates `shadow_telemetry_http_402_observed` from actual outbound broker configuration. **402 shadow ingest is not sufficient evidence that the broker itself is down**. A present broker environment flag is also **not** remote registration, operator permission or attested production execution.

After the result, compare with authenticated, independently sourced broker-control custody under #1332. Never paste private local organism `.env` files or allocator tokens into GitHub, ChatGPT or logs. Do not run the existing `enable-remote-operator-user.sh` installer or any credential mutation solely because a readiness field is missing.

## PHYSICAL production dispatch inventory: actual gating result (Oct 26, 20:32 PDT)

Owner-run NextGen `node scripts/nextgen-dispatch-inventory.mjs --report` at `2026-10-27T03:32:20.974Z` returned:
- Existing Node002 shadow agent is observable but `mode:shadow`, `remote_jobs_enabled:false`, and shadow telemetry `FAILED_CLOSED:shadow_signed_ingest_rejected_402`.
- Resident **user-mode organism service active**, resident NodeSeed receipt present and loopback-only, health watch healthy with NodeSeed health true.
- Prior physical NodeSeed/Yard/browser local lease verified passed.
- `configured_in_private_user_environment:false` and `configured_in_organism_receipt:false` for the outbound broker URL.
- `enrollment_request_file_present:true`, but it is **not an authorization**.
- `operator_opted_in_in_private_environment:false`, `operator_enabled_in_organism_receipt:false`.
- `production_broker_reachable:not_tested`, `remote_device_authorized:not_tested`, `signed_cross_node_lease_verified:false`, `signed_result_on_production_identity_verified:false`.

**Operational verdict:** Node002's existing production organism is healthy **locally**, and Node002's outbound broker *configuration is missing*. This does not prove whether a broker exists elsewhere or if it is down. We examined GitHub's source-only broker/Yard contracts and the known private Node001 Drive Bridge receipts folder without finding a current, independently verified public broker route and trust grant. Do **not** invent an origin, use the public Fabric host as an assumed broker, rerun HP local browser canaries, or activate Remote Operator by rebuilding the existing organism.

Recovery target: obtain a live **Yard broker deployment/public-route receipt** and independently verify HTTPS `/v1/remote/health` schema, instance ID, deployment receipt and secure envelope. Then independently approve the exact Node002 fingerprint + node ID; only afterward stage narrowly scoped outbound device admission and physical signed cross-node job. Shadow HTTP 402 and GitHub-hosted workflow scoped secret configuration are separate checks.

The recovery workflow's earlier weakness (treating any HTTP 200 + JSON as an operator success) is addressed by `scripts/remote-recovery-status-contract.mjs` and tests. A green status-only probe, even with the valid schema and non-root bounded execution, is **not** production device enrollment or Saban dispatch.

## Canonical progression after receipt

1. Validate device identity and local receipt privately against existing Node002 / Passport enrollment records.
2. Authorize one narrowly scoped read-only browser task through existing owned outbound-only NodeSeed broker, not raw SSH/remote shell or a new control host.
3. Require Systemia admission, explicit grant/revocation, real HP Compute lease, independently verified signed execution receipt and browser target evidence before claiming cross-machine execution.
4. Only a human-authorized ephemeral browser handoff may access authenticated government portals. Owner handles tax/banking, statutory statements and final submission.

Existing authorities: Node002 issue #1332, Browser Worker issue #531, government mission #1610, procurement preflight PR #1616. Do not merge or enable remote access based on this source-only local lane.
