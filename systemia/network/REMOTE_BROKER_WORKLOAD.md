# Remote capacity broker workload

The Systemia remote-capacity broker is a first-class resident Evercraft Compute workload:

```
Yard
  -> Evercraft Compute lease
  -> systemia.remote-capacity-broker.v1
  -> local broker health
  -> Yard deployment receipt binding
  -> independently routed public HTTPS origin
  -> Yard public-route verification
```

The broker is intentionally started on loopback inside Compute. Public exposure is a separate route-binding concern. Yard does not call a loopback proof "public."

## Public route gate

Before a route is accepted, Yard verifies `/v1/remote/health` and requires:

- service = `remote-capacity-broker`,
- runtime = `Evercraft Compute`,
- instance ID matches the deployed resident service,
- deployment receipt is bound and matches the Yard deployment receipt,
- secure envelope schema = `evercraft.secure-envelope.v1`,
- the route is HTTPS for a real public verification.

Loopback routes can be used only with the explicit proof flag and remain `verified: false`.

## Remote control grant boundary

Remote node control grants are not published by the broker HTTP API.

Yard obtains a node grant through the broker resident service's private Evercraft Compute management endpoint. That request requires the broker workload's lease token. Yard then projects the remote node's virtual capacity endpoint onto the independently verified broker origin.

For production use, `remoteCapacityGrant()` requires a verified public HTTPS broker route. The loopback exception exists only for isolated proofs.

## Device authorization

The workload requires an explicit map of NodeSeed device fingerprints to expected node IDs. Unknown self-signed devices cannot enroll themselves.

Dynamic pairing can be added as a separate bounded authorization workflow without changing the runtime contract.


## Dynamic device enrollment

The broker may start with zero authorized remote devices. That does not make registration open.

A remote NodeSeed is allowed to complete the broker challenge only after Systemia/Yard authorizes the exact pair:

- device-key fingerprint,
- NodeSeed node ID.

Authorization and revocation are broker-management actions behind the broker's active Evercraft Compute lease. Both require an explicit approval reference and both produce persisted receipts.

A local organism's `remote-admission-request.json` is therefore an enrollment request only. Discovery, possession of the request file, or successful reachability to the broker never grants trust.

Yard exposes bounded management actions for this lifecycle:

- authorize an exact device fingerprint/node pair,
- revoke that exact pair.

Revocation immediately invalidates the live broker session for the matching device, removes its persisted control grant, and survives broker restart. The local NodeSeed's allocator secret remains on the node and is never part of the enrollment record.
