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
