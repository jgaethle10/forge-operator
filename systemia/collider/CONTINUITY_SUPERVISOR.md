# KAIDANCE Continuity Supervisor

The continuity supervisor closes the loop between resident health, checkpoints, leases and capacity rebind.

On a healthy tick it captures a fresh KAIDANCE checkpoint and renews the active compute lease. If the route is unhealthy, it uses the last verified checkpoint, discovers alternate compatible Evercraft Compute capacity, excludes the failed node, restores KAIDANCE, verifies health and immediately captures a new checkpoint.

If checkpointing, renewal, discovery, rebind or post-rebind health verification fails, the supervisor emits a hold receipt. It does not reset KAIDANCE or declare continuity without evidence.

Default supervisor cadence is 30 seconds. KAIDANCE's Collider heartbeat remains 300 seconds; the supervisor is a runtime continuity mechanism, not a replacement for the Collider cycle.
