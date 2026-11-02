# NextGen Node002: canonical broker discovery gate

## Current evidence (2026-11-02, operator-reported)

- The existing HP NextGen WSL2 organism is active, with a live loopback-only NodeSeed and healthy timer.
- Node ID: `evercraft-node002-nextgen`; 29 registered workloads reported by the persistent NodeSeed.
- Local `systemia.content-hash.v1` job completed through the actual persistent allocator lease, verified digest and idempotent replay. Its locally written receipt marks `systemia_remote_authorized: false`.
- Enrollment request and matching local NodeSeed identity exist. **Remote broker is not configured**.
- The local NextGen Yard directory contains no broker deployment record; this proves nothing about an independently hosted canonical Yard.
- The legacy Node002 shadow telemetry destination was removed. Keep the shadow observer isolated from execution.
- No verified public broker origin, Yard exact-device authorization, or live remote mission receipt is established.

## Use on the actual owner-controlled Systemia Yard host

The broker discovery helper has no side effects. It reads only JSON records from the *specified* Yard directory, excludes dotfiles and symlinks, redacts secret-bearing fields, and does not contact the network by default.

```bash
node scripts/nextgen/broker-deployment-doctor.mjs \
  --yard-state "$CANONICAL_YARD_STATE" \
  --require-local-broker-record
```

A `no_broker_record_found` result describes only the chosen Yard state. Do **not** install a broker on NextGen or substitute the public Fabric health endpoint.

Only after independently verifying the exact broker origin and authenticating the Yard state:

```bash
node scripts/nextgen/broker-deployment-doctor.mjs \
  --yard-state "$CANONICAL_YARD_STATE" \
  --verify-public-health \
  --allow-origin "https://OWNER_APPROVED_BROKER_ORIGIN" \
  --require-public-health-consistency
```

This compares the independently allowlisted HTTPS health response to the Yard's locally recorded deployment/instance/receipt references, with redirects prohibited. A matching public health response **does not** authenticate the Yard record by itself and does **not** authorize Node002.

## Admission and execution gates (separate owner authorization)

1. Independently authenticate the canonical Yard record and exact broker route; obtain active deployment receipt.
2. In a private authenticated management context, match the **exact** Node002 fingerprint/node ID from the owner-controlled enrollment request. Do not publish the raw fingerprint, keys, allocator token, or control grant in GitHub.
3. Explicitly authorize the device with the existing Yard trust mechanism and genuine scoped owner permit. A fabricated approval string is not trust.
4. Configure NextGen's existing outbound-only remote-admission keeper with the verified broker origin. Keep the NodeSeed loopback-bound and public HP ingress closed.
5. Require fresh attested broker session, read-only remote status, then a separately approved bounded registered job with independent Systemia receipt.
6. Test exact-device revocation and failure/replay behavior before any broader execution scope.

Do not enable remote jobs simply because a local test passed. No Base44, public HP listener, new host, broad remote shell, or external paid compute is permitted by this gate.

## Tests

```bash
node --test systemia/network/remote-broker-public-preflight.test.mjs
node --test scripts/nextgen/broker-deployment-doctor.test.mjs
```

These tests use synthetic Yard files and mocked HTTP health responses; success is source-level only, not production admission.
