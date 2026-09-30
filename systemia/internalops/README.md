# Evercraft InternalOps owned ingress

This directory is the first owned-runtime cutover slice for Evercraft InternalOps.

The legacy app currently produces a deliberately aggregate, read-only operations snapshot. The owned Fabric runtime now has a private machine-authenticated ingress that can receive that contract, validate its authority boundaries, strip the legacy application identifier, deduplicate replays by payload hash, and persist a local receipt plus the latest aggregate snapshot.

This does **not** move private customer, employee, payroll, tax, payment-account, or raw operational records into the public Forge repository. Those records require a separate private data migration and reconciliation pass.

## Route

`POST /internal/eps/snapshot`

The route exists only when both of these runtime values are present:

- `EPS_SYSTEMIA_MACHINE_KEY`
- `EVERCRAFT_INTERNALOPS_STATE_DIR`

The public MCP remains read-only. The snapshot ingress is a separate machine-only operational lane.

## Required request

```json
{
  "action": "ingest_snapshot",
  "mission_key": "evercraft-internalops-operations-nexus-v1",
  "source_checkpoint_id": "optional",
  "snapshot": {
    "contract": "eps_systemia_read_only_snapshot_v1"
  }
}
```

The request must include `x-systemia-machine-key` matching the private runtime secret.

## Fail-closed boundaries

The snapshot is rejected unless it explicitly states that it is read-only, contains no personal contact data, contains no tax or payment-account data, and cannot authorize mutation. The legacy Base44 app identifier is removed before persistence.

## Cutover sequence

1. Merge and deploy this owned ingress.
2. Install the machine key only in the private runtime environment.
3. Prove authenticated ingest, deduplication, receipt creation, and replay behavior.
4. Verify the route through the owned HTTPS edge.
5. Only then repoint the legacy InternalOps aggregate push from the legacy Systemia endpoint to this owned route.
6. Keep the legacy source datastore in place until the separate private data migration is reconciled.

Run the local proof with:

```bash
node systemia/internalops/snapshot-ingress.proof.mjs
node --test tests/fabric-local-runtime.test.mjs
```
