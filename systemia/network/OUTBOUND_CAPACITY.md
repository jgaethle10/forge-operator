# Outbound-only Evercraft capacity transport

This transport lets a private NodeSeed participate in the Evercraft capacity fabric without opening a public listener.

## Shape

```
private NodeSeed / Evercraft Compute
  <- loopback only
outbound node agent
  -> HTTPS
Systemia remote-capacity broker
  -> virtual evercraft.capacity.v1 endpoint
Yard Operator
```

The node initiates every network connection.

## Identity and authorization

The agent does not create a second identity. It asks the local NodeSeed for a normal signed `evercraft.compute.node-attestation.v1` response and presents that to the broker.

The broker accepts only pre-authorized device fingerprints bound to an expected node ID. A self-signed unknown device cannot enroll itself.

Two secrets remain separate:

- the **local allocator token** stays on the private node and is injected only when the agent calls loopback Compute routes that require allocator authority;
- the **remote control grant** stays on the Systemia/broker side and is what Yard uses against the virtual capacity endpoint.

The broker never needs the local allocator token and the agent is never shown the remote control grant.

## Forwarded surface

The agent forwards only the current bounded Evercraft Compute API needed by Yard:

- health and capacity,
- attestation,
- lease create/renew/release,
- jobs,
- resident service health,
- mission ingress,
- cycle/checkpoint/deployment-receipt/stop management.

Arbitrary URLs and arbitrary host access are rejected.

## Failure behavior

If the outbound agent stops polling, the broker marks the virtual node unavailable after the freshness window. It does not keep advertising stale capacity.

Remote control grants are persisted privately by the broker so a broker process restart does not silently rotate Yard authority. Node sessions are not persisted and must re-attest after reconnect.

## Transport deployment boundary

Production remote broker exposure requires HTTPS. Plain HTTP is accepted only for loopback proofs.

This transport does not turn a Chromebook/Crostini VM into a physically field-certified Node 001. Identity, compute authorization and physical field certification remain separate claims.


## Replay-safe session envelopes

Remote commands and results are now carried inside `evercraft.secure-envelope.v1` AES-256-GCM envelopes using a session-scoped transport key issued only after NodeSeed identity attestation succeeds.

The broker binds each command envelope to:

- a stable command/message ID,
- the authenticated broker source,
- the exact node destination,
- a short expiry,
- the remote-capacity command kind,
- an irreversible-action flag.

The node authenticates the envelope before executing it and keeps a session replay guard plus an in-memory result cache. A duplicate command with the same authenticated message ID is not executed again. When the cached result exists, the node can resend the result instead.

Results use their own authenticated envelope back to the broker. The broker verifies the node source and destination, tracks result message IDs, and safely acknowledges an already-accepted duplicate result. This makes a lost acknowledgement retryable without causing the underlying command to run twice.

If execution may have happened but no authenticated result can be recovered, the broker times out and Yard receives failure. Side-effecting work is not automatically replayed after an uncertain partition. This matches the Evercraft partition-reconciliation rule: uncertain consequential execution becomes a hold, not a second attempt.
