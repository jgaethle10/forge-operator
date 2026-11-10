import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EvercraftPassport } from '../../passport/passport.mjs';
import { EvercraftContextReceiptBridge } from '../receipt-bridge.mjs';
import { reconcileTimewalkSourceReceipts } from './source-reconciliation.mjs';

const hash = (body) => createHash('sha256').update(JSON.stringify(body)).digest('hex');
const signed = (body) => ({ ...body, receipt_hash: 'sha256:' + hash(body) });
const stamp = '2026-10-15T12:00:00.000Z';

function sourceFixture(kind = 'execution') {
  let body;
  if (kind === 'execution') {
    body = {
      schema: 'evercraft.execution-gate.lease-event.v1',
      lease_id: 'synthetic-lease-1', state: 'completed',
      specialist_slug: 'aliev', passport_product: 'rivet',
      outcome_evidence_ref: 'fixture:ready', outcome_state: 'ready',
      recorded_at: stamp,
    };
  } else if (kind === 'intake') {
    body = {
      schema: 'evercraft.intake.systemia-admission-packet.v1',
      candidate_id: 'candidate-1', mission_ref: 'mission:fixture',
      admission_evidence_ref: 'fixture:intake-accepted',
      admitted_at: stamp,
      execution_authority_granted: false,
      external_side_effects_authorized: false,
      content_is_instruction: false,
      payload_authority_claims_ignored: true,
    };
  } else {
    body = {
      schema: 'evercraft.systemia.mission-admission-receipt.v1',
      mission_key: 'fixture', admitted: true, admitted_at: stamp,
    };
  }
  return kind === 'mission'
    ? { ...body, receipt_hash: hash(body).slice(0, 12) }
    : signed(body);
}
function contextFixture(source, changes = {}) {
  const kind = source.schema.includes('execution-gate')
    ? 'execution' : source.schema.includes('intake.') ? 'intake' : 'mission';
  const body = {
    record_id: 'context-' + kind,
    source_receipt_schema: source.schema,
    source_receipt_hash: source.receipt_hash,
    observed_at: stamp,
    created_at: stamp,
    evidence_state: 'observed',
    visibility: 'internal',
    content_is_instruction: false,
    source_authority_inherited: false,
    ...(
      kind === 'execution' ? {
        namespace: 'aliev',
        kind: 'execution_receipt',
        entity_ref: 'execution:synthetic-lease-1',
        predicate: 'execution_state', claim_value: 'ready',
        source_ref: 'fixture:ready',
        content_trust_state: 'trusted_internal_receipt',
      } : kind === 'intake' ? {
        namespace: 'systemia',
        kind: 'intake_admission_receipt',
        entity_ref: 'mission:fixture',
        predicate: 'intake_admission_state', claim_value: 'accepted',
        source_ref: 'fixture:intake-accepted',
        content_trust_state: 'derived_summary',
      } : {
        namespace: 'systemia',
        kind: 'mission_admission_receipt',
        entity_ref: 'mission:fixture',
        predicate: 'mission_admission_state', claim_value: 'admitted',
        source_ref: 'systemia:mission-admission:fixture',
        content_trust_state: 'trusted_internal_receipt',
      }
    ),
    ...changes,
  };
  return signed(body);
}
function authorizedFabric(records, permittedIds = records.map((x) => x.record_id)) {
  return {
    authorizedTimewalkSnapshot({ actor_ref }) {
      return {
        schema: 'evercraft.context.authorized-timewalk-snapshot.v1',
        authority_filter_applied: true,
        authorized_at: '2026-11-09T20:00:00.000Z',
        records: actor_ref === 'agent:auditor'
          ? records.filter((r) => permittedIds.includes(r.record_id)) : [],
      };
    },
  };
}
const reconcile = (fabric, lookup, actor = 'agent:auditor') =>
  reconcileTimewalkSourceReceipts(fabric, {
    actor_ref: actor, read_source_receipt: lookup,
  });

test('all three receipt bridge families match digest and projection without claiming provenance', () => {
  const sources = ['execution', 'intake', 'mission'].map(sourceFixture);
  const contexts = sources.map((x) => contextFixture(x));
  const byHash = new Map(sources.map((source) => [source.receipt_hash, source]));
  const out = reconcile(authorizedFabric(contexts),
    ({ source_receipt_hash }) => byHash.get(source_receipt_hash) || null);
  assert.equal(out.visible_context_record_count, 3);
  assert.equal(out.digest_and_projection_consistent_count, 3);
  assert.equal(out.source_origin_authenticated, false);
  assert.equal(out.source_activity_completeness_proven, false);
  assert.equal(out.execution_authority_granted, false);
  assert.deepEqual(out.family_results.map((f) => f.states.consistent_digest_and_projection),
    [1, 1, 1]);
  assert.equal(JSON.stringify(out).includes('fixture:ready'), false);
});

test('stored source hash match is not enough when source projection fields disagree', () => {
  const source = sourceFixture('execution');
  const projected = contextFixture(source, { claim_value: 'paid' });
  const out = reconcile(authorizedFabric([projected]), () => source);
  assert.equal(out.total_states.source_projection_mismatch, 1);
  assert.equal(out.digest_and_projection_consistent_count, 0);
});

test('tampered raw receipt, incorrect schema, and absent source get different bounded states', () => {
  const source = sourceFixture('execution');
  const context = contextFixture(source);
  const f = authorizedFabric([context]);
  assert.equal(reconcile(f, () => null).total_states.source_unavailable, 1);
  assert.equal(reconcile(f, () => ({ ...source, schema: 'wrong' })).total_states.source_schema_mismatch, 1);
  assert.equal(reconcile(f, () => ({ ...source, outcome_state: 'tampered' })).total_states.source_digest_mismatch, 1);
  assert.equal(reconcile(f, () => { throw new Error('private-source-error'); })
    .total_states.source_lookup_failed, 1);
  assert.equal(JSON.stringify(reconcile(f, () => { throw new Error('private-source-error'); }))
    .includes('private-source-error'), false);
});

test('missing or unsupported source references never trigger a source read', () => {
  const source = sourceFixture('execution');
  const missingHash = contextFixture(source, { source_receipt_hash: null });
  const unsupported = signed({
    ...contextFixture(source),
    record_id: 'unsupported',
    source_receipt_schema: 'arbitrary.schema',
    receipt_hash: undefined,
  });
  // Recreate a properly sealed Context record rather than stacking hashes.
  const { receipt_hash: _ignored, ...body } = unsupported;
  const cleanUnsupported = signed(body);
  let called = 0;
  const result = reconcile(authorizedFabric([missingHash, cleanUnsupported]), () => { called++; return source; });
  assert.equal(called, 0);
  assert.equal(result.total_states.missing_source_hash, 1);
  assert.equal(result.total_states.unsupported_source_family, 1);
});

test('Context tampering fails closed before any read adapter sees source refs', () => {
  const source = sourceFixture('execution');
  const bad = { ...contextFixture(source), claim_value: 'fabricated' };
  let called = 0;
  assert.throws(() => reconcile(authorizedFabric([bad]), () => { called++; return source; }),
    /timewalk_receipt_integrity_failure/);
  assert.equal(called, 0);
});

test('current Passport view limits resolver requests, and cached hash is looked up once', () => {
  const source = sourceFixture('execution');
  const a = contextFixture(source);
  const b = contextFixture(source, { record_id: 'b' });
  const hidden = contextFixture(source, { record_id: 'hidden' });
  let calls = 0;
  const result = reconcile(authorizedFabric([a, b, hidden], [a.record_id, b.record_id]),
    () => { calls++; return source; });
  assert.equal(calls, 1);
  assert.equal(result.visible_context_record_count, 2);
  assert.equal(result.digest_and_projection_consistent_count, 2);
  assert.equal(JSON.stringify(result).includes('hidden'), false);
  assert.equal(reconcile(authorizedFabric([a]), () => { throw new Error('should not call'); },
    'agent:unprivileged').visible_context_record_count, 0);
});

test('asynchronous source adapters are rejected, not silently treated as receipts', () => {
  const source = sourceFixture('mission');
  assert.throws(
    () => reconcile(authorizedFabric([contextFixture(source)]), () => Promise.resolve(source)),
    /timewalk_source_adapter_must_be_synchronous/
  );
});

test('native Context Receipt Bridge projection reconciles against source fixture', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-source-reconcile-'));
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
        grant_id: 'grant:' + actor,
        idempotency_key: 'grant:' + actor,
        subject_ref: actor, issuer_ref: 'identity:test',
        product: 'evercraft-context', scopes: [scope],
        starts_at: new Date(now - 14 * 86400000).toISOString(),
        ends_at: new Date(now + 14 * 86400000).toISOString(),
        authority_state: 'verified_identity_authority',
        authority_receipt_ref: 'identity:fixture',
      });
    }
    const bridge = new EvercraftContextReceiptBridge({ contextStateDir, passportStateDir });
    const origin = {
      ...sourceFixture('execution'),
      recorded_at: new Date(now - 60_000).toISOString(),
    };
    // Signing is over the exact final fixture bytes.
    const { receipt_hash: _old, ...payload } = origin;
    const receipt = signed(payload);
    const projected = bridge.project({
      actor_ref: 'systemia:receipt-bridge', receipt,
    });
    assert.equal(projected.state, 'recorded');
    const result = reconcileTimewalkSourceReceipts(bridge.fabric, {
      actor_ref: 'agent:auditor',
      read_source_receipt: ({ source_receipt_hash }) =>
        source_receipt_hash === receipt.receipt_hash ? receipt : null,
    });
    assert.equal(result.digest_and_projection_consistent_count, 1);
    assert.equal(result.total_states.consistent_digest_and_projection, 1);
    assert.equal(result.source_origin_authenticated, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
