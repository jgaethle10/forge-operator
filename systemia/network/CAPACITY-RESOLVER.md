# Universal Capacity Resolver

The resolver sits between Saban and heterogeneous compute.

Inputs:
- workload class and resource envelope
- latency and locality targets
- cost ceiling
- persistence/checkpoint needs
- network/radio needs
- evidence and trust requirements

Adapters can emit normalized offers from:
- cloud and serverless providers
- carrier/MEC edge
- existing VMs and container schedulers
- browser/WASM workers
- partner infrastructure
- decentralized compute markets
- local runtimes
- future capacity brokers

Resolver output is a ranked set of live capacity offers plus receipts describing why each offer was selected or rejected.

This replaces the idea of an Evercraft device registry. The registry may still exist for known assets, but it is only one discovery source among many.


## Ambient capability fabric

The resolver is not limited to computers that look like servers.

Saban may also reason over capabilities already exposed by the physical world, provided the access mode is legitimate and machine-verifiable.

Examples include:

- public radio/broadcast observations such as ADS-B and Remote ID;
- BLE advertisements and other intentionally broadcast discovery metadata;
- public APIs and open read-only protocols;
- voluntary browser/WASM workers;
- opt-in local devices;
- commercial or decentralized capacity offers;
- Evercraft-owned or explicitly authorized hardware;
- future public edge, vehicle, appliance, gateway, sensor and embedded-device capability offers.

A visible device is not automatically controllable. The resolver separates **observation** from **execution/actuation**.

Access classes:

- `public_observation`: read-only observation of intentionally public signals;
- `open_protocol`: only operations the public protocol explicitly exposes;
- `voluntary_compute`: compute offered intentionally with an endpoint and terms;
- `commercial_capacity`: capacity offered for use under published terms;
- `authorized_compute`: Evercraft-owned or explicitly authorized compute.

This lets Saban use the planet as a capability graph without treating network visibility as permission to control private hardware.

The implementation entry point is `systemia/saban/ambient-capability-resolver.mjs`.
