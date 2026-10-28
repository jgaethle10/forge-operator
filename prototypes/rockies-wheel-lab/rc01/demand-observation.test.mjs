import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCommunityDemand, proveDemandObservationInMemory } from './demand-observation.mjs';
import { toContextFabricRecord } from '../../../systemia/worldstate/context-fabric-adapter.mjs';

const founderScreenshot = {
  provenance_ref: 'intake:founder-screenshot:yakima-wheel-visualizer:2026-10-14',
  observed_at: '2026-10-14T20:08:00Z',
  region_key: 'yakima-wa',
  need: 'an interactive car and wheel appearance preview',
  reactions: 17,
  comments: 4
};

test('one founder screenshot remains one reported, identity-free signal', () => {
  const signal = normalizeCommunityDemand(founderScreenshot);
  assert.equal(signal.evidence_state, 'reported');
  assert.equal(signal.facts.screenshot_count, 1);
  assert.equal(signal.facts.independent_verified_buyers, 0);
  assert.equal(signal.facts.merchant_opt_ins, 0);
  assert.equal(signal.facts.price_validation, 'unverified');
  assert.equal(signal.metadata.source_publicly_retrievable, false);
  assert.equal(signal.metadata.personal_identities_excluded, true);
  assert.equal(signal.anomaly_score, 0);
  assert.ok(!JSON.stringify(signal).includes('James Stone'));
  assert.ok(!JSON.stringify(signal).includes('facebook.com'));
});

test('Rockies can feed the existing Context Fabric in memory without dispatching a mission', () => {
  const proof = proveDemandObservationInMemory(founderScreenshot);
  assert.equal(proof.simulated_only, true);
  assert.equal(proof.decision.action, 'propagate');
  assert.equal(proof.decision.priority, 'background');
  assert.equal(proof.dedupe_decision.action, 'deduped');
  assert.ok(proof.decision.consumers.includes('systemia_world_model'));
  assert.ok(proof.consumer_count >= 1);
  assert.equal(proof.context_count, 1);
  assert.equal(proof.observation.metadata.mission_admission, 'not_implied');
});

test('Context Fabric adapter preserves untrusted reported origin, not verified evidence', () => {
  const record = toContextFabricRecord(normalizeCommunityDemand(founderScreenshot), {
    actor_ref: 'systemia:rockies:manual-research',
    visibility: 'internal'
  });
  assert.equal(record.content_trust_state, 'untrusted_external');
  assert.equal(record.visibility, 'internal');
  assert.equal(record.required_scope, 'context.read.worldstate');
  assert.equal(record.claim_value.worldstate_evidence_state, 'reported');
  assert.equal(record.source_ref, founderScreenshot.provenance_ref);
});

test('missing provenance, identity leakage, fabricated buyers, and malformed counts fail closed', () => {
  const variants = [
    { provenance_ref: '' },
    { poster_name: 'private citizen' },
    { public_post_url: 'https://example.invalid/post' },
    { buyers_verified: true },
    { merchant_opt_in: true },
    { willingness_to_pay_verified: true },
    { reactions: -1 },
    { comments: 1.5 },
    { observed_at: 'unknown' },
    { need: 'tiny' }
  ];
  for (const override of variants) {
    assert.throws(() => normalizeCommunityDemand({...founderScreenshot, ...override}));
  }
});

test('idempotent research intake does not multiply screenshot engagement into independent buyers', () => {
  const a = normalizeCommunityDemand(founderScreenshot);
  const b = normalizeCommunityDemand({...founderScreenshot});
  assert.equal(a.observation_id, b.observation_id);
  assert.equal(a.facts.independent_verified_buyers, 0);
  assert.equal(a.facts.reactions_in_screenshot, 17);
  assert.equal(a.facts.comments_in_screenshot, 4);
});
