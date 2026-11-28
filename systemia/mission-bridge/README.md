# Systemia Chat Mission Bridge (owned Git-source v1)

This is the smallest runnable indirect path from an authenticated ChatGPT GitHub connector into one **bounded** Evercraft specialist. ChatGPT never needs an SSH, root shell, or persistent terminal link to Penguin for these read-only missions.

## Provenance and execution

ChatGPT / approved GitHub writer -> new immutable `requests/<mission_id>.json` on reviewed main -> GitHub Actions workflow -> Systemia allowlist admission -> deterministic specialist -> source/HTTPS observations -> downloadable evidence receipt.

The request file is an **inert instruction candidate**. GitHub identity and branch protection are the source-ingress controls; neither a field in the JSON nor a passing test grants Passport authority, remote NodeSeed control, payment, publishing or deployment. The worker's only admitted mode is `observe`. No arbitrary URL, program, command, GitHub workflow, external payload or target hostname is accepted.

## Admitted specialists

- `signal-public-ingress`: GET only the exact owned `/health`, `/offers/signal-brief` and `/api/signal/readiness` paths, from the independent GitHub runner. Reports route availability and payment hold truth without an actual customer submission.
- `forge-source-evidence`: hash a fixed allowlist of repository source files; never inspect secrets or arbitrary paths. Useful for proving software source presence, not production runtime deployment.

## How to submit from ChatGPT, without Penguin

1. Create a branch and a new request file via the **connected GitHub app**. The immutable request is constrained to the schema in `bridge.mjs`.
2. Open a pull request and require contract CI. Merge to main only when reviewed and green. The workflow on main examines request files in the merge commit, max eight per batch. `workflow_dispatch` also supports rerunning one exact request ID.
3. Read the GitHub Actions `systemia-chat-mission-observations` artifact for a source-bound receipt. A green workflow is **not** proof of live Signal intake unless that receipt records a valid external GET for the readiness route.

The initial mission `signal-public-ingress-20261116-001` addresses the November 2026 Signal case. It does not charge, expose records, create orders, restart systems, dispatch a remote command or imply that a payment has been received.

## Trust boundaries

- GitHub is an execution location for this specialist and a durable source transport, not the owner of Systemia mission authority or Evercraft's production runtime.
- Mainline branch admission is currently reviewed Git changes, not a general authenticated conversational Mission Gateway. Converting untrusted messages directly into a write/execution job must use Systemia Intake Fabric, Passport and Execution Gate.
- This v1 has **no** dynamic Saban, Penguin, NextGen or Yard remote dispatch. Those routes require separate authenticated worker adapters, live admission and receipts.
- Every read-only specialist is a deterministic adapter, not an LLM pretending to have executed a command.
- Unknown route, executable mode, extra authority fields, disallowed IDs, and unsafe source paths fail closed.
- The GH runner cannot prove ChromeOS port forwards or local network status. Its HTTPS result describes only what the runner observed.

## Commands

```sh
node --test systemia/mission-bridge/bridge.test.mjs
node systemia/mission-bridge/cli.mjs --plan signal-public-ingress-20261116-001
node systemia/mission-bridge/cli.mjs --request signal-public-ingress-20261116-001
```

The last command performs external **GETs** and writes `artifacts/systemia-mission-bridge/*.json` locally. It does not deploy or mutate any Evercraft service.

## Founder studio connectivity canary (November 28)

`founder-studio-source-evidence` checks exactly eight repository files spanning Intake Fabric, Execution Gate, Home, Wing Courier, Fallen rendering and Journal/Worlds. Its receipt reports only file existence, length and SHA-256. It cannot retrieve private assets, contact a worker, mint a Passport grant, render or publish. Source presence must not be presented as an operational studio connection.

The existing private ChatGPT mission gateway issue #2260 remains the authority/integration tracker. Extend that gateway with a bounded founder-studio workload after authenticated admission is proven; reuse the existing private asset-demand and render-worker contracts. Do not add a second public connector, scheduler, generic shell, or unauthenticated asset endpoint.

First live acceptance case: Local Resilience Network / "Where Your Money Goes": request an owner-only draft illustrating two illustrative spending paths, inventory rights-cleared Evercraft assets by opaque IDs and hashes, plan and render a short preview on existing owned capacity with an exact started execution lease, and return the asset manifest, render receipt and privately retrievable artifact. No customer asset reuse without verified rights; no publication, payments, or fabricated regional economic multipliers. If the private ingress, identity, capacity or artifact return is unavailable, hold and report the missing binding. The Git source observer is not this acceptance case.
