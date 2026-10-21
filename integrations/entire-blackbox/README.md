# Evercraft Black Box | Entire CLI external-command candidate

**Engineering preview, not an installed/catalog-listed Entire plugin, production provider adapter, or paid service.** This first slice is read-only, zero-network, and zero-payment. It consumes a local JSON incident envelope to show why an agent's "success" report is not proof an external action committed. No API keys, user credentials, or third-party data needed.

## Try the first slice

```sh
cd integrations/entire-blackbox
go test ./...
go build -o entire-blackbox .
./entire-blackbox inspect examples/unknown.json
# reports UNKNOWN, externally_verified=false, no blind retry
```

Entire's external-command dispatcher executes a local executable named `entire-blackbox` when `entire blackbox ...` is requested and that executable is on PATH. This candidate is built with Go. On a machine that already has Entire installed, a developer can test the executable locally with:

```sh
entire plugin install ./entire-blackbox
entire blackbox inspect examples/unknown.json
entire plugin remove blackbox
```

**The Entire dispatcher test has NOT yet been run or claimed.** Follow the real [Entire external-command contract](https://github.com/entireio/cli/blob/main/docs/architecture/external-commands.md); do not mistake a successful local Go unit test for an installed plugin or an accepted catalog listing.

## Contract

The JSON input has `schema_version: "1"`, `operation_id`, `idempotency_key`, `intended_action`, an optional untrusted `agent_report`, and zero or more `observations` with their own `operation_id`, `idempotency_key`, `provider_state` (`committed`, `failed`, `pending`, or `not_found`) and optional provider `reference`.

The output never sets `externally_verified` to true. The possible assessments are `UNKNOWN`, `CONFLICT`, `UNVERIFIED_COMMITTED_CLAIM`, and `UNVERIFIED_FAILED_CLAIM`. Matching locally supplied JSON is not authentication. `not_found` is not proof that an action did not commit. The command does not execute external actions, fetch a provider record, generate a payment link, authorize retries, or report revenue.

## Next gates (Systemia P0 revenue-drought mission)

1. Validate this small, honest failure-state demo on a real Entire CLI installation, including a nonzero failure case. Record exact versions and receipts.
2. Build one explicit, consented provider readback adapter with authentication, permission boundaries, replay protection, idempotency binding, and production-safe error handling. Only then may a **separate** verified-state field be introduced.
3. Isolate and release an independently owned `entire-blackbox` repository, tag semver, publish checksummed binaries per platform, and verify `entire plugin install <repo-url>` before proposing inclusion in [Entire's plugin index](https://github.com/entireio/plugin-index).
4. Obtain maintainer technical fit feedback and any permissions required before publishing or implying Entire endorsement.
5. Commercialize only after an external user's end-to-end acceptance, approved scope/contract, verifiable buyer payments through Evercraft Payments, and simple auditable attribution. No attributable difference, no revenue share.

No outreach, partner endorsement, paid commitment, catalog submission or production launch is implied by this code.
