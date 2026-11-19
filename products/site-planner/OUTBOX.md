# Evercraft Site Planner | Durable Outbox v1

Implementation packaged in the local Site Planner application. This document is the canonical integration specification; it does not imply Systemia delivery is online.

## Persisted schema

```sql
CREATE TABLE outbox (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id),
  event_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  delivered_at TEXT
);
CREATE INDEX idx_outbox_state ON outbox(state, created_at);
```

Events are inserted in the **same SQLite transaction** as their originating domain record, so a failed order/plan transaction cannot leave a phantom event.

| Event type | Aggregate | Payload |
| --- | --- | --- |
| `site.report.created.v1` | Report | site_id, report_id, evidence_count, scenario_count |
| `site.plan.requested.v1` | Order | site_id, order_id, report_id, scenario_id, scope, requested_by |
| `site.plan.registered.v1` | Plan | site_id, plan_id, order_id, report_id, status |

Payload SHA-256 is calculated from sorted-key compact JSON, UTF-8 encoded. SHA-256 detects changes but **is not a digital signature** or authenticated proof of origin.

## Next Systemia worker

1. Authenticate against Evercraft-owned loopback/IPC, not a publicly exposed endpoint.
2. Claim a bounded set of `pending` events with a database lease and expiry, atomically.
3. Deliver with mutually authenticated signing and idempotency key equal to `outbox.id`.
4. Validate a durable Systemia receipt (identity, event id, payload hash).
5. Only then mark event as `delivered` with `delivered_at`.
6. Retry with exponential backoff and a dead-letter register on repeated failure.
7. Never mark a payment as settled without Evercraft Payments settlement evidence.

There is **no dispatcher, authenticated signed delivery, retry scheduler, ack API or live Systemia connection** in this stage. `GET /api/outbox` returns event metadata without raw payloads for local operator inspection. The application currently has a single local bearer-token option rather than true per-user authorization. It MUST remain private.

## Evidence and ordering

Plan-return records always inherit `report_id` from the persisted originating order. The order stores a newly created immutable report snapshot when requested. Cross-site scenario and order references are rejected by server-side queries. This is tested.

## Tests

Run `python3 -m unittest discover -s . -p 'test_*.py' -v` within the Site Planner folder. The current local test verifies request/report traceability, cross-site rejection, immutable report preservation, and undelivered order/plan outbox entries.

Do not infer external deployment, customer checkout, or licensed engineering approvals from these tests.
