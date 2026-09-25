# Remote capacity device pairing

Remote-capacity pairing is a **trust-boundary action**. A private node may never authorize itself merely because it owns a valid Ed25519 key.

## Authority path

```
human authorization
  -> Systemia mission authorization reference
  -> Yard private broker-management call
  -> one-time pairing permit
  -> private NodeSeed presents permit + fresh signed attestation
  -> broker consumes permit
  -> fingerprint/node binding persists
  -> normal remote-capacity sessions
```

The permit issuer lives behind the remote broker workload's Evercraft Compute lease. It is not a public broker endpoint.

## Permit properties

A pairing permit is:

- bound to an expected node ID,
- optionally bound to an expected device fingerprint,
- valid for at most 15 minutes,
- single use,
- stored server-side only as a token hash,
- returned in plaintext only once through the private Yard call,
- issued only when Yard receives an explicit trust-boundary authorization reference.

Yard persists only permit metadata, authorization-reference hash and receipt hash. It does not persist the plaintext permit token.

## Pairing handshake

An unrecognized node uses the permit to request a pairing challenge. The broker validates the permit before issuing a fresh nonce. The NodeSeed signs the nonce through the normal `evercraft.compute.node-attestation.v1` path. The broker validates the node ID, fingerprint, signature, freshness and capacity offer before committing the new authorization.

Successful pairing consumes the permit. Reuse fails closed.

The newly paired fingerprint/node binding is stored in the broker's private state root and survives broker restart. The node can then reconnect through ordinary signed session registration without another permit.

## Identity rotation

If a newly authorized fingerprint replaces a previously paired fingerprint for the same node ID, the dynamic old binding and any incompatible persisted remote control grant are revoked. Static deployment-time bindings remain configuration authority and should be changed by redeploying the broker.

## Field certification boundary

Remote pairing authorizes compute transport. It does not certify physical hardware. Chromebook/Crostini and other virtualized nodes remain `field_attestation: not_verified` unless the separate Node 001 physical evidence contract is satisfied.
