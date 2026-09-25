# Pending remote device inbox

The pending-device inbox removes the need to manually copy a NodeSeed fingerprint from a private machine without weakening the trust boundary.

An unknown outbound-only NodeSeed may request an **enrollment challenge**. The broker returns a fresh nonce. The NodeSeed signs that nonce through its existing Ed25519 device identity. If the signature, node ID, fingerprint and freshness checks pass, the broker stores a bounded pending request.

A pending request grants **zero authority**. It creates no remote session, no control grant, no lease and no workload access.

Pending records expose only:

- node ID,
- device-key fingerprint,
- first/last seen timestamps,
- expiry,
- identity-attested state,
- request receipt hash,
- explicit `authority_granted: false`.

They contain no allocator token, private key or mission data.

The public broker does not expose an admin list of pending devices. Systemia/Yard reads the inbox only through the broker workload's existing lease-gated Evercraft Compute management surface.

Authorization remains the separate explicit Yard action already defined by the remote-device trust lifecycle. It requires an approval reference and the exact pending fingerprint/node pair. Authorization clears the matching pending record. Revocation remains independently available.

The local-organism admission keeper may submit a pending request after ordinary registration is rejected as unauthorized. It then continues retrying normal admission. The device does not become connected until Systemia authorizes it.
