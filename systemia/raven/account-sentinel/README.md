# Raven Nexus | Account Sentinel (experimental policy gate)

Status: **PROTOTYPE, NOT DEPLOYED**. No banking connection, account monitoring, banking credentials, transaction service, or customer protection is activated by this code.

## Why it exists

Reports on October 22-23, 2026 described U.S. banks blocking unvetted third-party agents accessing accounts with user-shared credentials. Some access appears to go beyond user instructions, but the reporting does **not** establish widespread theft or that banks themselves were compromised. Agents need a bounded, revocable, auditable permission layer.

## Architecture

```
Evercraft Identity authenticates person and agent
    -> privileged Raven Nexus gateway resolves trusted context
    -> live connector registry + fresh revocation lookup
    -> Account Sentinel verifies signed, account-scoped grant
    -> approved, delegated OAuth *read-only* bank API adapter
    -> purpose-limited result plus sanitized evidence receipt
```

Agent input, web content, model output, and user-submitted JSON are **never** treated as trusted identity or connector registry state. A caller cannot mark itself as trusted.

### Invariants

1. Only `account.read`, `balance.read`, and `transactions.read` with GET are candidates for permission.
2. ACH, wire, card transactions, payee creation, payment-setting changes, data export, and unknown operations are always denied by this prototype.
3. Even read access requires a verified Evercraft Identity principal, a server-side approved OAuth connector with matching read scopes, and a signed Ed25519 grant issued by an independent trusted authority.
4. Grants bind subject, agent, connector, opaque account reference, operations, and a maximum 24-hour lifetime. A revoked grant must be rejected.
5. If the revocation store, identity trust, connector approval, signer, or grant validation is unavailable, access is denied.
6. A grant signature does **not** substitute for bank-provided OAuth authorization. No bank login/password sharing, session cookie reuse, screen scraping, or automated website login.
7. Evercraft cannot block agents that access an account *outside* its gateway. Bank-provided session monitoring and account controls remain essential.

## Code

- `policy.mjs` is a pure, fail-closed decision function.
- `policy.test.mjs` runs 24 signed-grant and negative-path checks using artificial test keys, IDs, and accounts.

Run on Node.js 22+:

```bash
node --test systemia/raven/account-sentinel/policy.test.mjs
```

This code does not connect to a financial institution or run live fraud detection.

## Mandatory integration gates before any pilot

- Authenticate the agent cryptographically at the gateway. Never accept `trustedPrincipal` from an external request.
- Source `trustedConnector` from an authenticated, operator-reviewed connector registry with independently validated bank authorization and scoped OAuth/FAPI access. All banking tokens remain server-side, encrypted, and unavailable to the model.
- Create signed grants only after authenticated customer opt-in. Store signing keys in an appropriate managed key service or protected hardware. Do not put private keys in GitHub.
- Back `trustedRevocations` with a durable, immediately effective revocation service. Confirm actual upstream bank/token revocation and clearly distinguish local disablement from bank-side disconnect.
- Wire this decision at the *only* bank-data egress path and enforce every denied decision before any provider API call. Add tamper-resistant, privacy-minimized event receipts and abuse detection.
- Build the customer consent UI, granular permission view, emergency disconnect, and alert delivery. Verify safe behavior under connector outages and misconfigurations.
- Perform security architecture review, penetration testing, authorization and prompt-injection testing, privacy/legal review and provider contract review. Validate accessibility and data deletion/retention.
- Demonstrate real approved read-only bank-provider integration in a sandbox first. Human-visible 'protected' status must require independent runtime and provider evidence.
- Obtain explicit separate bank-side customer approval for any future payment operation, if such an integration is ever permitted. This policy module will not execute it.

## Response playbook for an individual

If you shared online-banking credentials with any AI agent, stop that practice. Use your bank's actual site or app to revoke linked apps and sessions; change the password; enable strong MFA/passkeys where offered; turn on transaction notifications; and review account history. Ask the bank to investigate suspicious activity immediately. Changing a password is not the same as revoking authorized OAuth access.

## Product fit

Account Sentinel belongs within **Raven Nexus** for security and permission governance; **Systemia** remains mission authority. **Evercraft Payments** is separate and does not grant permission to access customers' deposit accounts. This capability must not be advertised as an active bank-account firewall until bank integrations and runtime verification pass.

## Runnable local demonstration (v0.2)

A separate loopback-only HTTP console lets reviewers test real decision logic against **synthetic** checking data. No external network connection, bank account, credential, signing key persistence, account monitoring, or commercial checkout is involved.

From the repository root with Node.js 22+:

```bash
node --test systemia/raven/account-sentinel/policy.test.mjs systemia/raven/account-sentinel/demo.test.mjs
node systemia/raven/account-sentinel/server.mjs
```

Then open **http://127.0.0.1:8776** in a browser on the *same computer* (not a public website or phone link).

The dashboard offers 12 scenarios: authorized balance read; transfer attempt; rogue agent; revoked consent; expired consent; tampered grant; different account; missing scope; disabled connector; failed revocation lookup; audit outage; and simulated provider outage. A permitted balance read returns an explicitly simulated $2,847.22 and 1 simulated adapter call. Every blocked scenario reaches the provider **zero times**. Provider outage invokes a simulated provider call but returns no balance. The console displays privacy-minimized, volatile SHA-256 chained evidence entries.

Other API endpoints are `GET /health`, `GET /api/scenarios` and `POST /api/run` with a single allowlisted `{"scenario":"transfer"}` value. This server binds strictly to loopback. **Do not expose or reverse-proxy it to the internet:** its sessions and signing keys are intentionally synthetic and the demo lacks production authentication.

Implementation files:

- `gateway.mjs`: all provider lookups originate from trusted dependencies. The client cannot supply identity, consent, or registry authority objects.
- `ledger.mjs`: deliberately ephemeral hash-chained simulation receipts, *not* an immutable compliance ledger.
- `demo.mjs`: fresh ephemeral Ed25519 keys and simulated decision scenarios on every run.
- `server.mjs` and `dashboard.html`: local visual demonstration, no actual bank adapter.
- `demo.test.mjs`: 15 scenario/integration checks including proof blocked actions never call the adapter.

The original 24 policy cases and 15 integration checks were exercised locally on Node.js 22. CI must still validate the GitHub branch. This test evidence does not establish production readiness.

### Gap to close before real-bank API access

Production service needs real cryptographic session authentication, authoritative owner consent and revocation (including upstream bank/token revocation), race-safe enforcement at provider egress, encrypted provider credentials, durable anchored audit storage, customer-facing data handling, and provider/legal/security approval. A demo `fresh: true` or `auth_source: evercraft_identity` fixture is not actual verification. Do not expose bank data to third-party models or agents without separate narrow, explicit user consent and approved bank API terms.

## Automated Saban ownership (v0.3)

The human operator does **not** need to run `server.mjs`, `node --test`, or any other terminal command to validate this prototype. They remain optional for local visual review.

The separate `saban-registry.json` registers **account-sentinel** as a bounded, read-only Saban workload. The 12 allowlisted synthetic adversarial scenarios in `saban-scenarios.json` are crossed with four independent Saban assurance roles: identity, consent, provider boundary, and audit. This produces **48 logical agent assignments on four local physical worker slots** in GitHub's CI runner. These slots are not 48 operating-system processes or 48 remote Evercraft machines.

`saban-adapter.mjs` invokes the real simulated Account Sentinel gateway for each assignment. A wrong allow/deny decision, unexpected provider adapter call, compromised hash chain, missing synthetic-only boundary, or absent receipt throws a hard error. `reconcile()` independently requires the complete 4 × 12 matrix with no missing/duplicate assignments and zero real bank activity.

`verify-saban-receipt.mjs` independently checks the Saban execution receipt: quality PASS, every role present, no dead-letter, complete reconciliation, and zero real-world financial actions. CI preserves `account-sentinel-saban-receipt` as a 14-day GitHub Actions artifact. The `http-smoke.test.mjs` test boots the loopback-only dashboard automatically and exercises every scenario over HTTP, including host-boundary and request-injection failures.

The Saban kernel is run **automatically in GitHub Actions** whenever the Account Sentinel files change. CI does not claim it has reached the owned Node001/Node002 Saban residents or live bank systems. Moving executions onto physical Evercraft NodeSeed requires actual node enrollment, signed capacity attestation, lease authority, and a new verified runtime receipt.

Command for maintainers, *not an operator prerequisite*:

```bash
node systemia/saban/multiplier.mjs --software account-sentinel \
  --registry systemia/raven/account-sentinel/saban-registry.json \
  --fixed --agents 48 --workers 4 --execute --reconcile \
  --state artifacts/saban-multiplier/account-sentinel-state.json
node systemia/raven/account-sentinel/verify-saban-receipt.mjs
```

If a run fails, keep the PR in draft, inspect the CI logs/receipt, and never quietly reclassify a failed security check as green. No financial or production privileges should be inferred from a successful synthetic Saban run.
