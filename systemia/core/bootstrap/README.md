# Private Systemia Core Origin Bootstrap

This directory contains the public-safe bootstrap used to create a private Git origin for Systemia Core / KAIDANCE on an Evercraft-controlled Yard host.

It does **not** contain private Core source, private mission state, credentials, customer data, or internal topology.

## Contract

The bootstrap:

- creates a bare Git repository,
- uses `main` as the default branch,
- rejects non-fast-forward updates,
- rejects branch deletion,
- enables receive/fetch/transfer object integrity checks,
- does not expose Git over HTTP,
- returns a machine-readable bootstrap receipt.

Example on an authorized private Yard host:

```bash
node private-origin.mjs --path /srv/evercraft/git/systemia-core.git
```

The target path is intentionally supplied at runtime. Do not hard-code production hostnames, IPs, usernames, tokens, or secret paths in this public repository.

## Migration sequence

1. Bootstrap the private origin on the admitted Yard host.
2. Verify the bootstrap receipt.
3. Extract only the admitted private Core source from the legacy host.
4. Commit into the private origin with an immutable source reference.
5. Run private Core CI.
6. Build an immutable runtime artifact.
7. Deploy through Yard / Evercraft Compute.
8. Verify KAIDANCE heartbeat, route health, rollback target and coverage receipts.
9. Reconcile private state.
10. Retire the corresponding Base44 slice only after the observation window passes.
