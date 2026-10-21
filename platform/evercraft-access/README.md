# Evercraft Access Gateway

Provider-neutral authentication and authorization core for Evercraft APIs, MCP surfaces, Yard runtimes, partners and machine clients.

This subtree is intentionally isolated from the Forge Operator application runtime.

## Contract

Developer/application access follows:

project -> credential issuance -> secret shown once -> verifier-only metadata -> scope/environment check -> entitlement check -> quota/metering -> capability execution -> audit receipt

Internal Evercraft services use separate short-lived service identities. They do not reuse customer API keys.

## Security boundaries

- Raw API secrets are returned only at issuance.
- Control-plane records must not persist plaintext credentials.
- Credential verification uses a protected external pepper boundary and timing-safe comparison.
- Credentials are bound to project, tenant, environment and scopes.
- Revoked and expired credentials fail closed.
- Checkout state alone is never entitlement authority.
- Public capability discovery must never imply invocation authority.
- Production secret custody belongs in an approved secret store/KMS boundary, not ordinary database entities.

## Local verification

```bash
cd platform/evercraft-access
npm test
```

The current dependency-free proof covers issuance, parser validation, verifier-only records, scope enforcement, environment isolation, entitlement checks, revocation, expiry and secret-free lifecycle receipts.
