# Yard Automatic Capacity Discovery

Yard can place supported workloads without an operator manually entering a compute endpoint.

Flow:

1. receive a credential-free `evercraft.capacity.beacon.v1` announcement,
2. verify the advertised endpoint speaks `evercraft.capacity.v1`,
3. verify the beacon node identity matches the live offer,
4. filter by workload compatibility and freshness,
5. create a capacity-resolution receipt,
6. select an eligible node deterministically,
7. resolve allocation credentials only at allocation time,
8. deploy through the ordinary Yard deployment receipt path.

Discovery carries no allocation credentials and does not itself grant allocation rights.

The initial selector is intentionally deterministic and simple. Future resolver policy may rank eligible offers using locality, capacity, latency, persistence, evidence state, energy/cost envelope, or mission requirements without changing the workload contract.
