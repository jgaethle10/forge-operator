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
