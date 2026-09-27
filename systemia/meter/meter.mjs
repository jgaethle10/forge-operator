import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const AUTHORITATIVE_GRANT_STATES = new Set([
  'authoritative_verified',
  'manual_authorized',
]);

const sha256 = (value) =>
  'sha256:' +
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');

function iso(value, field) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(field + '_invalid');
  return date.toISOString();
}

function positiveNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(field + '_invalid');
  return number;
}

function requiredString(value, field) {
  const text = String(value || '').trim();
  if (!text) throw new Error(field + '_required');
  return text;
}

function stableReceipt(body) {
  return { ...body, receipt_hash: sha256(body) };
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function appendJsonl(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.appendFileSync(file, JSON.stringify(value) + '\n', { mode: 0o600 });
}

export class EvercraftMeter {
  constructor({ stateDir } = {}) {
    if (!stateDir) throw new Error('meter_state_dir_required');
    this.stateDir = path.resolve(stateDir);
    this.entitlementsFile = path.join(this.stateDir, 'entitlements.jsonl');
    this.usageFile = path.join(this.stateDir, 'usage-events.jsonl');

    this.entitlements = new Map();
    this.entitlementIdempotency = new Map();
    this.usage = [];
    this.usageIdempotency = new Map();

    for (const row of readJsonl(this.entitlementsFile)) {
      this.entitlements.set(row.entitlement_id, row);
      this.entitlementIdempotency.set(row.idempotency_key, row);
    }
    for (const row of readJsonl(this.usageFile)) {
      this.usage.push(row);
      this.usageIdempotency.set(row.idempotency_key, row);
    }
  }

  registerEntitlement(input) {
    const idempotencyKey = requiredString(input?.idempotency_key, 'idempotency_key');
    const subjectRef = requiredString(input?.subject_ref, 'subject_ref');
    const product = requiredString(input?.product, 'product');
    const metric = requiredString(input?.metric, 'metric');
    const limit = positiveNumber(input?.limit, 'limit');
    const startsAt = iso(input?.starts_at, 'starts_at');
    const endsAt = iso(input?.ends_at, 'ends_at');
    if (new Date(endsAt) <= new Date(startsAt)) throw new Error('entitlement_window_invalid');

    const authorityState = requiredString(input?.authority_state, 'authority_state');
    if (!AUTHORITATIVE_GRANT_STATES.has(authorityState)) {
      throw new Error('entitlement_authority_not_verified');
    }
    const authorityReceiptRef = requiredString(
      input?.authority_receipt_ref,
      'authority_receipt_ref'
    );

    const body = {
      schema: 'evercraft.meter.entitlement.v1',
      entitlement_id: input?.entitlement_id
        ? requiredString(input.entitlement_id, 'entitlement_id')
        : 'ent_' + randomUUID(),
      idempotency_key: idempotencyKey,
      subject_ref: subjectRef,
      product,
      metric,
      limit,
      starts_at: startsAt,
      ends_at: endsAt,
      authority_state: authorityState,
      authority_receipt_ref: authorityReceiptRef,
      source: input?.source ? String(input.source) : null,
      created_at: new Date().toISOString(),
    };

    const existing = this.entitlementIdempotency.get(idempotencyKey);
    if (existing) {
      const same =
        existing.subject_ref === body.subject_ref &&
        existing.product === body.product &&
        existing.metric === body.metric &&
        existing.limit === body.limit &&
        existing.starts_at === body.starts_at &&
        existing.ends_at === body.ends_at &&
        existing.authority_state === body.authority_state &&
        existing.authority_receipt_ref === body.authority_receipt_ref;
      if (!same) throw new Error('entitlement_idempotency_conflict');
      return {
        state: 'duplicate',
        entitlement: existing,
        receipt: stableReceipt({
          schema: 'evercraft.meter.entitlement-receipt.v1',
          state: 'duplicate',
          entitlement_id: existing.entitlement_id,
          idempotency_key: existing.idempotency_key,
        }),
      };
    }

    const entitlement = stableReceipt(body);
    this.entitlements.set(entitlement.entitlement_id, entitlement);
    this.entitlementIdempotency.set(idempotencyKey, entitlement);
    appendJsonl(this.entitlementsFile, entitlement);

    return {
      state: 'recorded',
      entitlement,
      receipt: stableReceipt({
        schema: 'evercraft.meter.entitlement-receipt.v1',
        state: 'recorded',
        entitlement_id: entitlement.entitlement_id,
        idempotency_key: entitlement.idempotency_key,
        authority_receipt_ref: entitlement.authority_receipt_ref,
      }),
    };
  }

  getEntitlementState(entitlementId, { at = new Date().toISOString() } = {}) {
    const id = requiredString(entitlementId, 'entitlement_id');
    const entitlement = this.entitlements.get(id);
    if (!entitlement) throw new Error('entitlement_not_found');
    const instant = iso(at, 'at');
    const active =
      new Date(instant) >= new Date(entitlement.starts_at) &&
      new Date(instant) < new Date(entitlement.ends_at);

    const used = this.usage
      .filter((event) => event.entitlement_id === id)
      .reduce((sum, event) => sum + event.quantity, 0);

    return {
      schema: 'evercraft.meter.entitlement-state.v1',
      entitlement_id: id,
      subject_ref: entitlement.subject_ref,
      product: entitlement.product,
      metric: entitlement.metric,
      limit: entitlement.limit,
      used,
      remaining: Math.max(0, entitlement.limit - used),
      overage: Math.max(0, used - entitlement.limit),
      active,
      starts_at: entitlement.starts_at,
      ends_at: entitlement.ends_at,
      authority_state: entitlement.authority_state,
      authority_receipt_ref: entitlement.authority_receipt_ref,
      observed_at: instant,
    };
  }

  recordUsage(input) {
    const idempotencyKey = requiredString(input?.idempotency_key, 'idempotency_key');
    const subjectRef = requiredString(input?.subject_ref, 'subject_ref');
    const product = requiredString(input?.product, 'product');
    const metric = requiredString(input?.metric, 'metric');
    const quantity = positiveNumber(input?.quantity, 'quantity');
    const occurredAt = iso(input?.occurred_at || new Date().toISOString(), 'occurred_at');
    const evidenceRef = requiredString(input?.evidence_ref, 'evidence_ref');
    const entitlementId = input?.entitlement_id
      ? requiredString(input.entitlement_id, 'entitlement_id')
      : null;

    const existing = this.usageIdempotency.get(idempotencyKey);
    if (existing) {
      const same =
        existing.subject_ref === subjectRef &&
        existing.product === product &&
        existing.metric === metric &&
        existing.quantity === quantity &&
        existing.occurred_at === occurredAt &&
        existing.evidence_ref === evidenceRef &&
        existing.entitlement_id === entitlementId;
      if (!same) throw new Error('usage_idempotency_conflict');
      return {
        state: 'duplicate',
        event: existing,
        receipt: stableReceipt({
          schema: 'evercraft.meter.usage-receipt.v1',
          state: 'duplicate',
          usage_event_id: existing.usage_event_id,
          idempotency_key: existing.idempotency_key,
        }),
      };
    }

    let entitlementState = null;
    if (entitlementId) {
      const entitlement = this.entitlements.get(entitlementId);
      if (!entitlement) throw new Error('entitlement_not_found');
      if (
        entitlement.subject_ref !== subjectRef ||
        entitlement.product !== product ||
        entitlement.metric !== metric
      ) {
        throw new Error('usage_entitlement_scope_mismatch');
      }
      entitlementState = this.getEntitlementState(entitlementId, { at: occurredAt });
      if (!entitlementState.active) throw new Error('entitlement_not_active');
      if (quantity > entitlementState.remaining) throw new Error('entitlement_limit_exceeded');
    }

    const body = {
      schema: 'evercraft.meter.usage-event.v1',
      usage_event_id: input?.usage_event_id
        ? requiredString(input.usage_event_id, 'usage_event_id')
        : 'use_' + randomUUID(),
      idempotency_key: idempotencyKey,
      subject_ref: subjectRef,
      product,
      metric,
      quantity,
      unit: input?.unit ? String(input.unit) : null,
      entitlement_id: entitlementId,
      evidence_ref: evidenceRef,
      source: input?.source ? String(input.source) : null,
      occurred_at: occurredAt,
      recorded_at: new Date().toISOString(),
    };
    const event = stableReceipt(body);

    this.usage.push(event);
    this.usageIdempotency.set(idempotencyKey, event);
    appendJsonl(this.usageFile, event);

    const stateAfter = entitlementId
      ? this.getEntitlementState(entitlementId, { at: occurredAt })
      : null;

    return {
      state: 'recorded',
      event,
      entitlement_state: stateAfter,
      receipt: stableReceipt({
        schema: 'evercraft.meter.usage-receipt.v1',
        state: 'recorded',
        usage_event_id: event.usage_event_id,
        idempotency_key: event.idempotency_key,
        evidence_ref: event.evidence_ref,
        entitlement_id: event.entitlement_id,
      }),
    };
  }

  queryUsage({
    subject_ref = null,
    product = null,
    metric = null,
    entitlement_id = null,
    from = null,
    to = null,
  } = {}) {
    const fromIso = from ? iso(from, 'from') : null;
    const toIso = to ? iso(to, 'to') : null;

    const events = this.usage.filter((event) => {
      if (subject_ref && event.subject_ref !== subject_ref) return false;
      if (product && event.product !== product) return false;
      if (metric && event.metric !== metric) return false;
      if (entitlement_id && event.entitlement_id !== entitlement_id) return false;
      if (fromIso && new Date(event.occurred_at) < new Date(fromIso)) return false;
      if (toIso && new Date(event.occurred_at) >= new Date(toIso)) return false;
      return true;
    });

    return {
      schema: 'evercraft.meter.usage-query.v1',
      filters: {
        subject_ref,
        product,
        metric,
        entitlement_id,
        from: fromIso,
        to: toIso,
      },
      event_count: events.length,
      quantity_total: events.reduce((sum, event) => sum + event.quantity, 0),
      events,
    };
  }
}
