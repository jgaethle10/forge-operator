# EverScript v0.3 security boundary

This prototype is intentionally capability-oriented. It does not evaluate JavaScript supplied by a mission, execute shell commands, load arbitrary modules from mission text, or permit a mission to call an undeclared capability.

A production host should additionally enforce tenant authentication, action-level authorization, network egress policy, filesystem isolation, secrets isolation, request-size ceilings, CPU and memory quotas, cancellation, replay retention policy, signed-manifest key rotation, receipt signing, and independent payment reconciliation.

The bundled `MemoryMeter` is test infrastructure only. It does not move money. Any production payment adapter must preserve reserve, settle, and release semantics and must respect the application's human approval policy before creating a financial obligation.

The HTTP gateway is a library. Its `authorize` callback is the embedding service's security boundary. Do not expose a production gateway with an authorization callback that always returns true.
