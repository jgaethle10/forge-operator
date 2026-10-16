import test from 'node:test';
import assert from 'node:assert/strict';
import { createYouthGameFabricHandoff as handoff, STATUS, YOUTH_SCHEMA, DEVELOPMENT_SCHEMA } from './youth-bridge.mjs';

const practice = () => ({
  schema: YOUTH_SCHEMA, status: 'illustrative-coach-review-required', non_contact: true, program_only: true,
  configuration: { age: '8-10', goal: 'catch', duration: 30, group: 12, coaches: 2, space: 'half' },
  total_minutes: 30, requires_staffing_review: false,
  blocks: [6,6,6,6,6].map((minute,i) => ({ id: 'block-' + i, title: 'Block ' + i, instruction: 'Walk through non-contact drills.', minute }))
});
const development = () => ({
  schema: DEVELOPMENT_SCHEMA, status: 'illustrative-coach-review-required', group_only: true, non_contact: true,
  three_sessions: ['Introduce','Apply','Transfer'].map((stage,i) => ({
    session: i+1, stage, coaching_activity: 'Walk an open route with cones.', group_observation: 'Observe group participation.'
  }))
});

// Entirely synthetic fixtures. Real athlete data must not enter this public repo.
test('practice handoff remains pending, internal and provenance-bearing', () => {
  const result = handoff(practice());
  assert.equal(result.state, STATUS);
  assert.equal(result.summary.planned_minutes, 30);
  assert.ok(result.release.source_sha256.length === 64);
  assert.ok(result.gates.includes('systemia_admission'));
  assert.equal(result.authorized_actions.includes('production_dispatch'), false);
});
test('development handoff is group-only', () => assert.equal(handoff(development()).summary.group_only, true));
test('rejects PII field anywhere in nested object', () => assert.throws(() => handoff({...practice(), notes:{athleteName:'Example'}}), /private_field_blocked/));
test('rejects email address in free text', () => assert.throws(() => handoff({...practice(), objective:'child@example.org'}), /email_address_blocked/));
test('rejects unsupported evidence state', () => assert.throws(() => handoff({...practice(), status:'approved'}), /evidence_status_invalid/));
test('rejects external origin', () => assert.throws(() => handoff(practice(), {origin:'external_live_api'}), /origin_not_authorized/));
test('rejects unknown source schema', () => assert.throws(() => handoff({...practice(), schema:'unknown'}), /schema_unknown/));
test('rejects contact activities', () => assert.throws(() => handoff({...practice(), non_contact:false}), /non_contact_invalid/));
test('rejects contradictory duration sums', () => { const x=practice(); x.blocks[0].minute=4; assert.throws(()=>handoff(x),/time_budget_mismatch/); });
test('rejects undersupervised group without staffing review', () => {const x=practice();x.configuration.group=20;x.configuration.coaches=1;assert.throws(()=>handoff(x),/staffing_review_required/);});
test('records staffing warning when explicitly reviewed', () => {const x=practice();x.configuration.group=20;x.configuration.coaches=1;x.requires_staffing_review=true;assert.equal(handoff(x).summary.staffing_review,true);});
test('rejects unsorted or incomplete development stages', () => {const x=development();x.three_sessions[1].session=3; assert.throws(()=>handoff(x),/session_sequence_invalid/);});
test('does not mutate coach input', () => {const x=practice();const before=JSON.stringify(x);handoff(x);assert.equal(JSON.stringify(x),before);});
test('fingerprint changes on changed source content', () => {const a=practice();const b=practice();b.blocks[0].title='Another block';assert.notEqual(handoff(a).source_sha256,handoff(b).source_sha256);});
