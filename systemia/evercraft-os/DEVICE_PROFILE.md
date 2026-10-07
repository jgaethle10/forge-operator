# Evercraft OS device profile

The device profile is the bridge between physical hardware and the Evercraft operating contract.

It answers a narrow question:

> What do we actually know about this machine, and what roles may higher layers consider without confusing a planning hint with permission or runtime authority?

## Deliberate separation

A device profile is not:

- a NodeSeed identity;
- a Passport grant;
- a Yard lease;
- a Saban capacity offer;
- a Systemia mission admission;
- proof that a camera, microphone, GPS receiver, secure element, GPU, or modem exists.

NodeSeed remains authoritative for device identity. Yard and the compute fabric remain authoritative for usable capacity. Passport remains authoritative for human and agent permissions.

## Privacy boundary

The default local fact collector exposes only:

- platform;
- architecture;
- CPU count;
- total memory;
- whether a hostname exists.

It deliberately does not export the hostname itself, usernames, home-directory paths, IP addresses, MAC addresses, serial numbers, nearby networks, or hardware identifiers.

## Form-factor classes

Phase 1 recognizes:

- laptop
- desktop
- phone
- tablet
- server
- unknown

The class is operator-declared until a future trusted hardware attestation source can establish it. Class metadata produces planning hints only. It does not fabricate hardware capabilities.

## Why this matters

Once each machine can expose the same bounded profile, Systemia and Saban can reason about a household or company fleet as one pool without flattening important differences.

A phone can be considered for an interactive mobile surface while still withholding camera, microphone, location, telephony, and secure-element claims until those are separately established.

A desktop or server can be considered for sustained compute while still requiring the real NodeSeed/Yard/Saban capacity path before work is placed.

This is the beginning of making the user's authorized collection of devices behave like one computer.
