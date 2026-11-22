# Kaidance owned-resident readback (no scheduler or writes)

This inspection is for the **existing** Systemia Core supervisor on an
admitted Evercraft-owned node. It never starts/restarts a service, dispatches
an agent, creates a Stripe link, publishes content, sends email, or changes
permissions. It reads local private state and emits status flags only.

The canonical active source path is already
`kaidance-worlds-saban-review` from PR #2522. PR #2523 was closed to avoid
a second overlapping Worlds proof dispatcher.

## On the actual owned node

Verify the installed checkout is the reviewed release and the supervisor
deploy/identity evidence independently. Locate the configured absolute paths
from the **private service configuration**, never from GitHub.

```bash
node systemia/organism/kaidance-owned-readback.mjs \
  --supervisor-state /PRIVATE/evercraft/core-supervisor \
  --company-state /PRIVATE/evercraft/kaidance-company \
  --worlds-state /PRIVATE/evercraft/kaidance-worlds-saban \
  --publisher-ledger /PRIVATE/evercraft/kaidance-mission-publisher/ledger.json
```

Replace these placeholders with the existing paths. All four are mandatory.
Nothing in this command activates the runtime or reveals private contents.
The owner must first verify there is exactly one admitted resident supervisor
and no independent timer scheduling the same goal. This inspector cannot prove
physical node attestation or the absence of a second scheduler.

## Evidence requirements

- Fresh, owner-private Systemia supervisor health and matching deployment
  binding, with the two named services healthy.
- At least two separate successful `cycle.completed` receipts **for each**
  of `kaidance-company-heartbeat` and `kaidance-worlds-saban-review`.
  Receipt hashes must match, and the supervisor's last-completed timestamp
  must agree with the latest receipt (within 60 seconds). Cycles must be
  separated by at least two minutes and at most one hour, with the newest
  no older than fifteen minutes.
- Company `latest.json` and state must agree on a five-minute tick **and**
  that tick must be the actual UTC bucket of the claimed observation time.
- Current Saban `latest.json` must match its completed private goal file,
  registered World Engine review work identity, source fingerprint, persisted
  receipt, attempt number, checkpoint, and zero external mutations.
- The Worlds mission snapshot must be recomputable from the current stored
  Systemia goal revision, source fingerprint and this cycle's actual review
  disposition. The existing mission-publisher private ledger must record an
  ingress acknowledgment for that **exact** snapshot, rather than an unsent
  snapshot or a synthetic hold. This checks local acknowledgment evidence,
  not independent authenticated Yard or public-origin delivery.
- All input files must be private (mode 0600), outside the public source
  checkout, and not symlinks. Missing/stale/invalid evidence yields a HOLD.

`resident_evidence_verified` is a **readback claim about the observed local
state**, not an assertion this script deployed the service or independently
attested the hardware. CI tests use synthetic fixtures, not owner-host data.
Only actual owner-host execution plus independent node/deployment checks can
prove production activation. Local receipt hashes are unkeyed integrity checks,
not identity signatures; an independent live publisher/yard attestation remains
its own acceptance gate. The script exits nonzero on every HOLD.

## Tests

```bash
node --test tests/kaidance-owned-readback.test.mjs
```

This is invoked in the existing `kaidance-frontier-field.yml`; no new
workflow, timer, service, provider connection or public projection is created.
