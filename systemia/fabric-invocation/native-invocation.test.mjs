import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { LineageStore } from '../lineage/core.mjs';
import { createGoalState, admitGoalPlan, startGoalWork, recordGoalOutcome } from '../organism/goal-runtime.mjs';
import { FabricNativeInvocation } from './native-invocation.mjs';

const sha = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const proof = (text) => 'sha256:' + sha(text);
const missionKey = 'mission:fabric-browser-qa';
const capabilityKey = 'evercraft.web.browser.public.v1';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-fabric-native-'));
  const stateDir = path.join(root, 'fabric-journal');
  const lineageRoot = path.join(root, 'lineage');
  let goal = createGoalState({
    goalKey: 'fabric-browser-qa', missionKey,
    objective: 'Public read-only browser conformance',
  });
  goal = admitGoalPlan({
    state: goal,
    plan: [{ work_key: 'browser-read', work_type: 'browser_read', human_gate_required: false }],
  });
  let permitted = true;
  let admissionHook = async () => {};
  let dispatchCount = 0;
  let disposition = 'ok';
  let ackUnavailable = false;
  let authorityExpiresAt = Date.now() + 60000;
  const coordinator = new FabricNativeInvocation({
    stateDir, lineageRoot, timeoutMs: 20,
    missionLoader: async (key) => {
      await admissionHook();
      return {
        state: key === missionKey ? goal : null,
        admission_verified: true,
        admission_receipt_hash: proof('admitted:systemia'),
        allowed_capabilities: [capabilityKey],
      };
    },
    authorizationVerifier: async ({ actor_ref, tenant_key, capability_key }) => ({
      decision: permitted ? 'allow' : 'deny',
      receipt_hash: proof('passport:verified'),
      actor_ref, tenant_key, capability_key,
      expires_at: new Date(authorityExpiresAt).toISOString(),
    }),
    workerInvoker: async ({ capability_key, payload, correlation_id }) => {
      dispatchCount++;
      if (disposition === 'offline') throw new Error('private_browser_worker_unavailable');
      if (disposition === 'hang') return new Promise(() => {});
      if (disposition === 'forged') return { ok: true, evidence_receipt_sha256: '0'.repeat(64), target: 'forged' };
      return {
        ok: true, engine: 'evercraft-owned-browser-worker-v1',
        evidence_receipt_sha256: sha({ capability_key, payload, correlation_id }),
      };
    },
    workerReceiptVerifier: async ({ capability_key, correlation_id, worker_receipt }) =>
      worker_receipt.engine === 'evercraft-owned-browser-worker-v1' &&
      worker_receipt.evidence_receipt_sha256 === sha({
        capability_key, payload: { url: 'https://example.org/' }, correlation_id,
      }),
    missionOutcomeWriter: async ({ mission_key, work_key, correlation_id, lineage_receipt_id, worker_receipt_digest }) => {
      if (ackUnavailable) throw new Error('systemia_outcome_writer_unavailable');
      const started = startGoalWork({ state: goal, workKey: work_key });
      goal = recordGoalOutcome({
        state: started, workKey: work_key, result: 'complete',
        receiptRef: lineage_receipt_id, evidenceRefs: [worker_receipt_digest],
      });
      return {
        state: 'recorded', mission_key, work_key, correlation_id,
        lineage_receipt_id, receipt_hash: proof('systemia:ack:' + correlation_id),
      };
    },
  });
  const input = {
    actor_ref: 'agent:browser-qa', tenant_key: 'tenant:evercraft',
    mission_key: missionKey, work_key: 'browser-read',
    capability_key: capabilityKey, idempotency_key: 'fabric:qa:001',
    payload: { url: 'https://example.org/' },
  };
  return {
    root, lineageRoot, stateDir, coordinator, input,
    dispatchCount: () => dispatchCount,
    deny: () => { permitted = false; },
    setAdmissionHook: (fn) => { admissionHook = fn; },
    setWorker: (next) => { disposition = next; },
    setAckUnavailable: (next) => { ackUnavailable = next; },
    expireCredential: () => { authorityExpiresAt = Date.now() - 1000; },
    nearExpireCredential: () => { authorityExpiresAt = Date.now() + 500; },
    goalState: () => goal,
    close: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

test('Systemia admission + delegated Passport authority + worker receipt -> native Lineage transaction', async () => {
  const f = fixture();
  try {
    await new LineageStore(f.lineageRoot).init();
    const result = await f.coordinator.invoke(f.input);
    assert.equal(result.state, 'completed');
    assert.equal(result.worker_outcome_verified, true);
    assert.equal(result.systemia_outcome_acknowledged, true);
    assert.equal(result.external_delivery_verified, false);
    assert.match(result.worker_receipt_digest, /^sha256:[a-f0-9]{64}$/);
    assert.ok(result.lineage_transaction_id);
    assert.ok(result.lineage_receipt_id);
    const store = new LineageStore(f.lineageRoot);
    const tx = await store.readObject(result.lineage_transaction_id);
    const receipt = await store.readObject(result.lineage_receipt_id);
    assert.equal(tx.type, 'transaction');
    assert.equal(receipt.type, 'receipt');
    assert.equal(tx.payload.kind, 'fabric.capability.invocation');
    assert.equal(tx.payload.authority.payment, false);
    assert.equal(f.dispatchCount(), 1);

    const duplicate = await f.coordinator.invoke(f.input);
    assert.equal(duplicate.state, 'completed');
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.lineage_receipt_id, result.lineage_receipt_id);
    assert.equal(f.dispatchCount(), 1);
    const journal = fs.readdirSync(f.stateDir).find((name) => name.endsWith('.jsonl'));
    const entries = fs.readFileSync(path.join(f.stateDir, journal), 'utf8');
    assert.equal(entries.trim().split('\n').length, 5);
    assert.equal(f.goalState().tasks[0].status, 'complete');
    assert.equal(entries.includes('https://example.org'), false);
  } finally { f.close(); }
});

test('cross-tenant or payload idempotency collisions fail closed and expired authorization cannot replay', async () => {
  const f = fixture();
  try {
    await new LineageStore(f.lineageRoot).init();
    await f.coordinator.invoke(f.input);
    await assert.rejects(
      f.coordinator.invoke({ ...f.input, tenant_key: 'tenant:intruder' }),
      /fabric_idempotency_binding_conflict/
    );
    await assert.rejects(
      f.coordinator.invoke({ ...f.input, payload: { url: 'https://different.example/' } }),
      /fabric_idempotency_binding_conflict/
    );
    f.deny();
    await assert.rejects(f.coordinator.invoke(f.input), /fabric_authorization_denied/);
    assert.equal(f.dispatchCount(), 1);
  } finally { f.close(); }
});

test('worker offline and timeout are outcome_unknown without automatic retry', async () => {
  for (const failure of ['offline', 'hang', 'forged']) {
    const f = fixture();
    try {
      await new LineageStore(f.lineageRoot).init();
      f.setWorker(failure);
      const first = await f.coordinator.invoke(f.input);
      assert.equal(first.state, 'outcome_unknown', failure);
      const second = await f.coordinator.invoke(f.input);
      assert.equal(second.state, 'outcome_unknown', failure);
      assert.equal(second.duplicate, true);
      assert.equal(f.dispatchCount(), 1);
      assert.equal(first.lineage_receipt_id, null);
    } finally { f.close(); }
  }
});

test('Lineage outage holds successful worker outcome instead of claiming completed evidence', async () => {
  const f = fixture();
  try {
    const result = await f.coordinator.invoke(f.input);
    assert.equal(result.state, 'evidence_pending');
    assert.ok(result.worker_receipt_digest);
    assert.equal(result.lineage_receipt_id, null);
    assert.equal((await f.coordinator.invoke(f.input)).duplicate, true);
    assert.equal(f.dispatchCount(), 1);
  } finally { f.close(); }
});

test('journal tampering, forged mission and missing authority function fail closed', async () => {
  const f = fixture();
  try {
    await new LineageStore(f.lineageRoot).init();
    await f.coordinator.invoke(f.input);
    const journal = fs.readdirSync(f.stateDir).find((name) => name.endsWith('.jsonl'));
    const file = path.join(f.stateDir, journal);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('"state":"completed"', '"state":"cancelled"'));
    await assert.rejects(f.coordinator.invoke(f.input), /fabric_invocation_journal_integrity_failed/);
    await assert.rejects(f.coordinator.invoke({
      ...f.input, idempotency_key: 'new:fabric:key', mission_key: 'mission:forged',
    }), /fabric_systemia_admission_not_verified/);
    assert.throws(() => new FabricNativeInvocation({
      stateDir: f.stateDir, lineageRoot: f.lineageRoot,
    }), /fabric_missionLoader_required/);
  } finally { f.close(); }
});

test('interrupted dispatch is not retried automatically and lock contention fails closed', async () => {
  const f = fixture();
  try {
    await new LineageStore(f.lineageRoot).init();
    await f.coordinator.invoke(f.input);
    const journal = fs.readdirSync(f.stateDir).find((name) => name.endsWith('.jsonl'));
    const file = path.join(f.stateDir, journal);
    // A durable worker checkpoint with no acknowledgment is an unknown outcome;
    // do not assume it is safe to repeat an external browser action.
    const entries = fs.readFileSync(file, 'utf8').trim().split('\n');
    fs.writeFileSync(file, entries.slice(0, 2).join('\n') + '\n');
    const recovered = await f.coordinator.invoke(f.input);
    assert.equal(recovered.state, 'outcome_unknown');
    assert.equal(recovered.duplicate, true);
    assert.equal(f.dispatchCount(), 1);
    const lock = file.replace(/\.jsonl$/, '.lock');
    fs.mkdirSync(lock);
    await assert.rejects(f.coordinator.invoke(f.input), /fabric_invocation_busy_or_interrupted/);
  } finally { f.close(); }
});


test('Systemia outcome failure holds durable Lineage evidence without claiming mission completion', async () => {
  const f = fixture();
  try {
    await new LineageStore(f.lineageRoot).init();
    f.setAckUnavailable(true);
    const result = await f.coordinator.invoke(f.input);
    assert.equal(result.state, 'systemia_ack_pending');
    assert.ok(result.lineage_receipt_id);
    assert.notEqual(f.goalState().tasks[0].status, 'complete');
    const duplicate = await f.coordinator.invoke(f.input);
    assert.equal(duplicate.state, 'systemia_ack_pending');
    assert.equal(duplicate.duplicate, true);
    assert.equal(f.dispatchCount(), 1);
  } finally { f.close(); }
});

test('expired and near-expiring credentials deny execution before worker dispatch', async () => {
  for (const expiry of ['expireCredential', 'nearExpireCredential']) {
    const f = fixture();
    try {
      await new LineageStore(f.lineageRoot).init();
      f[expiry]();
      await assert.rejects(f.coordinator.invoke(f.input), /fabric_authorization_denied_or_expiring/);
      assert.equal(f.dispatchCount(), 0);
      assert.equal(fs.readdirSync(f.stateDir).filter((name) => name.endsWith('.jsonl')).length, 0);
    } finally { f.close(); }
  }
});


test('explicit recovery reconciles a Lineage-backed Systemia acknowledgment without redispatch', async () => {
  const f = fixture();
  try {
    await new LineageStore(f.lineageRoot).init();
    f.setAckUnavailable(true);
    const pending = await f.coordinator.invoke(f.input);
    assert.equal(pending.state, 'systemia_ack_pending');
    assert.equal(f.dispatchCount(), 1);
    const unavailable = await f.coordinator.reconcileSystemiaOutcome(f.input);
    assert.equal(unavailable.reconciled, false);
    assert.equal(unavailable.state, 'systemia_ack_pending');
    assert.equal(f.dispatchCount(), 1);
    f.setAckUnavailable(false);
    const recovered = await f.coordinator.reconcileSystemiaOutcome(f.input);
    assert.equal(recovered.state, 'completed');
    assert.equal(recovered.reconciled, true);
    assert.equal(recovered.systemia_outcome_acknowledged, true);
    assert.equal(recovered.lineage_receipt_id, pending.lineage_receipt_id);
    assert.equal(f.goalState().tasks[0].status, 'complete');
    assert.equal(f.dispatchCount(), 1);
    const second = await f.coordinator.reconcileSystemiaOutcome(f.input);
    assert.equal(second.reconciled, false);
    assert.equal(second.duplicate, true);
    assert.equal(f.dispatchCount(), 1);
  } finally { f.close(); }
});

test('reconciliation enforces fresh authorization and original tenant and request binding', async () => {
  const f = fixture();
  try {
    await new LineageStore(f.lineageRoot).init();
    f.setAckUnavailable(true);
    await f.coordinator.invoke(f.input);
    await assert.rejects(
      f.coordinator.reconcileSystemiaOutcome({
        ...f.input, tenant_key: 'tenant:other',
      }),
      /fabric_idempotency_binding_conflict/,
    );
    await assert.rejects(
      f.coordinator.reconcileSystemiaOutcome({
        ...f.input, payload: { url: 'https://different.example.org/' },
      }),
      /fabric_idempotency_binding_conflict/,
    );
    f.expireCredential();
    await assert.rejects(
      f.coordinator.reconcileSystemiaOutcome(f.input),
      /fabric_authorization_denied_or_expiring/,
    );
    assert.equal(f.dispatchCount(), 1);
  } finally { f.close(); }
});

test('reconciliation fails closed if native Lineage evidence has been removed', async () => {
  const f = fixture();
  try {
    await new LineageStore(f.lineageRoot).init();
    f.setAckUnavailable(true);
    const pending = await f.coordinator.invoke(f.input);
    assert.equal(pending.state, 'systemia_ack_pending');
    f.setAckUnavailable(false);
    fs.rmSync(path.join(f.lineageRoot, '.lineage'), { recursive: true, force: true });
    await assert.rejects(f.coordinator.reconcileSystemiaOutcome(f.input));
    assert.equal(f.goalState().tasks[0].status, 'pending');
    assert.equal(f.dispatchCount(), 1);
  } finally { f.close(); }
});

test('reconciliation cannot rerun a worker with unknown outcome or create a new invocation', async () => {
  const f = fixture();
  try {
    await new LineageStore(f.lineageRoot).init();
    f.setWorker('hang');
    const unknown = await f.coordinator.invoke(f.input);
    assert.equal(unknown.state, 'outcome_unknown');
    const reconciled = await f.coordinator.reconcileSystemiaOutcome(f.input);
    assert.equal(reconciled.state, 'outcome_unknown');
    assert.equal(reconciled.reconciled, false);
    assert.equal(f.dispatchCount(), 1);
    await assert.rejects(
      f.coordinator.reconcileSystemiaOutcome({ ...f.input, idempotency_key: 'missing:key' }),
      /fabric_reconcile_invocation_not_found/,
    );
  } finally { f.close(); }
});


test('revoking identity authority during Systemia admission denies before dispatch journal or worker', async () => {
  const f = fixture();
  try {
    await new LineageStore(f.lineageRoot).init();
    f.setAdmissionHook(async () => f.deny());
    await assert.rejects(
      f.coordinator.invoke(f.input),
      /fabric_authorization_denied_or_expiring/,
    );
    assert.equal(f.dispatchCount(), 0);
    assert.equal(fs.readdirSync(f.stateDir).filter((name) => name.endsWith('.jsonl')).length, 0);
  } finally { f.close(); }
});

test('credential expiry during mission loading denies without creating a dispatch record', async () => {
  const f = fixture();
  try {
    await new LineageStore(f.lineageRoot).init();
    f.setAdmissionHook(async () => f.expireCredential());
    await assert.rejects(
      f.coordinator.invoke(f.input),
      /fabric_authorization_denied_or_expiring/,
    );
    assert.equal(f.dispatchCount(), 0);
    assert.equal(fs.readdirSync(f.stateDir).filter((name) => name.endsWith('.jsonl')).length, 0);
  } finally { f.close(); }
});
