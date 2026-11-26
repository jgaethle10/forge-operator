# Evercraft Site Planner | Durable Outbox v1

Implementation is committed in `server.py`, with validation in `outbox_audit.py`. No Systemia delivery has been configured or verified.

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
| `site.plan.status_changed.v1` | Order | actor, reason, old/new states, action_id, report_id |
| `site.source_report.linked.v1` | Source report | upstream report ID, report and source hashes |
| `site.plan.commercial_hold.v1` | Order | site_id, order_id, report_id, product_key, checkout_unconfigured and fulfillment_held |

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

## Commercial hold (v1.5)

Browser-created Site Planner orders are **commercial quote requests**, not paid jobs. Their immutable report, `order_controls`, and a `site.plan.commercial_hold.v1` event are persisted atomically. The server refuses to assign, review, or register completed plans for these orders. Payment data supplied by a caller has no authority. The seven currently verified Evercraft Payments checkout offers belong to other products, not Site Planner. No dispatch or settlement job is implemented here.

Explicit `internal_planning` is a private local QA lane with no payment or customer fulfillment claims. Existing legacy orders without `order_controls` are held; production must introduce role-based protections before any public access.

Before release: register a distinct approved Site Planner checkout; prove exact merchant/offer/amount/currency/provider settlement and refunds against private Evercraft Payments evidence; review scope and engineering capacity with authenticated principals; and require signed Systemia delivery acknowledgment. The outbox currently stays `pending`.

The local v1.5 regression suite passes **18 tests** including spoofed-payment rejection, cross-site isolation, stale report binding, commercial holds, and public listener refusal.
