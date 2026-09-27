import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const AUTHORITATIVE_GRANT_STATES = new Set([
  'authoritative_verified',
  'manual_authorized',
]);

const MAX_RESERVATION_SECONDS = 24 * 60 * 60;
const LOCK_STALE_MS = 30_000;
const LOCK_TIMEOUT_MS = 5_000;
const LOCK_POLL_MS = 10;
const waitBuffer = new Int32Array(new SharedArrayBuffer(4));

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

function sleep(ms) {
  Atomics.wait(waitBuffer, 0, 0, ms);
}

export class EvercraftMeter {
  constructor({ stateDir } = {}) {
    if (!stateDir) throw new Error('meter_state_dir_required');
    this.stateDir = path.resolve(stateDir);
    this.entitlementsFile = path.join(this.stateDir, 'entitlements.jsonl');
    this.usageFile = path.join(this.stateDir, 'usage-events.jsonl');
    this.reservationsFile = path.join(this.stateDir, 'reservation-events.jsonl');
    this.lockDir = path.join(this.stateDir, '.mutation-lock');

    this.entitlements = new Map();
    this.entitlementIdempotency = new Map();
    this.usage = [];
    this.usageIdempotency = new Map();
    this.reservations = new Map();
    this.reservationOperationIdempotency = new Map();
    this.#reload();
  }

  #reload() {
    this.entitlements.clear();
    this.entitlementIdempotency.clear();
    this.usage = [];
    this.usageIdempotency.clear();
    this.reservations.clear();
    this.reservationOperationIdempotency.clear();

    for (const row of readJsonl(this.entitlementsFile)) {
      this.entitlements.set(row.entitlement_id, row);
      this.entitlementIdempotency.set(row.idempotency_key, row);
    }
    for (const row of readJsonl(this.usageFile)) {
      this.usage.push(row);
      this.usageIdempotency.set(row.idempotency_key, row);
    }
    for (const event of readJsonl(this.reservationsFile)) {
      this.reservations.set(event.reservation_id, event);
      this.reservationOperationIdempotency.set(event.idempotency_key, event);
    }

    // A persisted usage event referencing a reservation is authoritative proof that
    // the reservation was consumed, even if a crash occurred before the explicit
    // commit-state row was appended.
    const consumed = new Map(
      this.usage
        .filter((event) => event.reservation_id)
        .map((event) => [event.reservation_id, event])
    );
    for (const [reservationId, usageEvent] of consumed) {
      const current = this.reservations.get(reservationId);
      if (current && current.state === 'active') {
        this.reservations.set(reservationId, {
          ...current,
          state: 'committed',
          committed_by_usage_event_id: usageEvent.usage_event_id,
          crash_recovered_commit: true,
        });
      }
    }
  }

  #acquireLock() {
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    const deadline = Date.now() + LOCK_TIMEOUT_MS;

    while (Date.now() < deadline) {
      try {
        fs.mkdirSync(this.lockDir, { mode: 0o700 });
        fs.writeFileSync(
          path.join(this.lockDir, 'owner.json'),
          JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() }) + '\n',
          { mode: 0o600 }
        );
        return;
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        try {
          const stat = fs.statSync(this.lockDir);
          if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
            fs.rmSync(this.lockDir, { recursive: true, force: true });
            continue;
          }
        } catch (statError) {
          if (statError?.code !== 'ENOENT') throw statError;
        }
        sleep(LOCK_POLL_MS);
      }
    }
    throw new Error('meter_mutation_lock_timeout');
  }

  #releaseLock() {
    fs.rmSync(this.lockDir, { recursive: true, force: true });
  }

  #mutate(fn) {
    this.#acquireLock();
    try {
      this.#reload();
      return fn();
    } finally {
      this.#releaseLock();
    }
  }

  #reservationActiveAt(reservation, at) {
    return (
      reservation.state === 'active' &&
      new Date(at) >= new Date(reservation.reserved_at) &&
      new Date(at) < new Date(reservation.expires_at)
    );
  }

  #entitlementStateUnlocked(entitlementId, instant) {
    const entitlement = this.entitlements.get(entitlementId);
    if (!entitlement) throw new Error('entitlement_not_found');

    const active =
      new Date(instant) >= new Date(entitlement.starts_at) &&
      new Date(instant) < new Date(entitlement.ends_at);

    const used = this.usage
      .filter((event) => event.entitlement_id === entitlementId)
      .reduce((sum, event) => sum + event.quantity, 0);

    const reserved = [...this.reservations.values()]
      .filter(
        (reservation) =>
          reservation.entitlement_id === entitlementId &&
          this.#reservationActiveAt(reservation, instant)
      )
      .reduce((sum, reservation) => sum + reservation.quantity, 0);

    const remaining = Math.max(0, entitlement.limit - used);
    const available = Math.max(0, entitlement.limit - used - reserved);

    return {
      schema: 'evercraft.meter.entitlement-state.v2',
      entitlement_id: entitlementId,
      subject_ref: entitlement.subject_ref,
      product: entitlement.product,
      metric: entitlement.metric,
      limit: entitlement.limit,
      used,
      reserved,
      remaining,
      available,
      overage: Math.max(0, used - entitlement.limit),
      active,
      starts_at: entitlement.starts_at,
      ends_at: entitlement.ends_at,
      authority_state: entitlement.authority_state,
      authority_receipt_ref: entitlement.authority_receipt_ref,
      observed_at: instant,
    };
  }

  registerEntitlement(input) {
    return this.#mutate(() => {
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
        schema: 'evercraft.meter.entitlement.v2',
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
            schema: 'evercraft.meter.entitlement-receipt.v2',
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
          schema: 'evercraft.meter.entitlement-receipt.v2',
          state: 'recorded',
          entitlement_id: entitlement.entitlement_id,
          idempotency_key: entitlement.idempotency_key,
          authority_receipt_ref: entitlement.authority_receipt_ref,
        }),
      };
    });
  }

  getEntitlementState(entitlementId, { at = new Date().toISOString() } = {}) {
    this.#reload();
    const id = requiredString(entitlementId, 'entitlement_id');
    const instant = iso(at, 'at');
    return this.#entitlementStateUnlocked(id, instant);
  }

  quoteAuthorization(input) {
    this.#reload();
    const subjectRef = requiredString(input?.subject_ref, 'subject_ref');
    const product = requiredString(input?.product, 'product');
    const metric = requiredString(input?.metric, 'metric');
    const quantity = positiveNumber(input?.quantity, 'quantity');
    const at = iso(input?.at || new Date().toISOString(), 'at');

    const candidates = [...this.entitlements.values()]
      .filter(
        (entitlement) =>
          entitlement.subject_ref === subjectRef &&
          entitlement.product === product &&
          entitlement.metric === metric
      )
      .map((entitlement) => this.#entitlementStateUnlocked(entitlement.entitlement_id, at))
      .filter((state) => state.active && state.available >= quantity)
      .sort((a, b) => new Date(a.ends_at) - new Date(b.ends_at));

    const selected = candidates[0] || null;
    return stableReceipt({
      schema: 'evercraft.meter.authorization-quote.v1',
      state: selected ? 'authorized_capacity_available' : 'insufficient_entitlement',
      subject_ref: subjectRef,
      product,
      metric,
      quantity,
      selected_entitlement_id: selected?.entitlement_id || null,
      available_before_reservation: selected?.available ?? 0,
      candidate_count: candidates.length,
      quoted_at: at,
      mutation_performed: false,
    });
  }

  reserveUsage(input) {
    return this.#mutate(() => {
      const idempotencyKey = requiredString(input?.idempotency_key, 'idempotency_key');
      const existing = this.reservationOperationIdempotency.get(idempotencyKey);
      if (existing) {
        return {
          state: 'duplicate',
          reservation: this.reservations.get(existing.reservation_id) || existing,
          receipt: stableReceipt({
            schema: 'evercraft.meter.reservation-receipt.v1',
            state: 'duplicate',
            reservation_id: existing.reservation_id,
            idempotency_key: idempotencyKey,
          }),
        };
      }

      const subjectRef = requiredString(input?.subject_ref, 'subject_ref');
      const product = requiredString(input?.product, 'product');
      const metric = requiredString(input?.metric, 'metric');
      const quantity = positiveNumber(input?.quantity, 'quantity');
      const requestRef = requiredString(input?.request_ref, 'request_ref');
      const reservedAt = iso(input?.reserved_at || new Date().toISOString(), 'reserved_at');
      const holdSeconds = Math.min(
        MAX_RESERVATION_SECONDS,
        positiveNumber(input?.hold_seconds || 300, 'hold_seconds')
      );

      let entitlementId = input?.entitlement_id
        ? requiredString(input.entitlement_id, 'entitlement_id')
        : null;

      if (!entitlementId) {
        const candidates = [...this.entitlements.values()]
          .filter(
            (entitlement) =>
              entitlement.subject_ref === subjectRef &&
              entitlement.product === product &&
              entitlement.metric === metric
          )
          .map((entitlement) =>
            this.#entitlementStateUnlocked(entitlement.entitlement_id, reservedAt)
          )
          .filter((state) => state.active && state.available >= quantity)
          .sort((a, b) => new Date(a.ends_at) - new Date(b.ends_at));
        entitlementId = candidates[0]?.entitlement_id || null;
      }

      if (!entitlementId) throw new Error('insufficient_entitlement');

      const entitlement = this.entitlements.get(entitlementId);
      if (!entitlement) throw new Error('entitlement_not_found');
      if (
        entitlement.subject_ref !== subjectRef ||
        entitlement.product !== product ||
        entitlement.metric !== metric
      ) {
        throw new Error('reservation_entitlement_scope_mismatch');
      }

      const before = this.#entitlementStateUnlocked(entitlementId, reservedAt);
      if (!before.active) throw new Error('entitlement_not_active');
      if (quantity > before.available) throw new Error('entitlement_capacity_unavailable');

      const desiredExpiry = new Date(new Date(reservedAt).getTime() + holdSeconds * 1000);
      const entitlementExpiry = new Date(entitlement.ends_at);
      const expiresAt = new Date(
        Math.min(desiredExpiry.getTime(), entitlementExpiry.getTime())
      ).toISOString();

      const event = stableReceipt({
        schema: 'evercraft.meter.reservation-event.v1',
        state: 'active',
        reservation_id: input?.reservation_id
          ? requiredString(input.reservation_id, 'reservation_id')
          : 'res_' + randomUUID(),
        idempotency_key: idempotencyKey,
        subject_ref: subjectRef,
        product,
        metric,
        quantity,
        unit: input?.unit ? String(input.unit) : null,
        entitlement_id: entitlementId,
        request_ref: requestRef,
        reserved_at: reservedAt,
        expires_at: expiresAt,
        recorded_at: new Date().toISOString(),
      });

      this.reservations.set(event.reservation_id, event);
      this.reservationOperationIdempotency.set(idempotencyKey, event);
      appendJsonl(this.reservationsFile, event);

      const after = this.#entitlementStateUnlocked(entitlementId, reservedAt);
      return {
        state: 'reserved',
        reservation: event,
        entitlement_state: after,
        receipt: stableReceipt({
          schema: 'evercraft.meter.reservation-receipt.v1',
          state: 'reserved',
          reservation_id: event.reservation_id,
          entitlement_id: entitlementId,
          quantity,
          request_ref: requestRef,
          available_before: before.available,
          available_after: after.available,
          expires_at: expiresAt,
        }),
      };
    });
  }

  #recordUsageUnlocked(input, { allowReservedCommit = false } = {}) {
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
    const reservationId = input?.reservation_id
      ? requiredString(input.reservation_id, 'reservation_id')
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
        existing.entitlement_id === entitlementId &&
        existing.reservation_id === reservationId;
      if (!same) throw new Error('usage_idempotency_conflict');
      return {
        state: 'duplicate',
        event: existing,
        receipt: stableReceipt({
          schema: 'evercraft.meter.usage-receipt.v2',
          state: 'duplicate',
          usage_event_id: existing.usage_event_id,
          idempotency_key: existing.idempotency_key,
        }),
      };
    }

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
      const state = this.#entitlementStateUnlocked(entitlementId, occurredAt);
      if (!state.active) throw new Error('entitlement_not_active');
      if (!allowReservedCommit && quantity > state.available) {
        throw new Error('entitlement_capacity_unavailable');
      }
    }

    const body = {
      schema: 'evercraft.meter.usage-event.v2',
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
      reservation_id: reservationId,
      evidence_ref: evidenceRef,
      source: input?.source ? String(input.source) : null,
      occurred_at: occurredAt,
      recorded_at: new Date().toISOString(),
    };
    const event = stableReceipt(body);

    this.usage.push(event);
    this.usageIdempotency.set(idempotencyKey, event);
    appendJsonl(this.usageFile, event);

    return {
      state: 'recorded',
      event,
      entitlement_state: entitlementId
        ? this.#entitlementStateUnlocked(entitlementId, occurredAt)
        : null,
      receipt: stableReceipt({
        schema: 'evercraft.meter.usage-receipt.v2',
        state: 'recorded',
        usage_event_id: event.usage_event_id,
        idempotency_key: event.idempotency_key,
        evidence_ref: event.evidence_ref,
        entitlement_id: event.entitlement_id,
        reservation_id: event.reservation_id,
      }),
    };
  }

  recordUsage(input) {
    return this.#mutate(() => this.#recordUsageUnlocked(input));
  }

  commitReservation(input) {
    return this.#mutate(() => {
      const idempotencyKey = requiredString(input?.idempotency_key, 'idempotency_key');
      const priorOperation = this.reservationOperationIdempotency.get(idempotencyKey);
      if (priorOperation) {
        const reservation = this.reservations.get(priorOperation.reservation_id);
        return {
          state: 'duplicate',
          reservation,
          receipt: stableReceipt({
            schema: 'evercraft.meter.reservation-commit-receipt.v1',
            state: 'duplicate',
            reservation_id: priorOperation.reservation_id,
            idempotency_key: idempotencyKey,
          }),
        };
      }

      const reservationId = requiredString(input?.reservation_id, 'reservation_id');
      const current = this.reservations.get(reservationId);
      if (!current) throw new Error('reservation_not_found');
      const occurredAt = iso(input?.occurred_at || new Date().toISOString(), 'occurred_at');
      if (!this.#reservationActiveAt(current, occurredAt)) {
        throw new Error(
          current.state === 'committed' ? 'reservation_already_committed' : 'reservation_not_active'
        );
      }

      const evidenceRef = requiredString(input?.evidence_ref, 'evidence_ref');
      const usage = this.#recordUsageUnlocked(
        {
          idempotency_key: 'reservation-usage:' + reservationId,
          subject_ref: current.subject_ref,
          product: current.product,
          metric: current.metric,
          quantity: current.quantity,
          unit: current.unit,
          entitlement_id: current.entitlement_id,
          reservation_id: reservationId,
          evidence_ref: evidenceRef,
          source: input?.source || 'reservation_commit',
          occurred_at: occurredAt,
        },
        { allowReservedCommit: true }
      );

      const event = stableReceipt({
        schema: 'evercraft.meter.reservation-event.v1',
        state: 'committed',
        reservation_id: reservationId,
        idempotency_key: idempotencyKey,
        subject_ref: current.subject_ref,
        product: current.product,
        metric: current.metric,
        quantity: current.quantity,
        unit: current.unit,
        entitlement_id: current.entitlement_id,
        request_ref: current.request_ref,
        reserved_at: current.reserved_at,
        expires_at: current.expires_at,
        evidence_ref: evidenceRef,
        usage_event_id: usage.event.usage_event_id,
        committed_at: occurredAt,
        recorded_at: new Date().toISOString(),
      });

      this.reservations.set(reservationId, event);
      this.reservationOperationIdempotency.set(idempotencyKey, event);
      appendJsonl(this.reservationsFile, event);

      return {
        state: 'committed',
        reservation: event,
        usage_event: usage.event,
        entitlement_state: this.#entitlementStateUnlocked(
          current.entitlement_id,
          occurredAt
        ),
        receipt: stableReceipt({
          schema: 'evercraft.meter.reservation-commit-receipt.v1',
          state: 'committed',
          reservation_id: reservationId,
          usage_event_id: usage.event.usage_event_id,
          entitlement_id: current.entitlement_id,
          quantity: current.quantity,
          evidence_ref: evidenceRef,
        }),
      };
    });
  }

  releaseReservation(input) {
    return this.#mutate(() => {
      const idempotencyKey = requiredString(input?.idempotency_key, 'idempotency_key');
      const priorOperation = this.reservationOperationIdempotency.get(idempotencyKey);
      if (priorOperation) {
        return {
          state: 'duplicate',
          reservation: this.reservations.get(priorOperation.reservation_id),
          receipt: stableReceipt({
            schema: 'evercraft.meter.reservation-release-receipt.v1',
            state: 'duplicate',
            reservation_id: priorOperation.reservation_id,
            idempotency_key: idempotencyKey,
          }),
        };
      }

      const reservationId = requiredString(input?.reservation_id, 'reservation_id');
      const current = this.reservations.get(reservationId);
      if (!current) throw new Error('reservation_not_found');
      if (current.state === 'committed') throw new Error('reservation_already_committed');
      if (current.state === 'released') throw new Error('reservation_already_released');

      const releasedAt = iso(input?.released_at || new Date().toISOString(), 'released_at');
      const event = stableReceipt({
        schema: 'evercraft.meter.reservation-event.v1',
        state: 'released',
        reservation_id: reservationId,
        idempotency_key: idempotencyKey,
        subject_ref: current.subject_ref,
        product: current.product,
        metric: current.metric,
        quantity: current.quantity,
        unit: current.unit,
        entitlement_id: current.entitlement_id,
        request_ref: current.request_ref,
        reserved_at: current.reserved_at,
        expires_at: current.expires_at,
        release_reason: input?.reason ? String(input.reason) : null,
        released_at: releasedAt,
        recorded_at: new Date().toISOString(),
      });

      this.reservations.set(reservationId, event);
      this.reservationOperationIdempotency.set(idempotencyKey, event);
      appendJsonl(this.reservationsFile, event);

      return {
        state: 'released',
        reservation: event,
        entitlement_state: this.#entitlementStateUnlocked(
          current.entitlement_id,
          releasedAt
        ),
        receipt: stableReceipt({
          schema: 'evercraft.meter.reservation-release-receipt.v1',
          state: 'released',
          reservation_id: reservationId,
          entitlement_id: current.entitlement_id,
          quantity: current.quantity,
        }),
      };
    });
  }

  queryUsage({
    subject_ref = null,
    product = null,
    metric = null,
    entitlement_id = null,
    from = null,
    to = null,
  } = {}) {
    this.#reload();
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
      schema: 'evercraft.meter.usage-query.v2',
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

  buildSettlementDigest({
    subject_ref = null,
    from = null,
    to = null,
  } = {}) {
    const usage = this.queryUsage({ subject_ref, from, to });
    const buckets = new Map();

    for (const event of usage.events) {
      const key = [event.subject_ref, event.product, event.metric, event.unit || 'unit'].join('|');
      const row = buckets.get(key) || {
        subject_ref: event.subject_ref,
        product: event.product,
        metric: event.metric,
        unit: event.unit || null,
        quantity: 0,
        event_count: 0,
      };
      row.quantity += event.quantity;
      row.event_count += 1;
      buckets.set(key, row);
    }

    const lines = [...buckets.values()].sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b))
    );

    return stableReceipt({
      schema: 'evercraft.meter.settlement-digest.v1',
      subject_ref,
      from: usage.filters.from,
      to: usage.filters.to,
      total_usage_events: usage.event_count,
      lines,
      pricing_applied: false,
      payment_state_inferred: false,
    });
  }
}
