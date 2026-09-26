# Remote device trust loop acceptance

This proof locks the complete outbound-device trust workflow into one release gate.

The accepted sequence is:

1. An unknown outbound NodeSeed proves possession of its device identity.
2. The broker records a zero-authority pending request.
3. The Systemia trust watch turns that pending state into a KAIDANCE `remote_device_trust` hold.
4. Yard lists the candidate through an opaque candidate reference without exposing the raw fingerprint.
5. A human or authorized operator explicitly confirms that exact candidate and supplies an approval reference.
6. Yard authorizes the exact hidden fingerprint/node pair.
7. The already-running admission keeper connects.
8. The pending inbox clears.
9. On the next KAIDANCE cycle, the trust hold clears.

Discovery, attestation, pending status, and a KAIDANCE hold never grant authority by themselves.

The proof uses only temporary local NodeSeeds and does not authorize any real device.
