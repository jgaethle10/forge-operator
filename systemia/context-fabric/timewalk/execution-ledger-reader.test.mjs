import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { EvercraftPassport } from '../../passport/passport.mjs';
import { EvercraftContextReceiptBridge } from '../receipt-bridge.mjs';
import { reconcileTimewalkSourceReceipts } from './source-reconciliation.mjs';
import { createExecutionGateLedgerReceiptReader } from './execution-ledger-reader.mjs';

const sha = (body) => 'sha256:' + createHash('sha256')
  .update(JSON.stringify(body)).digest('hex');
const seal = (body) => ({ ...body, receipt_hash: sha(body) });
const schema = 'evercraft.execution-gate.lease-event.v1';

function syntheticEvent(id = 'lease-1', overrides = {}) {
  return seal({
    schema,
    lease_id: id,
    idempotency_key: 'test:' + id,
    state: 'completed',
    actor_ref: 'agent:worker',
    passport_product: 'rivet',
    specialist_slug: 'aliev',
    route: { route: { mode: 'direct_specialist' } },
    outcome_state: 'ready',
    outcome_evidence_ref: 'fixture:outcome:' + id,
    recorded_at: new Date(Date.now() - 60000).toISOString(),
    ...overrides,
  });
}
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-timewalk-ledger-'));
  const dir = path.join(root, 'execution');
  fs.mkdirSync(dir, { mode: 0o700 });
  return { root, dir, file: path.join(dir, 'execution-lease-events.jsonl') };
}
function write(file, events) {
  fs.writeFileSync(file, events.map((e) => JSON.stringify(e)).join('\n') + '\n',
    { mode: 0o600 });
}

test('reads only exact Execution Gate receipts from one fixed private ledger', () => {
  const { root, dir, file } = setup();
  try {
    const original = syntheticEvent();
    write(file, [original]);
    const reader = createExecutionGateLedgerReceiptReader({ state_dir: dir });
    assert.deepEqual(reader({
      source_receipt_schema: schema,
      source_receipt_hash: original.receipt_hash,
    }), original);
    assert.equal(reader({ source_receipt_schema: 'payment.receipt.v1',
      source_receipt_hash: original.receipt_hash }), null);
    assert.equal(reader({ source_receipt_schema: schema,
      source_receipt_hash: '../../../../../etc/passwd' }), null);
    assert.equal(reader({ source_receipt_schema: schema,
      source_receipt_hash: 'sha256:' + 'f'.repeat(64) }), null);
    assert.deepEqual(fs.readFileSync(file, 'utf8').split('\n').filter(Boolean),
      [JSON.stringify(original)]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('invalid or tampered events fail closed without returning partial matches', () => {
  const { root, dir, file } = setup();
  try {
    const valid = syntheticEvent();
    write(file, [valid, { ...syntheticEvent('second'), outcome_state: 'forged' }]);
    const reader = createExecutionGateLedgerReceiptReader({ state_dir: dir });
    assert.throws(() => reader({
      source_receipt_schema: schema,
      source_receipt_hash: valid.receipt_hash,
    }), /timewalk_execution_ledger_receipt_integrity_failure/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('duplicate source hashes, corrupt JSONL and partial last lines fail closed', () => {
  const { root, dir, file } = setup();
  try {
    const event = syntheticEvent();
    write(file, [event, event]);
    assert.throws(() => createExecutionGateLedgerReceiptReader({ state_dir: dir })({
      source_receipt_schema: schema, source_receipt_hash: event.receipt_hash,
    }), /duplicate_receipt_hash/);
    fs.writeFileSync(file, JSON.stringify(event)); // missing final newline
    assert.throws(() => createExecutionGateLedgerReceiptReader({ state_dir: dir })({
      source_receipt_schema: schema, source_receipt_hash: event.receipt_hash,
    }), /inconsistent_snapshot/);
    fs.writeFileSync(file, '{incomplete}\n');
    assert.throws(() => createExecutionGateLedgerReceiptReader({ state_dir: dir })({
      source_receipt_schema: schema, source_receipt_hash: event.receipt_hash,
    }), /invalid_json/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('size/event caps and private-mode requirement are enforced', () => {
  const { root, dir, file } = setup();
  try {
    const event = syntheticEvent();
    write(file, [event, syntheticEvent('second')]);
    assert.throws(() => createExecutionGateLedgerReceiptReader({
      state_dir: dir, max_events: 1,
    })({ source_receipt_schema: schema, source_receipt_hash: event.receipt_hash }),
    /event_limit/);
    assert.throws(() => createExecutionGateLedgerReceiptReader({
      state_dir: dir, max_bytes: 16,
    })({ source_receipt_schema: schema, source_receipt_hash: event.receipt_hash }),
    /untrusted_file/);
    if (process.platform !== 'win32') {
      fs.chmodSync(file, 0o644);
      assert.throws(() => createExecutionGateLedgerReceiptReader({ state_dir: dir })({
        source_receipt_schema: schema, source_receipt_hash: event.receipt_hash,
      }), /untrusted_file/);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('symlinked ledger file and arbitrary state paths are rejected', () => {
  const { root, dir, file } = setup();
  try {
    assert.throws(() => createExecutionGateLedgerReceiptReader({ state_dir: 'relative/state' }),
      /absolute_state_dir_required/);
    const target = path.join(root, 'target.jsonl');
    write(target, [syntheticEvent()]);
    fs.symlinkSync(target, file);
    assert.throws(() => createExecutionGateLedgerReceiptReader({ state_dir: dir })({
      source_receipt_schema: schema,
      source_receipt_hash: syntheticEvent().receipt_hash,
    }), /untrusted_file/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('real Passport + Context Receipt Bridge reconcile with execution JSONL but no origin claim', () => {
  const { root, dir, file } = setup();
  try {
    const passportStateDir = path.join(root, 'passport');
    const contextStateDir = path.join(root, 'context');
    const passport = new EvercraftPassport({ stateDir: passportStateDir });
    const now = Date.now();
    for (const [actor, scope] of [
      ['systemia:receipt-bridge', 'context.write.aliev'],
      ['agent:auditor', 'context.read.aliev'],
    ]) {
      passport.issueGrant({
        idempotency_key: 'ledger:' + actor,
        subject_ref: actor, issuer_ref: 'test:owner',
        product: 'evercraft-context', scopes: [scope],
        starts_at: new Date(now - 86400000).toISOString(),
        ends_at: new Date(now + 86400000).toISOString(),
        authority_state: 'verified_identity_authority',
        authority_receipt_ref: 'fixture:owner',
      });
    }
    const event = syntheticEvent();
    write(file, [event]);
    const bridge = new EvercraftContextReceiptBridge({ contextStateDir, passportStateDir });
    assert.equal(bridge.project({
      actor_ref: 'systemia:receipt-bridge',
      receipt: event,
    }).state, 'recorded');
    const report = reconcileTimewalkSourceReceipts(bridge.fabric, {
      actor_ref: 'agent:auditor',
      read_source_receipt: createExecutionGateLedgerReceiptReader({ state_dir: dir }),
    });
    assert.equal(report.digest_and_projection_consistent_count, 1);
    assert.equal(report.source_origin_authenticated, false);
    assert.equal(report.source_activity_completeness_proven, false);
    assert.equal(report.execution_authority_granted, false);
    const denied = reconcileTimewalkSourceReceipts(bridge.fabric, {
      actor_ref: 'agent:unknown',
      read_source_receipt: createExecutionGateLedgerReceiptReader({ state_dir: dir }),
    });
    assert.equal(denied.visible_context_record_count, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
