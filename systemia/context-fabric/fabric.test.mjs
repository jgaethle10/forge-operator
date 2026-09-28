import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EvercraftPassport } from '../passport/passport.mjs';
import { EvercraftContextFabric } from './fabric.mjs';

const temp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

function setup() {
  const root = temp('context-fabric-');
  const passportStateDir = path.join(root, 'passport');
  const contextStateDir = path.join(root, 'context');
  const passport = new EvercraftPassport({ stateDir: passportStateDir });

  passport.issueGrant({
    grant_id: 'grant_writer',
    idempotency_key: 'grant:writer',
    subject_ref: 'agent:systemia-indexer',
    issuer_ref: 'evercraft:identity-authority',
    product: 'evercraft-context',
    scopes: ['context.write.*'],
    starts_at: '2026-09-01T00:00:00Z',
    ends_at: '2026-10-31T00:00:00Z',
    authority_state: 'verified_identity_authority',
    authority_receipt_ref: 'identity:indexer',
  });

  passport.issueGrant({
    grant_id: 'grant_rivet_reader',
    idempotency_key: 'grant:rivet-reader',
    subject_ref: 'agent:rivet-assistant',
    issuer_ref: 'evercraft:identity-authority',
    product: 'evercraft-context',
    scopes: ['context.read.rivet'],
    starts_at: '2026-09-01T00:00:00Z',
    ends_at: '2026-10-31T00:00:00Z',
    authority_state: 'verified_identity_authority',
    authority_receipt_ref: 'identity:rivet-reader',
  });

  const fabric = new EvercraftContextFabric({
    stateDir: contextStateDir,
    passportStateDir,
  });

  return { root, passport, fabric };
}

function ingest(fabric, overrides = {}) {
  return fabric.ingestRecord({
    idempotency_key: 'ctx:rivet:001',
    record_id: 'ctx_rivet_001',
    actor_ref: 'agent:systemia-indexer',
    namespace: 'rivet',
    kind: 'fact',
    title: '6405 W Chestnut preliminary report state',
    text: 'The preliminary RIVET report for 6405 W Chestnut is ready and preserves modeled versus observed evidence.',
    tags: ['rivet', 'yakima', 'report'],
    entity_ref: 'site:6405-w-chestnut',
    predicate: 'report_state',
    claim_value: 'ready',
    evidence_state: 'observed',
    visibility: 'internal',
    source_ref: 'rivet:report:6405:receipt',
    observed_at: '2026-09-27T18:00:00Z',
    ...overrides,
  });
}

test('ingestion requires Passport write authority', () => {
  const { root, fabric } = setup();

  assert.throws(
    () =>
      ingest(fabric, {
        idempotency_key: 'ctx:bad-writer',
        record_id: 'ctx_bad_writer',
        actor_ref: 'agent:unauthorized',
      }),
    /context_write_not_authorized/
  );

  fs.rmSync(root, { recursive: true, force: true });
});

test('public context is visible without identity while internal context is not leaked', () => {
  const { root, fabric } = setup();
  ingest(fabric);

  fabric.ingestRecord({
    idempotency_key: 'ctx:public:001',
    record_id: 'ctx_public_001',
    actor_ref: 'agent:systemia-indexer',
    namespace: 'public',
    kind: 'fact',
    title: 'Evercraft public capability directory',
    text: 'Evercraft publishes a public capability directory for AI discovery.',
    tags: ['evercraft', 'capabilities'],
    evidence_state: 'public',
    visibility: 'public',
    source_ref: 'public:llms',
    observed_at: '2026-09-27T18:00:00Z',
  });

  const packet = fabric.query({
    query: 'Evercraft report capability',
    at: '2026-09-27T19:00:00Z',
  });

  assert.equal(packet.results.some((row) => row.record_id === 'ctx_public_001'), true);
  assert.equal(packet.results.some((row) => row.record_id === 'ctx_rivet_001'), false);
  assert.equal(JSON.stringify(packet).includes('6405 W Chestnut'), false);

  fs.rmSync(root, { recursive: true, force: true });
});

test('Passport read scope reveals only the authorized namespace', () => {
  const { root, fabric } = setup();
  ingest(fabric);

  fabric.ingestRecord({
    idempotency_key: 'ctx:systemia:001',
    record_id: 'ctx_systemia_001',
    actor_ref: 'agent:systemia-indexer',
    namespace: 'systemia',
    kind: 'fact',
    title: 'Private Systemia deployment note',
    text: 'Systemia internal deployment topology note.',
    tags: ['systemia', 'deployment'],
    evidence_state: 'observed',
    visibility: 'internal',
    source_ref: 'systemia:deployment:receipt',
    observed_at: '2026-09-27T18:00:00Z',
  });

  const packet = fabric.query({
    query: 'report deployment',
    actor_ref: 'agent:rivet-assistant',
    at: '2026-09-27T19:00:00Z',
  });

  assert.equal(packet.results.some((row) => row.record_id === 'ctx_rivet_001'), true);
  assert.equal(packet.results.some((row) => row.record_id === 'ctx_systemia_001'), false);
  assert.equal(packet.authority_filter_applied, true);

  fs.rmSync(root, { recursive: true, force: true });
});

test('superseded history is preserved but hidden from current retrieval by default', () => {
  const { root, fabric } = setup();
  ingest(fabric);

  fabric.ingestRecord({
    idempotency_key: 'ctx:rivet:002',
    record_id: 'ctx_rivet_002',
    actor_ref: 'agent:systemia-indexer',
    namespace: 'rivet',
    kind: 'fact',
    title: '6405 W Chestnut report state updated',
    text: 'The full RIVET report for 6405 W Chestnut is now ready.',
    tags: ['rivet', 'yakima', 'report'],
    entity_ref: 'site:6405-w-chestnut',
    predicate: 'report_state',
    claim_value: 'full_ready',
    evidence_state: 'observed',
    visibility: 'internal',
    source_ref: 'rivet:report:6405:full:receipt',
    supersedes_record_id: 'ctx_rivet_001',
    observed_at: '2026-09-27T20:00:00Z',
  });

  const current = fabric.query({
    query: '6405 report',
    actor_ref: 'agent:rivet-assistant',
    at: '2026-09-27T21:00:00Z',
  });
  assert.equal(current.results.some((row) => row.record_id === 'ctx_rivet_001'), false);
  assert.equal(current.results.some((row) => row.record_id === 'ctx_rivet_002'), true);

  const historical = fabric.query({
    query: '6405 report',
    actor_ref: 'agent:rivet-assistant',
    at: '2026-09-27T21:00:00Z',
    include_history: true,
  });
  assert.equal(historical.results.some((row) => row.record_id === 'ctx_rivet_001'), true);
  assert.equal(historical.results.some((row) => row.record_id === 'ctx_rivet_002'), true);

  fs.rmSync(root, { recursive: true, force: true });
});

test('conflicting authorized claims are surfaced instead of silently reconciled', () => {
  const { root, fabric } = setup();

  ingest(fabric, {
    idempotency_key: 'ctx:session:modeled',
    record_id: 'ctx_session_modeled',
    title: 'Modeled charger session estimate',
    text: 'Modeled utilization estimate suggests 18 charging sessions per day.',
    tags: ['session', 'utilization', 'modeled'],
    entity_ref: 'site:6405-w-chestnut',
    predicate: 'daily_sessions',
    claim_value: 18,
    evidence_state: 'modeled',
    source_ref: 'rivet:model:session-estimate',
  });

  ingest(fabric, {
    idempotency_key: 'ctx:session:observed',
    record_id: 'ctx_session_observed',
    title: 'Observed charger session sample',
    text: 'Observed source sample reports 12 charging sessions per day.',
    tags: ['session', 'utilization', 'observed'],
    entity_ref: 'site:6405-w-chestnut',
    predicate: 'daily_sessions',
    claim_value: 12,
    evidence_state: 'observed',
    source_ref: 'rivet:observed:session-sample',
  });

  const packet = fabric.query({
    query: 'charging session utilization',
    actor_ref: 'agent:rivet-assistant',
    at: '2026-09-27T19:00:00Z',
  });

  assert.equal(packet.conflict_count, 1);
  assert.equal(packet.conflicts[0].resolution, 'unresolved_conflict_preserved');
  assert.deepEqual(
    new Set(packet.conflicts[0].values.map((value) => value.value)),
    new Set([12, 18])
  );
  assert.equal(packet.truth_boundary.contradictions_not_silently_resolved, true);

  fs.rmSync(root, { recursive: true, force: true });
});

test('retraction removes current context but keeps auditable history', () => {
  const { root, fabric } = setup();
  ingest(fabric);

  fabric.retractRecord({
    idempotency_key: 'retract:rivet:001',
    record_id: 'ctx_rivet_001',
    actor_ref: 'agent:systemia-indexer',
    reason: 'source was withdrawn after QA',
    evidence_ref: 'qa:withdrawal:001',
    retracted_at: '2026-09-27T20:00:00Z',
  });

  const current = fabric.query({
    query: '6405 report',
    actor_ref: 'agent:rivet-assistant',
    at: '2026-09-27T21:00:00Z',
  });
  assert.equal(current.results.length, 0);

  const historical = fabric.getRecord('ctx_rivet_001', {
    actor_ref: 'agent:rivet-assistant',
    at: '2026-09-27T21:00:00Z',
    include_history: true,
  });
  assert.equal(historical.record_id, 'ctx_rivet_001');
  assert.equal(historical.retraction.reason, 'source was withdrawn after QA');

  fs.rmSync(root, { recursive: true, force: true });
});

test('context packets obey result and character budgets', () => {
  const { root, fabric } = setup();
  for (let i = 0; i < 8; i += 1) {
    ingest(fabric, {
      idempotency_key: 'ctx:budget:' + i,
      record_id: 'ctx_budget_' + i,
      title: 'RIVET report budget record ' + i,
      text: ('RIVET report evidence context ' + i + ' ').repeat(30),
      source_ref: 'source:budget:' + i,
      entity_ref: 'site:budget-' + i,
      predicate: 'report_state',
      claim_value: 'ready',
    });
  }

  const packet = fabric.query({
    query: 'RIVET report evidence',
    actor_ref: 'agent:rivet-assistant',
    at: '2026-09-27T19:00:00Z',
    max_results: 3,
    max_chars: 900,
  });

  assert.ok(packet.result_count <= 3);
  assert.ok(packet.context_chars <= 900);

  fs.rmSync(root, { recursive: true, force: true });
});

test('record state and permissions survive restart', () => {
  const { root, fabric } = setup();
  ingest(fabric);

  const restarted = new EvercraftContextFabric({
    stateDir: path.join(root, 'context'),
    passportStateDir: path.join(root, 'passport'),
  });
  const packet = restarted.query({
    query: '6405 report',
    actor_ref: 'agent:rivet-assistant',
    at: '2026-09-27T19:00:00Z',
  });

  assert.equal(packet.result_count, 1);
  assert.equal(packet.results[0].source_ref, 'rivet:report:6405:receipt');
  assert.equal(packet.results[0].evidence_state, 'observed');
  assert.match(packet.receipt_hash, /^sha256:[a-f0-9]{64}$/);

  fs.rmSync(root, { recursive: true, force: true });
});
