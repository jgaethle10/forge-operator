import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { EvercraftPassport } from '../passport/passport.mjs';
import { EvercraftMeter } from '../meter/meter.mjs';

const LOCK_STALE_MS = 30_000;
const LOCK_TIMEOUT_MS = 5_000;
const LOCK_POLL_MS = 10;
const waitBuffer = new Int32Array(new SharedArrayBuffer(4));

const sha256 = (value) =>
  'sha256:' +
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');

function stableReceipt(body) {
  return { ...body, receipt_hash: sha256(body) };
}

function requiredString(value, field) {
  const text = String(value || '').trim();
  if (!text) throw new Error(field + '_required');
  return text;
}

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

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonical(child)])
    );
  }
  return value;
}

function requestFingerprint(input) {
  if (input?.request_fingerprint) {
    const fingerprint = requiredString(input.request_fingerprint, 'request_fingerprint');
    if (!/^sha256:[a-f0-9]{64}$/i.test(fingerprint)) {
      throw new Error('request_fingerprint_invalid');
    }
    return fingerprint.toLowerCase();
  }
  if (!Object.prototype.hasOwnProperty.call(input || {}, 'request')) {
    throw new Error('request_or_fingerprint_required');
  }
  return sha256(JSON.stringify(canonical(input.request)));
}

export class EvercraftExecutionGate {
  constructor({
    stateDir,
    passportStateDir,
    meterStateDir,
    routeLedgerPath,
  } = {}) {
    if (!stateDir) throw new Error('execution_gate_state_dir_required');
    if (!passportStateDir) throw new Error('passport_state_dir_required');
    if (!meterStateDir) throw new Error('meter_state_dir_required');
    if (!routeLedgerPath) throw new Error('route_ledger_path_required');

    this.stateDir = path.resolve(stateDir);
    this.eventsFile = path.join(this.stateDir, 'execution-lease-events.jsonl');
    this.lockDir = path.join(this.stateDir, '.mutation-lock');
    this.routeLedgerPath = path.resolve(routeLedgerPath);
    this.passport = new EvercraftPassport({ stateDir: passportStateDir });
    this.meter = new EvercraftMeter({ stateDir: meterStateDir });

    this.latest = new Map();
    this.operationIdempotency = new Map();
    this.#reload();
  }

  #reload() {
    this.latest.clear();
    this.operationIdempotency.clear();
    for (const event of readJsonl(this.eventsFile)) {
      this.latest.set(event.lease_id, event);
      this.operationIdempotency.set(event.idempotency_key, event);
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
    throw new Error('execution_gate_mutation_lock_timeout');
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

  #append(event) {
    const receipt = stableReceipt(event);
    this.latest.set(receipt.lease_id, receipt);
    this.operationIdempotency.set(receipt.idempotency_key, receipt);
    appendJsonl(this.eventsFile, receipt);
    return receipt;
  }

  #routeFor(slug) {
    const routeLedger = JSON.parse(fs.readFileSync(this.routeLedgerPath, 'utf8'));
    if (!String(routeLedger.schema || '').startsWith('evercraft.direct-door-readiness.')) {
      throw new Error('route_ledger_schema_invalid');
    }

    const product = (routeLedger.products || []).find((row) => row.slug === slug);
    if (!product) {
      return {
        schema: 'evercraft.execution-gate.route-snapshot.v1',
        specialist_slug: slug,
        state: 'unknown_specialist',
        direct_callable: false,
        route: routeLedger.universal_fallback
          ? {
              mode: 'universal_fallback_for_unknown_product',
              hops_before_specialist: 1,
              use_universal_router_first: true,
              registry_name: routeLedger.universal_fallback.registry_name,
              remote_mcp: routeLedger.universal_fallback.remote_mcp,
            }
          : null,
        source_schema: routeLedger.schema,
      };
    }

    return {
      schema: 'evercraft.execution-gate.route-snapshot.v1',
      specialist_slug: slug,
      product_name: product.name,
      state: product.state,
      direct_callable: product.direct_callable === true,
      registry_published: product.registry_published === true,
      route: product.preferred_route || null,
      blocking_gates: product.blocking_gates || [],
      next_release_action: product.next_release_action || null,
      source_schema: routeLedger.schema,
    };
  }

  #leaseEvent({
    leaseId,
    idempotencyKey,
    state,
    base = {},
    at,
    extra = {},
  }) {
    return this.#append({
      schema: 'evercraft.execution-gate.lease-event.v1',
      lease_id: leaseId,
      idempotency_key: idempotencyKey,
      state,
      actor_ref: base.actor_ref,
      passport_product: base.passport_product,
      scope: base.scope,
      resource_ref: base.resource_ref || null,
      specialist_slug: base.specialist_slug,
      request_fingerprint: base.request_fingerprint,
      route: base.route,
      permit_id: base.permit_id || null,
      meter_reservation_id: base.meter_reservation_id || null,
      meter: base.meter || null,
      raw_request_stored: false,
      dispatch_performed: false,
      recorded_at: at,
      ...extra,
    });
  }

  getLease(leaseId) {
    this.#reload();
    return this.latest.get(requiredString(leaseId, 'lease_id')) || null;
  }

  prepareExecution(input) {
    return this.#mutate(() => {
      const idempotencyKey = requiredString(input?.idempotency_key, 'idempotency_key');
      const duplicate = this.operationIdempotency.get(idempotencyKey);
      const duplicateLatest = duplicate
        ? this.latest.get(duplicate.lease_id) || duplicate
        : null;
      if (duplicate && duplicateLatest.state !== 'preparing') {
        return {
          state: duplicateLatest.state,
          lease: duplicateLatest,
          duplicate: true,
          dispatch_allowed: duplicateLatest.state === 'started',
        };
      }

      const leaseId = duplicate?.lease_id || (input?.lease_id
        ? requiredString(input.lease_id, 'lease_id')
        : 'lease_' + randomUUID());
      const existingLease = this.latest.get(leaseId);
      if (existingLease && existingLease.state !== 'preparing') {
        throw new Error('lease_id_conflict');
      }

      const preparedAt = iso(input?.prepared_at || new Date().toISOString(), 'prepared_at');
      const actorRef = requiredString(input?.actor_ref, 'actor_ref');
      const passportProduct = requiredString(input?.passport_product, 'passport_product');
      const scope = requiredString(input?.scope, 'scope');
      const resourceRef = input?.resource_ref
        ? requiredString(input.resource_ref, 'resource_ref')
        : null;
      const specialistSlug = requiredString(input?.specialist_slug, 'specialist_slug');
      const fingerprint = requestFingerprint(input);
      const route = this.#routeFor(specialistSlug);

      if (!route.route?.remote_mcp) {
        return {
          state: 'denied',
          reason: 'no_callable_or_fallback_route',
          route,
          mutation_performed: false,
        };
      }
      if (input?.require_direct_specialist === true && route.direct_callable !== true) {
        return {
          state: 'denied',
          reason: 'direct_specialist_not_ready',
          route,
          mutation_performed: false,
        };
      }

      const authorization = this.passport.authorize({
        subject_ref: actorRef,
        product: passportProduct,
        scope,
        resource_ref: resourceRef,
        at: preparedAt,
      });
      if (authorization.decision !== 'allow' || !authorization.grant_id) {
        return {
          state: 'denied',
          reason: 'passport_authorization_denied',
          route,
          authorization,
          mutation_performed: false,
        };
      }

      const meterInput = input?.meter || null;
      let meterQuote = null;
      if (meterInput) {
        meterQuote = this.meter.quoteAuthorization({
          subject_ref: requiredString(meterInput.subject_ref, 'meter.subject_ref'),
          product: requiredString(meterInput.product, 'meter.product'),
          metric: requiredString(meterInput.metric, 'meter.metric'),
          quantity: positiveNumber(meterInput.quantity, 'meter.quantity'),
          at: preparedAt,
        });
        if (meterQuote.state !== 'authorized_capacity_available') {
          return {
            state: 'denied',
            reason: 'meter_capacity_unavailable',
            route,
            authorization,
            meter_quote: meterQuote,
            mutation_performed: false,
          };
        }
      }

      const base = {
        actor_ref: actorRef,
        passport_product: passportProduct,
        scope,
        resource_ref: resourceRef,
        specialist_slug: specialistSlug,
        request_fingerprint: fingerprint,
        route,
        permit_id: input?.permit_id || 'permit_' + leaseId,
        meter_reservation_id: meterInput
          ? input?.meter_reservation_id || 'res_' + leaseId
          : null,
        meter: meterInput
          ? {
              subject_ref: requiredString(meterInput.subject_ref, 'meter.subject_ref'),
              product: requiredString(meterInput.product, 'meter.product'),
              metric: requiredString(meterInput.metric, 'meter.metric'),
              quantity: positiveNumber(meterInput.quantity, 'meter.quantity'),
              unit: meterInput.unit ? String(meterInput.unit) : null,
              entitlement_id: meterQuote.selected_entitlement_id,
            }
          : null,
      };

      if (!existingLease) {
        this.#leaseEvent({
          leaseId,
          idempotencyKey,
          state: 'preparing',
          base,
          at: preparedAt,
          extra: {
            authorization_grant_id: authorization.grant_id,
            authorization_receipt: authorization.receipt_hash,
            meter_quote_receipt: meterQuote?.receipt_hash || null,
          },
        });
      }

      let reservation = null;
      if (base.meter) {
        try {
          reservation = this.meter.reserveUsage({
            reservation_id: base.meter_reservation_id,
            idempotency_key: 'execution:' + leaseId + ':meter:reserve',
            subject_ref: base.meter.subject_ref,
            product: base.meter.product,
            metric: base.meter.metric,
            quantity: base.meter.quantity,
            unit: base.meter.unit,
            entitlement_id: base.meter.entitlement_id,
            request_ref: 'execution:' + leaseId,
            hold_seconds: Math.min(Number(input?.hold_seconds || 300), 900),
            reserved_at: preparedAt,
          });
        } catch (error) {
          const failed = this.#leaseEvent({
            leaseId,
            idempotencyKey: idempotencyKey + ':failed',
            state: 'prepare_failed',
            base,
            at: preparedAt,
            extra: {
              failure_stage: 'meter_reservation',
              failure_reason: String(error?.message || error),
            },
          });
          return { state: 'prepare_failed', lease: failed };
        }
      }

      let permit;
      try {
        permit = this.passport.mintActionPermit({
          permit_id: base.permit_id,
          idempotency_key: 'execution:' + leaseId + ':permit:mint',
          grant_id: authorization.grant_id,
          actor_ref: actorRef,
          scope,
          resource_ref: resourceRef,
          request_fingerprint: fingerprint,
          ttl_seconds: Math.min(Number(input?.permit_ttl_seconds || 300), 900),
          minted_at: preparedAt,
        });
      } catch (error) {
        if (reservation?.reservation?.reservation_id) {
          try {
            this.meter.releaseReservation({
              reservation_id: reservation.reservation.reservation_id,
              idempotency_key: 'execution:' + leaseId + ':meter:compensate',
              reason: 'passport_permit_mint_failed',
              released_at: preparedAt,
            });
          } catch {}
        }
        const failed = this.#leaseEvent({
          leaseId,
          idempotencyKey: idempotencyKey + ':failed',
          state: 'prepare_failed',
          base,
          at: preparedAt,
          extra: {
            failure_stage: 'passport_permit',
            failure_reason: String(error?.message || error),
            meter_compensation_attempted: Boolean(reservation),
          },
        });
        return { state: 'prepare_failed', lease: failed };
      }

      const prepared = this.#leaseEvent({
        leaseId,
        idempotencyKey: idempotencyKey + ':prepared',
        state: 'prepared',
        base,
        at: preparedAt,
        extra: {
          authorization_grant_id: authorization.grant_id,
          passport_permit_receipt: permit.receipt.receipt_hash,
          meter_reservation_receipt: reservation?.receipt?.receipt_hash || null,
          dispatch_allowed: false,
        },
      });

      return {
        state: 'prepared',
        lease: prepared,
        route,
        permit: permit.permit,
        reservation: reservation?.reservation || null,
        dispatch_allowed: false,
      };
    });
  }

  startExecution(input) {
    return this.#mutate(() => {
      const idempotencyKey = requiredString(input?.idempotency_key, 'idempotency_key');
      const duplicate = this.operationIdempotency.get(idempotencyKey);
      if (duplicate) {
        return {
          state: duplicate.state,
          lease: duplicate,
          duplicate: true,
          dispatch_allowed: duplicate.state === 'started',
        };
      }

      const leaseId = requiredString(input?.lease_id, 'lease_id');
      const current = this.latest.get(leaseId);
      if (!current) throw new Error('lease_not_found');
      if (current.state === 'started') {
        return { state: 'started', lease: current, duplicate: true, dispatch_allowed: true };
      }
      if (current.state !== 'prepared') throw new Error('lease_not_prepared');

      const startedAt = iso(input?.started_at || new Date().toISOString(), 'started_at');
      const startEvidenceRef = requiredString(
        input?.start_evidence_ref,
        'start_evidence_ref'
      );

      let permitConsumption;
      try {
        permitConsumption = this.passport.consumeActionPermit({
          idempotency_key: 'execution:' + leaseId + ':permit:consume',
          permit_id: current.permit_id,
          actor_ref: current.actor_ref,
          request_fingerprint: current.request_fingerprint,
          evidence_ref: startEvidenceRef,
          consumed_at: startedAt,
        });
      } catch (error) {
        const failed = this.#leaseEvent({
          leaseId,
          idempotencyKey,
          state: 'start_failed',
          base: current,
          at: startedAt,
          extra: {
            failure_stage: 'passport_permit_consume',
            failure_reason: String(error?.message || error),
            dispatch_allowed: false,
          },
        });
        return { state: 'start_failed', lease: failed, dispatch_allowed: false };
      }

      let meterCommit = null;
      if (current.meter_reservation_id) {
        try {
          meterCommit = this.meter.commitReservation({
            idempotency_key: 'execution:' + leaseId + ':meter:commit',
            reservation_id: current.meter_reservation_id,
            evidence_ref: startEvidenceRef,
            source: 'evercraft_execution_gate',
            occurred_at: startedAt,
          });
        } catch (error) {
          try {
            this.meter.releaseReservation({
              idempotency_key: 'execution:' + leaseId + ':meter:start-failed-release',
              reservation_id: current.meter_reservation_id,
              reason: 'execution_start_failed_after_permit_consume',
              released_at: startedAt,
            });
          } catch {}

          const failed = this.#leaseEvent({
            leaseId,
            idempotencyKey,
            state: 'start_failed',
            base: current,
            at: startedAt,
            extra: {
              failure_stage: 'meter_commit',
              failure_reason: String(error?.message || error),
              passport_permit_consumed: true,
              permit_consumption_receipt: permitConsumption.receipt.receipt_hash,
              dispatch_allowed: false,
            },
          });
          return { state: 'start_failed', lease: failed, dispatch_allowed: false };
        }
      }

      const started = this.#leaseEvent({
        leaseId,
        idempotencyKey,
        state: 'started',
        base: current,
        at: startedAt,
        extra: {
          start_evidence_ref: startEvidenceRef,
          permit_consumption_receipt: permitConsumption.receipt.receipt_hash,
          meter_commit_receipt: meterCommit?.receipt?.receipt_hash || null,
          usage_event_id: meterCommit?.usage_event?.usage_event_id || null,
          dispatch_allowed: true,
        },
      });

      return {
        state: 'started',
        lease: started,
        route: current.route,
        dispatch_allowed: true,
        dispatch_performed: false,
      };
    });
  }

  completeExecution(input) {
    return this.#mutate(() => {
      const idempotencyKey = requiredString(input?.idempotency_key, 'idempotency_key');
      const duplicate = this.operationIdempotency.get(idempotencyKey);
      if (duplicate) return { state: duplicate.state, lease: duplicate, duplicate: true };

      const leaseId = requiredString(input?.lease_id, 'lease_id');
      const current = this.latest.get(leaseId);
      if (!current) throw new Error('lease_not_found');
      if (current.state !== 'started') throw new Error('lease_not_started');

      const completedAt = iso(input?.completed_at || new Date().toISOString(), 'completed_at');
      const outcomeEvidenceRef = requiredString(
        input?.outcome_evidence_ref,
        'outcome_evidence_ref'
      );

      const completed = this.#leaseEvent({
        leaseId,
        idempotencyKey,
        state: 'completed',
        base: current,
        at: completedAt,
        extra: {
          start_evidence_ref: current.start_evidence_ref || null,
          outcome_evidence_ref: outcomeEvidenceRef,
          outcome_state: input?.outcome_state ? String(input.outcome_state) : 'completed',
          dispatch_allowed: false,
          execution_outcome_recorded: true,
        },
      });

      return { state: 'completed', lease: completed };
    });
  }

  cancelExecution(input) {
    return this.#mutate(() => {
      const idempotencyKey = requiredString(input?.idempotency_key, 'idempotency_key');
      const duplicate = this.operationIdempotency.get(idempotencyKey);
      if (duplicate) return { state: duplicate.state, lease: duplicate, duplicate: true };

      const leaseId = requiredString(input?.lease_id, 'lease_id');
      const current = this.latest.get(leaseId);
      if (!current) throw new Error('lease_not_found');
      if (current.state !== 'prepared') throw new Error('only_prepared_lease_can_cancel');

      const cancelledAt = iso(input?.cancelled_at || new Date().toISOString(), 'cancelled_at');
      const reason = input?.reason ? String(input.reason) : 'cancelled_before_execution';

      let meterRelease = null;
      if (current.meter_reservation_id) {
        meterRelease = this.meter.releaseReservation({
          idempotency_key: 'execution:' + leaseId + ':meter:release',
          reservation_id: current.meter_reservation_id,
          reason,
          released_at: cancelledAt,
        });
      }

      const permitCancellation = this.passport.cancelActionPermit({
        idempotency_key: 'execution:' + leaseId + ':permit:cancel',
        permit_id: current.permit_id,
        actor_ref: current.actor_ref,
        reason,
        cancelled_at: cancelledAt,
      });

      const cancelled = this.#leaseEvent({
        leaseId,
        idempotencyKey,
        state: 'cancelled',
        base: current,
        at: cancelledAt,
        extra: {
          cancel_reason: reason,
          meter_release_receipt: meterRelease?.receipt?.receipt_hash || null,
          permit_cancellation_receipt: permitCancellation.receipt.receipt_hash,
          dispatch_allowed: false,
        },
      });

      return { state: 'cancelled', lease: cancelled, dispatch_allowed: false };
    });
  }
}

export { requestFingerprint };
