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

## Canonical progression after receipt

1. Validate device identity and local receipt privately against existing Node002 / Passport enrollment records.
2. Authorize one narrowly scoped read-only browser task through existing owned outbound-only NodeSeed broker, not raw SSH/remote shell or a new control host.
3. Require Systemia admission, explicit grant/revocation, real HP Compute lease, independently verified signed execution receipt and browser target evidence before claiming cross-machine execution.
4. Only a human-authorized ephemeral browser handoff may access authenticated government portals. Owner handles tax/banking, statutory statements and final submission.

Existing authorities: Node002 issue #1332, Browser Worker issue #531, government mission #1610, procurement preflight PR #1616. Do not merge or enable remote access based on this source-only local lane.
