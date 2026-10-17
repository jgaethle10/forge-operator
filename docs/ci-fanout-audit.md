# CI fan-out evidence audit

Evercraft's `forge-operator` repository has many GitHub Actions workflows. This read-only tool answers a narrow question: **How many workflow runs and distinct workflows were recorded by GitHub for one exact pull-request head SHA?** It never changes CI triggers, cancels jobs, touches source devices, or grants production authority.

## Run

```sh
# Read-only GitHub REST GET requests; optional GITHUB_TOKEN is read from environment.
node scripts/ci-fanout-audit.mjs --repo jgaethle10/forge-operator --pr 1251 --budget 12 > /tmp/ci-fanout-evidence.json
# Or analyze a sanitized provider snapshot offline:
node scripts/ci-fanout-audit.mjs --snapshot /path/to/snapshot.json --budget 12
node --test tests/ci-fanout-audit.test.mjs
```

The advisory threshold `--budget 12` is adjustable. It is not a GitHub usage limit, billing authorization, or a new release gate. Output includes the exact commit SHA, changed-file count, workflow runs, unique workflow count, successes, failures, cancellations and held-name *review flags*. A held-name flag proves **only that a GitHub workflow was observed**, not that a held product ran against customers.

The tool refuses concurrent PR-head changes, validates IDs, handles reruns separately, uses only GitHub GET calls, and does not print access tokens. It cannot establish trigger causation, especially when shared files such as `package.json` change. Actual billed runner minutes require separate authoritative billing data.

## Baseline evidence

On October 14, 2026, [Shipping PR #1251](https://github.com/jgaethle10/forge-operator/pull/1251) generated **23** workflow runs for commit `b56019ce5c76c00ce32ed7007549adf8b05b066d`. The [Shipping Control Tower](https://github.com/jgaethle10/forge-operator/actions/runs/38654251369) passed, while unrelated workflow names also appeared. This is not proof of billed minutes or EV production operations.

Systemia owns admission and safety. The existing [fan-out issue #1263](https://github.com/jgaethle10/forge-operator/issues/1263) owns trigger reduction. This utility measures the current baseline and prevents CI success from being mislabeled as production proof. A later workflow optimization must be separately reviewed, preserve critical checks, and respect the RIVET/AliEV legal hold.

## Truth boundary

- `source: github_actions_run_metadata` identifies provider CI metadata, not device execution.
- `review_required` means investigation, not proof of unauthorized behavior.
- `trigger_causation_verified: false` means the tool does not claim exact YAML trigger causation.
- `billing_minutes_verified: false` means no dollar or minute estimate is asserted.
- `host_execution_verified: false` and `production_deployment_verified: false` mean no Evercraft device or public route acceptance is proven.

After an authorized CI change, compare **before and after exact-commit run counts**, require required safety checks, preserve full main/release coverage, and avoid interpreting a skipped CI job as production authorization.
