# Evercraft RustGIS Bounded Worker v1.2 Review Candidate

**Status: LOCAL SYNTHETIC CANARY / NOT PRODUCTION CONNECTED**
**Systemia mission:** `evercraft-rustgis-geospatial-engine-evaluation-20261013`

This is an independent, stdlib-only Node.js adapter for **already approved** Saban-to-RustGIS jobs. It does not implement any remote polling, network endpoint, deployment, customer-facing route or Systemia admission override. It is designed for an Evercraft-owned, isolated executor after compute enrollment.

## Security contract

- `remote_jobs_enabled=false` is mandatory; only an explicitly invoked local `execute` action is implemented.
- A detached **Ed25519 signature** validates the canonical, sorted-key JSON job. The public key is loaded from trusted worker configuration; **do not ship issuer private keys** with worker bundles.
- Every job is tied to an exact Systemia mission and exact node ID; max 15-minute signature window; single-use nonce protected by exclusive lock file.
- Allowed operations: `render` at 640x420 and `buffer_100m`. No arbitrary commands, shell, `rustgis-cli mcp --yes`, remote models, plugins, service operations, or URL fetches.
- Pinned SHA-256 on both input GeoJSON and full RustGIS CLI executable. Only `canary_(narrow|baseline|wide).geojson` with `synthetic=true` for every feature is accepted in v1.
- Flat path namespace, realpath/lstat confinement, 10 MiB source limit, strict geometry bounds, process timeout and bounded output capture.
- A JSON receipt carries input/binary hashes, precise artifacts, dimensions and worker observation timestamp. It is **not** proof of user-facing release, identity of its author, or recipient access; Systemia Exact Output Gate remains separate.

**Important limitation:** Application-level checks do NOT sandbox the RustGIS executable. Run the process in an actual least-privilege OS/container boundary with `--network none`, read-only input/binary/config mounts, only dedicated writable job output and nonce ledger directories, no host secrets or Docker socket. The supplied `run_isolated_container_TEMPLATE.sh` is illustrative, not a tested deployment. Root admin must review permissions and runtime prerequisites. Do not use the Systemia app sandbox as a privileged compute worker.

## Proof already established

The upstream [RustGIS v0.2.0 official Linux release](https://github.com/opengeos/RustGIS/releases/tag/v0.2.0) was hash-verified and exercised in a separate temporary Systemia sandbox. Real CLI imports, three renders, a 100 m buffer, saved RustGIS project, and read-only MCP handshake passed. The MCP write path correctly denied `run_tool` without `--yes`. **Those actual-engine results precede this worker.** This adapter's current test suite uses a temporary *mock CLI* to independently exercise signature, job, filesystem and output policy. The v1.1 signed-job path has been tested end-to-end against the official RustGIS v0.2.0 executable and the exact 41-feature baseline fixture in a temporary Base44 app sandbox. This was NOT a dedicated OS-restricted worker, HP/Chromebook run, Saban dispatch or production release. See `receipts/real_signed_e2e_20261014.json`.

## Run the local tests

```bash
node --test tests/test-worker.mjs # simple top-level assertion runner (prints 18 cases)
# or
node tests/test-worker.mjs
```

`tests/test-worker.mjs` creates and destroys its own temporary Ed25519 issuer identity; no private key is exported in this package. No standing administrator/production keys are required.

## Integrate without bypassing Systemia

1. Systemia registers/adjudicates a **bounded** geospatial work intent and issues mission/compute authorization.
2. The existing Evercraft control ingress, not this worker, delivers a signed, scoped job to the enrolled node. This package exposes **no transport or poll loop**.
3. The worker checks the detached signature, target node, mission key, input/binary integrity and replay ledger. `execute` must run with pre-provisioned trusted config and source file.
4. It only invokes two fixed CLI operations and writes a receipt into a private output folder. The orchestrator validates receipt/file bytes and supplies them to the exact-output release gate.
5. Broader access, actual data, feature expansions, real flood or property claims and user-facing publishing need separate reviews and permits.

## Runtime config template

`config.template.json` intentionally contains no real trust key, private key, or authorized production host path. Update local mount paths and binary SHA under a reviewed host change process, then sign an ephemeral canary job offline using a separately managed Ed25519 issuer key. `job.template.json` is a **non-executable schema example**, not an issued permit.

## Gate checklist

- [x] Worker policy and Ed25519/replay tests passed using a mock engine (20/20).
- [x] Official RustGIS engine v0.2.0 confirmed separately via genuine CLI and MCP canaries.
- [x] Signed-job real RustGIS v0.2.0 end-to-end on the original 41-feature source fixture in a temporary test app sandbox (NOT OS container isolation).
- [ ] Repeat the signed test on a genuinely isolated Evercraft-owned worker.
- [ ] OS isolation and mounts reviewed, and node computer-use grant issued through existing Evercraft authority.
- [ ] Systemia receipt ingest/round-trip verified; no duplicate execution after restart.
- [ ] Exact-output visual/source/recipient QA before claims of live integration.

To re-run with the exact pinned official v0.2.0 Linux executable, run `node tests/real-cli-e2e.mjs /absolute/path/to/rustgis-cli` after separately verifying the downloaded release archive. Do not mistake the ephemeral test issuer for a production Systemia signing authority.

## GitHub review v1.2 corrections

- The 100 m buffer verifies a **named** `synthetic_100m_buffer` result layer with the expected feature count, rather than accepting the untouched source layer as a false positive.
- A fresh nonce paired with an already-used job ID may fail, but must **not overwrite** the existing output receipt.
- Two additional mock-engine regression tests exercise these cases. This review version is not a new production or physical-node acceptance: the independent real RustGIS execution receipt reflects the earlier v1.1 worker, pending a v1.2 isolated integration rerun.
- This source intentionally contains no registered NodeSeed workload, no remote dispatch, no internet access, and no production private keys.

## Read-only Saban evidence intake (review-only)

The src/saban-evidence-bridge.mjs module verifies the exact detached Ed25519 job
signature, Saban assignment identity and idempotency key, claimed target node,
mission, synthetic-only scope, result receipt fields, output name, output bytes
and SHA-256. The output is a small
evercraft.rustgis.saban-evidence-intake.v1 evidence record with explicit
dispatch_allowed:false, machine_attestation_verified:false,
remote_execution_authorized:false and systemia_release_ready:false.

This is **not** an active Saban adapter, NodeSeed registration, Passport
grant, Meter lease, remote work poller or proof of physical device identity.
The trusted issuer key and expected node identity must be supplied from an
authorized out-of-band config, never from the returned worker receipt alone.
SHA hashes prove integrity only, not physical machine identity. Saban/Yard
must still attest the physical node and Systemia must separately verify delivery.

Run node systemia/compute/rustgis-bounded-worker/tests/saban-evidence-bridge.test.mjs
for 20 read-only reconciliation tests. The dedicated RustGIS GitHub
workflow runs this in addition to the 20 existing worker tests.
