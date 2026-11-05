import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { queryTimewalk } from './timewalk.mjs';
const hash = (obj) => 'sha256:' + createHash('sha256').update(JSON.stringify(obj)).digest('hex');
const signed = (obj) => ({ ...obj, receipt_hash: hash(obj) });
const stamp = (s) => new Date(s).toISOString();
function fact(id, value, created, observed, options = {}) {
  return signed({
    record_id: id, namespace: 'systemia', entity_ref: 'service:payments',
    predicate: 'health', claim_value: value, kind: 'fact', title: `Payment status ${id}`,
    source_ref: `receipt:${id}`, source_sha256: null, source_receipt_hash: null,
    evidence_state: 'observed', content_trust_state: 'trusted_internal_receipt',
    observed_at: stamp(observed), created_at: stamp(created), valid_from: null,
    valid_to: null, supersedes_record_id: null, ...options,
  });
}
function fakeFabric(records, allowed = new Set(records.map((r) => r.record_id))) {
  return {
    authorizedTimewalkSnapshot({ actor_ref, namespaces, entity_ref, predicate }) {
      const ns = namespaces == null ? null : new Set(Array.isArray(namespaces) ? namespaces : [namespaces]);
      return {
        schema: 'evercraft.context.authorized-timewalk-snapshot.v1',
        authorized_at: stamp('2026-11-04'),
        records: records.filter((r) => actor_ref === 'agent:auditor' && allowed.has(r.record_id) &&
          (!ns || ns.has(r.namespace)) &&
          (entity_ref == null || entity_ref === r.entity_ref) &&
          (predicate == null || predicate === r.predicate)),
      };
    },
  };
}
const args = { actor_ref: 'agent:auditor',
  valid_at: stamp('2026-10-15'), known_at: stamp('2026-10-15') };

test('knowledge-time blocks facts entered after historical cutoff, even if backdated', () => {
  const r1 = fact('old', 'degraded', '2026-10-10', '2026-10-10');
  const r2 = fact('later', 'healthy', '2026-10-20', '2026-10-10');
  const response = queryTimewalk(fakeFabric([r1, r2]), args);
  assert.deepEqual(response.facts.map((r) => r.record_id), ['old']);
  assert.equal(response.facts[0].effective_time_basis, 'observed_at_fallback');
});

test('valid-time limits what held in the world, independent of knowledge time', () => {
  const prior = fact('prior', 'degraded', '2026-10-10', '2026-10-10', {
    valid_to: stamp('2026-10-12'),
  });
  const later = fact('later', 'healthy', '2026-10-15', '2026-10-15', {
    valid_from: stamp('2026-10-13'),
  });
  const response = queryTimewalk(fakeFabric([prior, later]), { ...args, known_at: stamp('2026-10-20') });
  assert.deepEqual(response.facts.map((r) => r.record_id), ['later']);
  assert.equal(response.facts[0].effective_time_basis, 'explicit_valid_from');
});

test('supersession only applies when the new fact was already known and effective', () => {
  const first = fact('first', 'down', '2026-10-10', '2026-10-10');
  const correction = fact('correction', 'degraded', '2026-10-16', '2026-10-10', {
    valid_from: stamp('2026-10-10'), supersedes_record_id: 'first',
  });
  assert.equal(queryTimewalk(fakeFabric([first, correction]), args).facts[0].status, 'active');
  const response = queryTimewalk(fakeFabric([first, correction]), { ...args, known_at: stamp('2026-10-20') });
  assert.deepEqual(response.facts.map((r) => r.status), ['superseded', 'active']);
});

test('retractions are visible in history but only effective after retraction time', () => {
  const a = fact('a', 'down', '2026-10-10', '2026-10-10');
  const r = signed({ record_id: 'a', retracted_at: stamp('2026-10-18'),
    evidence_ref: 'audit:a', created_at: stamp('2026-10-18') });
  const fab = fakeFabric([{ ...a, retraction: r }]);
  assert.equal(queryTimewalk(fab, args).facts[0].status, 'active');
  const later = queryTimewalk(fab, { ...args, known_at: stamp('2026-10-20') });
  assert.equal(later.facts[0].status, 'retracted');
  assert.equal(later.facts[0].retraction_evidence_ref, 'audit:a');
});

test('conflicting claims retain both citations; no silent LLM reconciliation', () => {
  const a = fact('a', 'healthy', '2026-10-10', '2026-10-10');
  const b = fact('b', 'down', '2026-10-11', '2026-10-11');
  const response = queryTimewalk(fakeFabric([a, b]), args);
  assert.equal(response.conflict_count, 1);
  assert.deepEqual(response.conflicts[0].values.map((v) => v.source_refs[0]).sort(), ['receipt:a','receipt:b']);
  assert.equal(response.execution_authority_granted, false);
});

test('Passport gate is honored even for historical and public-looking queries', () => {
  const a = fact('a', 'healthy', '2026-10-10', '2026-10-10');
  const b = fact('b', 'secret', '2026-10-10', '2026-10-10');
  assert.deepEqual(queryTimewalk(fakeFabric([a, b], new Set(['a'])), args).facts.map((r) => r.record_id), ['a']);
  assert.equal(queryTimewalk(fakeFabric([a, b]), { ...args, actor_ref: null }).facts.length, 0);
});

test('tampered signed records fail closed instead of appearing in historical answers', () => {
  const a = { ...fact('a', 'healthy', '2026-10-10', '2026-10-10'), claim_value: 'altered' };
  assert.throws(() => queryTimewalk(fakeFabric([a]), args), /integrity_failure/);
});

test('limits flag incompleteness without silently claiming all facts are shown', () => {
  const a = fact('a', 'healthy', '2026-10-10', '2026-10-10');
  const b = fact('b', 'down', '2026-10-11', '2026-10-11');
  const response = queryTimewalk(fakeFabric([a, b]), { ...args, limit: 1 });
  assert.equal(response.complete, false);
  assert.equal(response.facts.length, 1);
  assert.equal(response.total_authorized_matching, 2);
  assert.equal(response.conflict_count, 1);
});

test('retracted correction does not erase the earlier assertion', () => {
  const original = fact('original', 'down', '2026-10-10', '2026-10-10');
  const correction = fact('correction', 'up', '2026-10-12', '2026-10-10', {
    supersedes_record_id: 'original',
  });
  const retraction = signed({ record_id: 'correction', retracted_at: stamp('2026-10-13'),
    evidence_ref: 'retraction:correction', created_at: stamp('2026-10-13') });
  const fab = fakeFabric([original, { ...correction, retraction }]);
  const response = queryTimewalk(fab, { ...args, known_at: stamp('2026-10-20') });
  assert.deepEqual(response.facts.map((r) => r.status), ['active', 'retracted']);
});
test('historical caller cannot override present authorization time', () => {
  const record = fact('auth', 'private', '2026-10-10', '2026-10-10');
  const fab = fakeFabric([record]);
  assert.throws(() => queryTimewalk(fab, {
    ...args, authorization_at: stamp('2026-10-10'),
  }), /timewalk_authorization_time_cannot_be_overridden/);
  assert.equal(queryTimewalk(fab, args).authorization_time_source, 'context_fabric_server_clock');
});

test('backdated retraction is not known before recorded timestamp', () => {
  const record = fact('backdated', 'down', '2026-10-10', '2026-10-10');
  const retraction = signed({
    record_id: 'backdated', retracted_at: stamp('2026-10-11'),
    evidence_ref: 'audit:backdated', created_at: stamp('2026-10-20'),
  });
  const fab = fakeFabric([{ ...record, retraction }]);
  assert.equal(queryTimewalk(fab, args).facts[0].status, 'active');
  assert.equal(queryTimewalk(fab, { ...args, known_at: stamp('2026-10-21') }).facts[0].status, 'retracted');
});

test('legacy retraction without creation time is explicitly unknowable', () => {
  const record = fact('legacy', 'down', '2026-10-10', '2026-10-10');
  const retraction = signed({
    record_id: 'legacy', retracted_at: stamp('2026-10-12'),
    evidence_ref: 'audit:legacy',
  });
  const result = queryTimewalk(fakeFabric([{ ...record, retraction }]), {
    ...args, known_at: stamp('2026-10-21'),
  });
  assert.equal(result.facts[0].status, 'retraction_time_unverified');
  assert.equal(result.historical_status_complete, false);
  assert.equal(result.active_count, 0);
});

test('invalid authorized snapshot contract fails closed', () => {
  assert.throws(() => queryTimewalk({
    authorizedTimewalkSnapshot: () => ({ schema: 'wrong', records: [] }),
  }, args), /timewalk_authorized_snapshot_invalid/);
});
