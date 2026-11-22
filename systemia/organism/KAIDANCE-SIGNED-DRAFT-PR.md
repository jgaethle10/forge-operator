# KAIDANCE | Signed, review-only GitHub draft PR publisher

**Status: owner-only source adapter and deterministic tests. This is NOT enrolled in the five-minute GitHub Actions workflow. No live production GitHub App credentials, signing material, owned deployment, or published PR are claimed by these tests.**

## Why the boundary is separate

Kaidance's heartbeat can read the repo, run the registered Saban World Engine reviewer, and propose a source-bound red/green patch. It **cannot** assume that a proven local patch grants write authority to GitHub or to the production deployment.

This operator-only publisher is an explicit later stage:

```
Kaidance review -> exact recipe + staged red/green proof
  -> Systemia goal + signed permit for exact candidate digest
  -> durable attempt checkpoint before provider mutation
  -> owner-pinned GitHub App/credential
  -> create isolated deterministic branch (never main)
  -> update two allowlisted source/test paths
  -> open DRAFT PR (no merge)
  -> independently GET draft PR + exact branch file hashes
  -> Systemia uncertain-effect hold until independent observer reconciles
```

## Authority requirements

The operator needs ALL of the following, protected separately from GitHub source and public artifacts:

- A **review receipt** from the current registered Saban source review, matching the actual owner checkout's source fingerprint.
- A **candidate receipt** from the current red/green proof, binding the exact source patch digest.
- A **Systemia Ed25519 signed human-approval envelope**, binding `mission_key=evercraft-worlds-source-development`, `goal_key=kaidance-draft-pr-<24 hex from candidate digest>`, `work_key=submit-source-bound-draft-pr`, `scope=systemia.goal.authorize`, and `receipt_ref=<exact candidate digest>`. This is a specific PR-scope authorization, not a global approval for every code edit.
- The trusted Systemia approval signer's public key supplied by the authorized owner runtime, **not** by the untrusted candidate/approval payload.
- A repository-scoped GitHub installation credential in a privately owned mode-0600 file, preferably a short-lived GitHub App installation token with the minimum Contents/Pull requests access needed for branch-only draft PRs.

A token with repository Contents write access can still be powerful outside this module. GitHub branch-protection/rulesets, installation scope, independent review and deployment policy must enforce **no automated direct-main changes**. Source-level path checks alone are not a security boundary against a compromised token.

Every private file must be outside the source repository, non-symlink, owned by the invoking user and mode 0600. The private output directory must be mode 0700. Nothing should be pasted into this chat or committed to GitHub.

## Operator invocation

The CLI requires all flags. Without them, it exits with a hold and makes **zero writes**:

```bash
node systemia/organism/kaidance-signed-draft-pr-cli.mjs \
  --private-dir /PRIVATE/kaidance/branch-publisher-attempt \
  --review /PRIVATE/kaidance/worlds/latest.json \
  --candidate /PRIVATE/kaidance/code-candidate/candidate.json \
  --permit /PRIVATE/systemia/approvals/exact-candidate.json \
  --trusted-key /PRIVATE/systemia/trusted-human-gate-public.pem \
  --github-token /PRIVATE/systemia/github-pr-writer-token
```

**This command is not connected to the heartbeat scheduler**. A separate owner configuration/admission step must provision the inputs and authorize the exact candidate. Never point a token path into the GitHub checkout.

## Crash and replay

The Systemia `evercraft.goal.state.v1` is persisted before any GitHub write. Before the first provider POST, a permanent `submission-intent.json` is written. A partial branch creation, file update, PR submission or timeout leaves an unknown external effect. The caller does **not** blindly retry. A subsequent invocation with the same private state refuses another attempt until an operator independently reads GitHub state and resolves it.

Even after independent GETs of the newly opened draft PR and both branch file digests, the existing durable Systemia dispatcher marks the stateful attempt **blocked for external outcome reconciliation**. The PR URL may be observed, but source-provider self-readback is not permission to mark Systemia's goal complete, merge, or publish.

This first publisher only supports the deterministic `worlds-mossmere-agent-position-finite-v1` recipe and the two exact paths `public/worlds/world-core.mjs` and `tests/world-core.test.mjs`. It cannot run arbitrary model-authored shell commands or accept arbitrary patch/file paths. Expanding it requires a new, independently verified code-worker contract, isolated test runner and evidence.

## Proof and release

```bash
node --test tests/kaidance-signed-draft-pr.test.mjs
```

CI may test this adapter using mocked authenticated GitHub API responses and synthetic signing keys, but no writer secrets or write permissions are installed in CI. No new GitHub Actions workflow, cron or resident worker was created.

**Production bar:** independently verify a signed approved candidate, private owned-host deployment, short-lived GitHub identity and branch rules, one draft PR provider readback, two separate resident heartbeat receipts, followed by independent GitHub observations and review. Never claim autonomous production PR creation from a passing source test.
