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
