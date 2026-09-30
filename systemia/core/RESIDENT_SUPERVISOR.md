# Systemia Core resident supervisor

The Core resident supervisor is the lifecycle boundary for Systemia workflows that must keep moving without chat orchestration.

It supports two service modes:

- `cycle`: run a bounded workflow once per declared cadence and never overlap the previous cycle.
- `resident`: keep a long-lived process alive, restart it with bounded exponential backoff, and stop restarting when its hourly restart budget is exhausted.

The initial supervised organism is:

- Legacy Rescue opportunity watch, every 300 seconds.
- Evernode One / Node 001 field-certification tracker, every 300 seconds.
- Remote device trust watch, every 300 seconds, surfacing attested pending devices as explicit KAIDANCE holds without granting authority.
- KAIDANCE mission publisher, resident, publishing changed mission snapshots on its own 300-second cadence.
- Public Edge controller, resident, maintaining the admitted Evercraft Compute public edge after activation.
- RIVET report edge, resident, reusing admitted Evercraft public-edge capacity to keep the owned report runtime deployed, route-verified and lease-renewed. When no explicit owned AliEV source URL is configured, Evercraft Compute starts the owned AliEV source runtime beside RIVET instead of falling back to Base44.

Private runtime bindings do not live in the public config. The mission publisher receives its Yard state directory and KAIDANCE deployment ID from environment bindings at runtime.

Every start, completion, exit, hold, restart and supervisor lifecycle event produces a hashed receipt. Child stdout/stderr are not persisted; only their hashes and exit codes enter the supervisor ledger.


## Optional residents

A resident may declare `optional_when_unconfigured: true`. If one of its required environment bindings is absent, Systemia records `optional_environment_not_configured` and reports the service as `disabled`. A disabled optional resident does not increment `held_count` or `failed_count`, so an intentionally unconfigured capability cannot make Systemia Core unhealthy.

The public-edge controller uses this state because public ingress must not appear by inference. Enabling it requires explicit field configuration and valid TLS material. Its allocator authority is referenced through a private file path, not embedded in `resident-services.json` or controller state. The controller can resume existing Yard deployments after its process restarts, renew their leases, rebind the route when necessary, and preserve the rule that external discovery promotion waits for a verified public HTTPS canary.

## Revenue-critical report residents

RIVET report execution belongs on Yard / Evercraft Compute. The resident RIVET edge may reuse already-admitted public-edge compute authority, but it may not provision arbitrary external capacity or silently route source intelligence back through Base44. An owned AliEV source runtime, immutable release reference, verified deployment receipt and public HTTPS route are required before the report path is considered live. The source may be an explicitly configured non-Base44 endpoint or the embedded Evercraft-owned source runtime.

The Base44 report function remains continuity-only until a fresh live report reaches `generation_state=ready` through the owned route and the migration observation window passes.
