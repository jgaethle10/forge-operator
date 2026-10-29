import test from 'node:test';
import assert from 'node:assert/strict';
import { auditAgentContinuity } from '../systemia/agent-continuity/continuity-gate.mjs';

const NOW = '2026-10-28T20:00:00.000Z';
function fixture() {
  const roles = Array.from({ length: 22 }, (_, i) => ({
    id: 'commissioned-role-' + (i + 1),
    name: i === 0 ? 'systemia' : i === 1 ? 'saban' : 'specialist-' + i,
    status: 'active',
  }));
  return {
    baseline: {
      role_ids: roles.map((role) => role.id),
      minimum_role_count: 22,
      minimum_lineup_count: 14,
    },
    snapshot: {
      source: { observed_at: NOW, producer: 'owned-registry-fixture' },
      role_profiles: roles,
      dna_protocols: [
        { id: 'juniper', kind: 'embedded', counts_as_agent: false, status: 'active' },
        { id: 'sentinel', kind: 'embedded', counts_as_agent: false, status: 'active' },
      ],
      lineups: Array.from({ length: 14 }, (_, i) => ({
        id: 'formation-' + (i + 1), status: 'active',
        role_ids: [roles[i].id, roles[0].id],
      })),
      dispatch_receipts: [{
        role_id: roles[1].id, mission_id: 'test-mission-1',
        observed_at: NOW,
        dna: {
          juniper: { preflight: 'passed', writeback: 'recorded' },
          sentinel: { preflight: 'passed' },
        },
      }],
    },
  };
}
const independentVerifiers = {
  verifySnapshot: () => true,
  verifyDispatch: () => true,
};
const check = (f, overrides = {}) => auditAgentContinuity({
  ...f, now: NOW, ...overrides,
});
test('authenticated example retains 22 roles, 14 formations and two non-dispatchable DNA protocols', () => {
  const f = fixture();
  const r = check(f, independentVerifiers);
  assert.equal(r.state, 'verified_observation_only');
  assert.equal(r.registered_active_role_count, 22);
  assert.equal(r.registered_active_lineup_count, 14);
  assert.equal(r.verified_dispatch_count, 1);
  assert.deepEqual(r.independently_observed_role_ids, ['commissioned-role-2']);
  assert.equal(r.all_roles_live, false);
  assert.equal(r.execution_authority_granted, false);
});
test('untrusted registry and receipt cannot self-certify even when their JSON claims verified', () => {
  const f = fixture();
  f.snapshot.verified = true;
  f.snapshot.dispatch_receipts[0].verified = true;
  const r = check(f);
  assert.equal(r.state, 'held_unverified');
  assert.equal(r.verified_dispatch_count, 0);
  assert.ok(r.holds.includes('registry_origin_not_independently_authenticated'));
  assert.ok(r.holds.includes('no_independently_verified_dispatch_with_both_dna_protocols'));
});
test('one vanished commissioned role is detected even when a protocol is counted instead', () => {
  const f = fixture();
  f.snapshot.role_profiles.pop();
  f.snapshot.role_profiles.push({ id: 'sentinel', name: 'Sentinel', status: 'active' });
  f.snapshot.lineups[0].role_ids.push('sentinel');
  const r = check(f, independentVerifiers);
  assert.ok(r.holds.includes('previous_agent_role_missing'));
  assert.ok(r.holds.includes('dna_protocol_incorrectly_counted_as_agent'));
  assert.ok(r.holds.includes('formation_references_missing_role_or_dna_protocol'));
});
test('Juniper missing or Sentinel counted as a dispatched worker holds', () => {
  const f = fixture();
  f.snapshot.dna_protocols = f.snapshot.dna_protocols.filter((item) => item.id !== 'juniper');
  f.snapshot.lineups[0].role_ids.push('sentinel');
  const r = check(f, independentVerifiers);
  assert.ok(r.holds.includes('juniper_embedded_protocol_missing_or_invalid'));
  assert.ok(r.holds.includes('formation_references_missing_role_or_dna_protocol'));
});
test('no memory writeback, missing Sentinel, stale or forged dispatch receipts are not operating proof', () => {
  for (const variant of ['writeback', 'sentinel', 'stale', 'forged']) {
    const f = fixture();
    const receipt = f.snapshot.dispatch_receipts[0];
    if (variant === 'writeback') delete receipt.dna.juniper.writeback;
    if (variant === 'sentinel') delete receipt.dna.sentinel.preflight;
    if (variant === 'stale') receipt.observed_at = '2026-10-27T20:00:00.000Z';
    const r = check(f, {
      verifySnapshot: () => true,
      verifyDispatch: () => variant !== 'forged',
    });
    assert.equal(r.verified_dispatch_count, 0);
    assert.ok(r.holds.includes('no_independently_verified_dispatch_with_both_dna_protocols'));
  }
});
test('stale registry and absent historical identities cannot be promoted to operational continuity', () => {
  const f = fixture();
  f.snapshot.source.observed_at = '2026-10-27T20:00:00.000Z';
  f.baseline.role_ids = [];
  const r = check(f, independentVerifiers);
  assert.ok(r.holds.includes('registry_observation_missing_or_stale'));
  assert.ok(r.holds.includes('historical_role_identity_baseline_missing_or_invalid'));
});
test('a failed or throwing verifier always holds', () => {
  const f = fixture();
  const r = check(f, {
    verifySnapshot: () => { throw new Error('connection failed'); },
    verifyDispatch: () => true,
  });
  assert.equal(r.execution_authority_granted, false);
  assert.ok(r.holds.includes('registry_origin_not_independently_authenticated'));
});
