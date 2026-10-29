# Account Sentinel | Read-only sandbox provider contract

**Status: SYNTHETIC ADAPTER CONTRACT. NO LIVE BANK IS CONNECTED.**

This module is a private Raven Nexus execution boundary for a future, separately approved bank sandbox. It is deliberately impossible to select a production environment through its configuration. The fake hostname `sandbox.examplebank.test` in demos is a test fixture, **not** a bank endpoint.

## Call chain

```
Saban/agent -> Raven gateway
  -> independently trusted Identity + signed consent + connector registry + revocation
  -> preauthorization receipt
  -> sandbox-bank-reader.mjs
       -> private sandbox connector allowlist
       -> read-only scope check
       -> privileged token vault (opaque, scoped and expiring)
       -> bounded outbound GET to fixed path /v1/accounts/<opaque-id>/{summary|balances|transactions}
       -> bounded JSON parse and field minimization
  -> recheck Identity + consent + registry + revocation before data disclosure
  -> final audit receipt
  -> only approved fields back to caller
```

The agent may supply only the gateway's narrow request format and session/grant references. **Never accept** API origins, provider URLs, HTTP headers, bank account credentials, scopes, OAuth tokens, or override flags from agent or model output. The constructor's `connector`, `allowedSandboxOrigins`, `tokenVault` and `transport` are privileged dependencies and must be built server-side.

## Vault output contract

`tokenVault.getAccessToken({connector_id,environment:'sandbox',required_scope})` must return an independently verified, short-lived envelope:

```json
{
  "schema": "evercraft.account-sentinel.sandbox-token.v1",
  "access_token": "SYNTHETIC-TEST-VALUE-NOT-A-REAL-TOKEN",
  "token_type": "Bearer",
  "connector_id": "demo-bank-oauth",
  "environment": "sandbox",
  "audience": "https://sandbox.examplebank.test",
  "scopes": ["balances:read"],
  "expires_at": "2099-01-01T00:00:00.000Z"
}
```

The date shown is merely illustrative; the adapter actually rejects expired tokens and grants with more than 24 hours of remaining validity. The vault must establish token issuer, audience, client/consent provenance, bank-provided scope, and token expiry from trusted provider material. **A self-asserted envelope does not meet this requirement in production.** Raw token strings, cross-connector tokens, write scopes and mismatched origins are rejected. Tokens never enter Saban work items, audit receipts, model prompts or response projections.

The adapter admits only `account.read`, `balance.read`, `transactions.read` with closed, fixed GET paths. IDs are limited to opaque safe characters; query parameters are generated internally. Redirects, alternate final URLs, unsupported content types, provider errors, unbounded or malformed payloads, and unexpected fields all fail closed or are stripped. A single deadline covers vault retrieval, transport and parsing. The adapter does not auto-connect to an external bank.

## Verification and scope

- `sandbox-bank-reader.test.mjs` challenges write/transfer attempts, path and origin injection, unauthorized connector mode, missing or over-scoped tokens, stale tokens, vault/provider timeouts, redirects, oversized provider bodies and leakage of extra PII fields.
- `demo.mjs` now routes **all 18 Saban simulation scenarios** through this private adapter with an injected synthetic HTTP transport. No DNS lookup or external banking API is performed.
- `gateway-race.test.mjs` verifies account data is withheld when consent changes while a read is in flight.
- GitHub Actions runs Node tests plus 72 real Saban logical assignments across four bounded CI workers and stores a redacted proof artifact.

**Limitations:** CI workers are not Node001/Node002; a synthetic vault envelope is not a real OAuth provider attestation; the gateway's after-read authorization recheck is not atomic bank-side revocation; the hash-chain demo ledger is not an immutable compliance log. The fake adapter cannot prevent any third-party agent from bypassing Evercraft and going directly to a bank. Do not deploy or market live protection based on this proof.

Before connecting a real bank sandbox, complete issue #1607: documented provider authorization, OAuth/FAPI scope audit, independent vault signer validation, customer consent, bank revocation semantics, deletion/privacy controls, security review and a first-party operational receipt. Production account protection is separately gated.
