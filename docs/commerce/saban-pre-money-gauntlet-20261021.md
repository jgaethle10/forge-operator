# Saban / Evercraft Payments pre-money integration gauntlet

## Tested October 21, 2026

GitHub Actions [Evercraft Payments routing proof #39670674012](https://github.com/jgaethle10/forge-operator/actions/runs/39670674012) executed real isolated Node OS processes using the Saban pre-money gauntlet. Its acceptance receipt reported:

- `status:pass`, `execution_fabric:isolated_local_os_processes`, `physical_nodes_proven:1`
- `independent_worker_processes_launched:32`, bounded to 4 concurrent workers
- Seven synthetic order rails exercised separately: cash, check, bank transfer, Zelle business, PayPal business, Venmo business, Cash App business
- Two independent workers raced to select a different rail for one order: **one committed, one rejected**, resulting in version 2
- Order re-read from separate OS processes; persistent versioning tested
- Customer payment claim never elevated to a paid order
- Unauthorized attempts to mark paid or release entitlements blocked
- Replay and second conflicting settlement choice blocked
- Existing `systemia/saban/quality-gate.mjs` certified all required worker roles, no missing roles, 100% completion, 0 dead letters

**This is not proof that separate physical machines, NextGen, public HTTP storefront, an authorized business bank account or actual money processing were tested.** It only proves the first-party synthetic ledger and its process boundaries on a *single* CI host. No external payment apps were contacted, no payment credentials loaded, no order was marked paid and no fulfillment was released.

## Operator command: Penguin

Stage the dependent branch as a **new separate worktree**, without touching the live Fabric router or existing Stripe bridge worktrees:

```bash
(
  set -e
  MAIN="$HOME/.local/share/evercraft/forge-operator"
  RUNTIME="$HOME/.local/share/evercraft/payments-saban-gauntlet"
  if [ -e "$RUNTIME" ]; then
    echo "STOP: separate payments Saban worktree already exists"
    exit 1
  fi
  git -C "$MAIN" fetch --no-tags origin feat/saban-payments-pre-money-gauntlet-20261021
  git -C "$MAIN" worktree add --detach "$RUNTIME" FETCH_HEAD
  node --test "$RUNTIME/systemia/saban/payments-pre-money-gauntlet.test.mjs"
  node "$RUNTIME/systemia/saban/payments-pre-money-gauntlet.mjs" --json --concurrency=4
)
```

Only temporary synthetic order directories are created; those are deleted on completion. Every worker explicitly rejects normal filesystem paths and execution without `EVERCRAFT_PAYMENTS_TEST_ONLY=1`, and the runner sets that variable only in each spawned child process. No Stripe, bank, Zelle, PayPal, Venmo, Cash App, gateway or card processor write is authorized or attempted.

## Acceptance truth table

| Boundary | Current proof |
| --- | --- |
| Independent OS processes | PASS on CI: 32 |
| Shared private test order persistence | PASS |
| Buyer selects a supported payment **type** | PASS, with simulated merchant availability and buyer confirmation |
| Concurrent writes/replay protection | PASS in bounded test |
| Customer claim does not imply paid | PASS |
| Unauthorized paid/entitlement actions rejected | PASS |
| Multiple physical NodeSeed machines | NOT TESTED |
| Published live buyer checkout or live invoice URL | NOT TESTED |
| Merchant eligibility, enrolled business destination, sanctions/provider requirements | NOT VERIFIED |
| External provider auth/API requests | NOT ATTEMPTED |
| Bank statement credit, clearance or cash counted by merchant | NOT VERIFIED |
| Actual paid receipt or fulfillment | NOT VERIFIED |

## Next field gates

1. Reproduce the same test on Penguin. Saban's NodeSeed scheduler may later run equivalent *registered safe workloads* on separately **authorized and attested** NextGen or other compute nodes. Do not assume multiple local processes prove remote node trust or permission.
2. Build authenticated first-party Evercraft order/invoice HTTP service and public buyer confirmation UI, then repeat pre-money tests with **actual local HTTP traffic** across processes. Never publish an unverified payment destination.
3. Obtain an operator-confirmed eligible business payment rail (bank transfer, cash/check invoice, or provider-supported business app). Use the owner-approved destination only through a secured internal configuration and verify applicable fees/terms.
4. Bind authoritative bank/provider statement evidence or a witnessed cash receipt to a canonical order and add an idempotent reconciliation service. Only after that verified boundary can paid/entitlement transitions exist.
5. Use a real merchant-approved payment of an amount explicitly approved by the operator to validate end-to-end settlement and refund/reversal controls. The gauntlet will never initiate it by itself.

Do not expand this test into arbitrary remote shells, financial account probes, credential extraction, bank operations or autonomous checkouts. Tests are processor-independent but not a bank.
