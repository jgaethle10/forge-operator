import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { LineageStore } from '../lineage/core.mjs';

const digest = (value) => 'sha256:' + createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const IDENTIFIER = /^[a-zA-Z0-9._:@/-]{1,180}$/;
const RECEIPT = /^sha256:[a-f0-9]{64}$/i;
const WORKER_DIGEST = /^[a-f0-9]{64}$/i;
const MAX_PAYLOAD = 64 * 1024;

function required(value, label) {
  const text = String(value ?? '').trim();
  if (!IDENTIFIER.test(text)) throw new Error('fabric_' + label + '_invalid');
  return text;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}
function verifyEvent(event, previous, index) {
  const { receipt_hash, ...body } = event;
  if (event.schema !== 'evercraft.fabric.invocation-event.v1' ||
      event.sequence !== index + 1 || event.previous_hash !== (previous?.receipt_hash || null) ||
      receipt_hash !== digest(canonical(body))) {
    throw new Error('fabric_invocation_journal_integrity_failed');
  }
  return event;
}
function readEvents(file) {
  if (!fs.existsSync(file)) return [];
  const source = fs.readFileSync(file, 'utf8');
  if (source && !source.endsWith('\n')) throw new Error('fabric_invocation_journal_truncated');
  const rows = source.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  rows.forEach((row, i) => verifyEvent(row, rows[i - 1], i));
  return rows;
}
function appendEvent(file, events, state, detail, now) {
  const body = {
    schema: 'evercraft.fabric.invocation-event.v1',
    sequence: events.length + 1,
    previous_hash: events.at(-1)?.receipt_hash || null,
    state,
    detail,
    recorded_at: now().toISOString(),
  };
  const event = { ...body, receipt_hash: digest(canonical(body)) };
  const fd = fs.openSync(file, 'a', 0o600);
  try {
    fs.writeSync(fd, JSON.stringify(event) + '\n');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  return event;
}
function resultFromEvents(events, duplicate = false) {
  const last = events.at(-1);
  if (!last) return null;
  return {
    state: last.state === 'dispatching' ? 'outcome_unknown' : last.state,
    duplicate,
    correlation_id: events[0].detail.correlation_id,
    mission_key: events[0].detail.mission_key,
    work_key: events[0].detail.work_key,
    capability_key: events[0].detail.capability_key,
    event_receipt_hash: last.receipt_hash,
    worker_receipt_digest: last.detail.worker_receipt_digest || null,
    lineage_transaction_id: last.detail.lineage_transaction_id || null,
    lineage_receipt_id: last.detail.lineage_receipt_id || null,
    worker_outcome_verified: ['worker_acknowledged', 'lineage_recorded', 'completed', 'evidence_pending', 'systemia_ack_pending'].includes(last.state),
    systemia_outcome_acknowledged: last.state === 'completed',
    external_delivery_verified: false,
  };
}

/**
 * Private-only invocation coordinator. The public MCP catalog must not mount
 * this directly. Its trusted functions must be supplied by a private Systemia
 * authority boundary; request body claims never count as permission.
 */
export class FabricNativeInvocation {
  constructor({
    stateDir, missionLoader, authorizationVerifier, workerInvoker,
    workerReceiptVerifier, missionOutcomeWriter, lineageRoot, now = () => new Date(),
    timeoutMs = 5000, maxPayloadBytes = MAX_PAYLOAD,
  } = {}) {
    if (!stateDir || !lineageRoot) throw new Error('fabric_private_storage_required');
    for (const [label, fn] of Object.entries({
      missionLoader, authorizationVerifier, workerInvoker, workerReceiptVerifier, missionOutcomeWriter,
    })) {
      if (typeof fn !== 'function') throw new Error('fabric_' + label + '_required');
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 30000) {
      throw new Error('fabric_timeout_invalid');
    }
    this.stateDir = path.resolve(stateDir);
    this.lineageRoot = path.resolve(lineageRoot);
    this.missionLoader = missionLoader;
    this.authorizationVerifier = authorizationVerifier;
    this.workerInvoker = workerInvoker;
    this.workerReceiptVerifier = workerReceiptVerifier;
    this.missionOutcomeWriter = missionOutcomeWriter;
    this.now = now;
    this.timeoutMs = timeoutMs;
    this.maxPayloadBytes = Math.min(MAX_PAYLOAD, maxPayloadBytes);
  }

  async invoke(input = {}) {
    const actor = required(input.actor_ref, 'actor_ref');
    const tenant = required(input.tenant_key, 'tenant_key');
    const mission = required(input.mission_key, 'mission_key');
    const work = required(input.work_key, 'work_key');
    const capability = required(input.capability_key, 'capability_key');
    const idempotency = required(input.idempotency_key, 'idempotency_key');
    const payloadText = JSON.stringify(input.payload ?? null);
    if (Buffer.byteLength(payloadText) > this.maxPayloadBytes) {
      throw new Error('fabric_payload_too_large');
    }
    const binding = digest(canonical({
      actor, tenant, mission, work, capability, payload: input.payload ?? null,
    }));
    const pathKey = digest(idempotency).slice(7);
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    const file = path.join(this.stateDir, pathKey + '.jsonl');
    const lock = path.join(this.stateDir, pathKey + '.lock');
    try { fs.mkdirSync(lock, { mode: 0o700 }); }
    catch (error) {
      if (error.code === 'EEXIST') throw new Error('fabric_invocation_busy_or_interrupted');
      throw error;
    }
    try {
      // Authenticate every request, even a duplicate status read. A replay
      // must not turn an expired or revoked credential into a read grant.
      const verifyAuthority = async () => {
        const decision = await this.authorizationVerifier({
          actor_ref: actor, tenant_key: tenant, capability_key: capability,
          mission_key: mission, work_key: work,
        });
        const expiry = Date.parse(String(decision?.expires_at || ''));
        if (decision?.decision !== 'allow' ||
            !RECEIPT.test(String(decision.receipt_hash || '')) ||
            decision.actor_ref !== actor || decision.tenant_key !== tenant ||
            decision.capability_key !== capability ||
            (decision.resource_ref != null && decision.resource_ref !== mission) ||
            !Number.isFinite(expiry) ||
            expiry <= this.now().getTime() + this.timeoutMs + 1000) {
          throw new Error('fabric_authorization_denied_or_expiring');
        }
        return decision;
      };
      let auth = await verifyAuthority();
      const events = readEvents(file);
      if (events.length) {
        if (events[0].detail.binding_hash !== binding) {
          throw new Error('fabric_idempotency_binding_conflict');
        }
        return resultFromEvents(events, true);
      }

      const loaded = await this.missionLoader(mission);
      const state = loaded?.state;
      const task = state?.tasks?.find((item) => item.work_key === work);
      if (state?.schema !== 'evercraft.goal.state.v1' ||
          state.mission_key !== mission ||
          !state.next_work_keys?.includes(work) || !task ||
          task.human_gate_unresolved === true ||
          loaded?.admission_verified !== true ||
          !RECEIPT.test(String(loaded.admission_receipt_hash || '')) ||
          !Array.isArray(loaded.allowed_capabilities) ||
          !loaded.allowed_capabilities.includes(capability)) {
        throw new Error('fabric_systemia_admission_not_verified');
      }
      // Mission admission can require I/O. Passport grants or signed sessions
      // may be revoked or expire during that wait, so re-check immediately
      // before the durable dispatch decision. A denied refresh writes no job.
      auth = await verifyAuthority();
      const correlation = digest(tenant + ':' + mission + ':' + work + ':' + idempotency);
      const initial = {
        binding_hash: binding, correlation_id: correlation,
        mission_key: mission, work_key: work, capability_key: capability,
        actor_ref: actor, tenant_key: tenant,
        authorization_receipt_hash: auth.receipt_hash,
        admission_receipt_hash: loaded.admission_receipt_hash,
        request_digest: digest(canonical(input.payload ?? null)),
        raw_payload_stored: false, external_action_authority_inferred: false,
      };
      let record = appendEvent(file, events, 'admitted', initial, this.now);
      events.push(record);
      record = appendEvent(file, events, 'dispatching', {
        correlation_id: correlation, worker_target: capability,
        deadline_ms: this.timeoutMs, dispatch_attempt: 1,
      }, this.now);
      events.push(record);

      let worker;
      const controller = new AbortController();
      let timer;
      try {
        worker = await Promise.race([
          Promise.resolve().then(() => this.workerInvoker({
            capability_key: capability, payload: structuredClone(input.payload ?? null),
            correlation_id: correlation, signal: controller.signal,
            deadline_ms: this.timeoutMs,
          })),
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(new Error('fabric_worker_timeout'));
            }, this.timeoutMs);
          }),
        ]);
        if (worker?.ok !== true ||
            !WORKER_DIGEST.test(String(worker.evidence_receipt_sha256 || '')) ||
            await this.workerReceiptVerifier({
              capability_key: capability, correlation_id: correlation, worker_receipt: worker,
            }) !== true) {
          throw new Error('fabric_worker_receipt_unverified');
        }
      } catch (error) {
        record = appendEvent(file, events, 'outcome_unknown', {
          correlation_id: correlation,
          failure_code: error?.message === 'fabric_worker_timeout'
            ? 'worker_timeout' : 'worker_unavailable_or_unverified',
          automatic_retry_permitted: false,
        }, this.now);
        events.push(record);
        return resultFromEvents(events);
      } finally {
        clearTimeout(timer);
      }

      const workerHash = 'sha256:' + worker.evidence_receipt_sha256.toLowerCase();
      record = appendEvent(file, events, 'worker_acknowledged', {
        correlation_id: correlation, worker_receipt_digest: workerHash,
        untrusted_worker_content_is_not_instruction: true,
      }, this.now);
      events.push(record);

      let transaction;
      try {
        const lineage = new LineageStore(this.lineageRoot);
        transaction = await lineage.recordTransaction({
          kind: 'fabric.capability.invocation',
          actor: { type: 'agent', id: actor },
          scope: capability,
          inputs: [{ mission_key: mission, work_key: work, request_digest: initial.request_digest }],
          outputs: [{ worker_receipt_digest: workerHash }],
          evidence: [auth.receipt_hash, loaded.admission_receipt_hash, workerHash],
          authority: { mutation: false, publish: false, payment: false },
        });
        const [object, receipt] = await Promise.all([
          lineage.readObject(transaction.transaction_id),
          lineage.readObject(transaction.receipt_id),
        ]);
        if (object?.type !== 'transaction' || receipt?.type !== 'receipt' ||
            receipt.payload?.operation !== 'transaction' ||
            receipt.payload?.transaction_id !== transaction.transaction_id) {
          throw new Error('fabric_lineage_evidence_unverified');
        }
        record = appendEvent(file, events, 'lineage_recorded', {
          correlation_id: correlation, worker_receipt_digest: workerHash,
          lineage_transaction_id: transaction.transaction_id,
          lineage_receipt_id: transaction.receipt_id,
        }, this.now);
        events.push(record);
      } catch {
        record = appendEvent(file, events, 'evidence_pending', {
          correlation_id: correlation, worker_receipt_digest: workerHash,
          automatic_retry_permitted: false,
        }, this.now);
        events.push(record);
        return resultFromEvents(events);
      }

      try {
        const acknowledged = await this.missionOutcomeWriter({
          mission_key: mission, work_key: work,
          capability_key: capability, correlation_id: correlation,
          lineage_transaction_id: transaction.transaction_id,
          lineage_receipt_id: transaction.receipt_id,
          worker_receipt_digest: workerHash,
        });
        if (acknowledged?.state !== 'recorded' ||
            acknowledged.mission_key !== mission ||
            acknowledged.work_key !== work ||
            acknowledged.correlation_id !== correlation ||
            acknowledged.lineage_receipt_id !== transaction.receipt_id ||
            !RECEIPT.test(String(acknowledged.receipt_hash || ''))) {
          throw new Error('fabric_systemia_outcome_ack_unverified');
        }
        record = appendEvent(file, events, 'completed', {
          correlation_id: correlation, worker_receipt_digest: workerHash,
          lineage_transaction_id: transaction.transaction_id,
          lineage_receipt_id: transaction.receipt_id,
          systemia_outcome_receipt_hash: acknowledged.receipt_hash,
          external_delivery_verified: false,
        }, this.now);
        events.push(record);
      } catch {
        record = appendEvent(file, events, 'systemia_ack_pending', {
          correlation_id: correlation, worker_receipt_digest: workerHash,
          lineage_transaction_id: transaction.transaction_id,
          lineage_receipt_id: transaction.receipt_id,
          automatic_retry_permitted: false,
        }, this.now);
        events.push(record);
      }
      return resultFromEvents(events);
    } finally {
      fs.rmSync(lock, { recursive: true, force: true });
    }
  }

  /**
   * Explicit recovery of a durable, already verified Lineage result whose
   * Systemia acknowledgment has not been durably observed. Never dispatches
   * a worker. missionOutcomeWriter MUST implement correlation-idempotent
   * acknowledgment and return a freshly verified receipt on replay.
   */
  async reconcileSystemiaOutcome(input = {}) {
    const actor = required(input.actor_ref, 'actor_ref');
    const tenant = required(input.tenant_key, 'tenant_key');
    const mission = required(input.mission_key, 'mission_key');
    const work = required(input.work_key, 'work_key');
    const capability = required(input.capability_key, 'capability_key');
    const idempotency = required(input.idempotency_key, 'idempotency_key');
    const payloadText = JSON.stringify(input.payload ?? null);
    if (Buffer.byteLength(payloadText) > this.maxPayloadBytes) throw new Error('fabric_payload_too_large');
    const binding = digest(canonical({
      actor, tenant, mission, work, capability, payload: input.payload ?? null,
    }));
    const file = path.join(this.stateDir, digest(idempotency).slice(7) + '.jsonl');
    const lock = path.join(this.stateDir, digest(idempotency).slice(7) + '.lock');
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    try { fs.mkdirSync(lock, { mode: 0o700 }); }
    catch (error) {
      if (error.code === 'EEXIST') throw new Error('fabric_invocation_busy_or_interrupted');
      throw error;
    }
    try {
      const auth = await this.authorizationVerifier({
        actor_ref: actor, tenant_key: tenant, capability_key: capability,
        mission_key: mission, work_key: work,
      });
      const expiry = Date.parse(String(auth?.expires_at || ''));
      if (auth?.decision !== 'allow' || !RECEIPT.test(String(auth.receipt_hash || '')) ||
          auth.actor_ref !== actor || auth.tenant_key !== tenant ||
          auth.capability_key !== capability || !Number.isFinite(expiry) ||
          expiry <= this.now().getTime() + this.timeoutMs + 1000) {
        throw new Error('fabric_authorization_denied_or_expiring');
      }
      const events = readEvents(file);
      if (!events.length) throw new Error('fabric_reconcile_invocation_not_found');
      if (events[0].detail.binding_hash !== binding) {
        throw new Error('fabric_idempotency_binding_conflict');
      }
      const latest = events.at(-1);
      if (!['lineage_recorded', 'systemia_ack_pending'].includes(latest.state)) {
        return { ...resultFromEvents(events, true), reconciled: false };
      }
      const { lineage_transaction_id: transactionId, lineage_receipt_id: receiptId,
        worker_receipt_digest: workerHash, correlation_id: correlation } = latest.detail;
      const lineage = new LineageStore(this.lineageRoot);
      const [tx, txReceipt] = await Promise.all([
        lineage.readObject(transactionId), lineage.readObject(receiptId),
      ]);
      if (tx?.type !== 'transaction' || txReceipt?.type !== 'receipt' ||
          txReceipt.payload?.operation !== 'transaction' ||
          txReceipt.payload?.transaction_id !== transactionId ||
          tx.payload?.kind !== 'fabric.capability.invocation' ||
          tx.payload?.actor?.id !== actor || tx.payload?.scope !== capability ||
          tx.payload?.inputs?.[0]?.mission_key !== mission ||
          tx.payload?.inputs?.[0]?.work_key !== work ||
          tx.payload?.inputs?.[0]?.request_digest !== events[0].detail.request_digest ||
          tx.payload?.outputs?.[0]?.worker_receipt_digest !== workerHash ||
          correlation !== events[0].detail.correlation_id ||
          !RECEIPT.test(String(workerHash || ''))) {
        throw new Error('fabric_reconcile_lineage_binding_invalid');
      }
      let acknowledgment;
      try {
        acknowledgment = await this.missionOutcomeWriter({
          mission_key: mission, work_key: work,
          capability_key: capability, correlation_id: correlation,
          lineage_transaction_id: transactionId,
          lineage_receipt_id: receiptId, worker_receipt_digest: workerHash,
        });
      } catch {
        return { ...resultFromEvents(events, true), reconciled: false };
      }
      if (acknowledgment?.state !== 'recorded' ||
          acknowledgment.mission_key !== mission ||
          acknowledgment.work_key !== work ||
          acknowledgment.correlation_id !== correlation ||
          acknowledgment.lineage_receipt_id !== receiptId ||
          !RECEIPT.test(String(acknowledgment.receipt_hash || ''))) {
        throw new Error('fabric_reconcile_systemia_ack_invalid');
      }
      const completed = appendEvent(file, events, 'completed', {
        correlation_id: correlation, worker_receipt_digest: workerHash,
        lineage_transaction_id: transactionId, lineage_receipt_id: receiptId,
        systemia_outcome_receipt_hash: acknowledgment.receipt_hash,
        reconciliation_without_worker_dispatch: true,
        external_delivery_verified: false,
      }, this.now);
      events.push(completed);
      return { ...resultFromEvents(events), reconciled: true };
    } finally {
      fs.rmSync(lock, { recursive: true, force: true });
    }
  }

}
