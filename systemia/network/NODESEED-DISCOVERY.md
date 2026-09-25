# Saban + NodeSeed discovery

Saban can discover Evercraft Compute NodeSeeds from local capacity beacons.

Flow:

NodeSeed beacon -> Saban discovery -> capacity verification -> authenticated allocation -> bounded lease -> logical-agent execution -> checkpoint -> rebind -> receipt

Endpoints do not need to be hard-coded when discovery is enabled. Capacity beacons contain no allocation credentials.

NodeSeed discovery is one adapter for the Universal Capacity Resolver. Other authorized capacity sources can continue to use their own adapters.
