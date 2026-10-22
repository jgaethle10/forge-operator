# Node002 NextGen: local-only graphics production canary

This is a **separate, opt-in local lane** for the existing HP Laptop 17 / NextGen running Ubuntu on WSL2. It is **not** the Saban / Yard authenticated NodeSeed workload-dispatch pipeline. It does not enable remote jobs, satisfy device attestation, cure the HTTP 402 shadow-ingest failure, create a public server, publish anything, contact buyers, push code, or transfer credentials. It does not configure Node003, the unequipped HP tower.

## Fixed capabilities

1. SHA-256 fingerprint the checked-out Visual Desk / graphics / Radar / worldstate / local runtime sources (no automatic `git pull`).
2. On the first run or changed source digest, run the seven existing Visual Desk and Graphics Command suites by `node --test`. A failed suite stops the build.
3. For a passing test suite, build only the checked-in Washington volcano specimen to `~/.local/state/evercraft-nextgen-graphics/run-*/site/` using an intentionally non-public `https://preview.invalid/visuals` origin.
4. Require the feed, square, story, motion, page and Clip handoff files, passing poster and scroll-stop reports, at least two shot candidates and `publicationAuthority:false` in the generated quality and Clip reports.
5. Leave `tests.log`, `build.log`, `receipt.json`, and `last-attempt.json` under the local state directory. The receipt is explicitly marked **unsigned_local**, not a signed Systemia execution record. Failed and unchanged builds are **not** evidence of completed production.

Only explicit, source-controlled commands run, via the local Node.js binary, with **no `sh -c` and no user-supplied command**. The source tree is not modified. No external submission or deployment occurs. If the same source digest was previously attempted, the timer does not rerun it unless the operator explicitly passes `--force`. Inspect the failed receipt first.

## First run from a separate full checkout

```bash
cd "$HOME/evercraft-qa/forge-operator" || exit 1
node --test tests/nextgen-local-graphics.test.mjs
node scripts/nextgen-local-graphics.mjs --force
node scripts/nextgen-local-graphics.mjs --status
```

**After examining the generated receipts and preview** and approving ongoing local resource use, optionally install the local user timer:

```bash
bash scripts/install-nextgen-local-graphics-timer.sh
```

The timer checks every ~30 minutes while WSL2 and the user systemd manager run. Its oneshot service limits itself to about 1.5 CPU cores and 2 GiB RAM; other services are untouched. No guarantee of background operation while Windows is suspended or WSL is stopped.

To stop new scheduled runs (does not affect Node002 agent, Fabric, or Edge services):

```bash
systemctl --user disable --now evercraft-nextgen-local-graphics.timer
```

Inspect receipts with:

```bash
node scripts/nextgen-local-graphics.mjs --status
journalctl --user -u evercraft-nextgen-local-graphics.service -n 50 --no-pager
```

**Next governance boundary:** Chromebook-to-HP coordination still requires the existing approved Systemia/Yard device identity, admission, signed receipts and narrowly scoped permission. Do not pretend this opt-in local timer is a networked multi-device agent or open an unauthenticated HTTP listener to make it one.
