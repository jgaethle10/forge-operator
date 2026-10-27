import assert from 'node:assert/strict';
import test from 'node:test';
import { runLocalCreativeCouncilPreview, COUNCIL_ROLES } from '../systemia/saban/work-skills/fallen-council-bridge.mjs';
import { renderFallenCouncilWorkroom } from '../systemia/saban/work-skills/workroom.mjs';

const sample = {
  business_name: 'Example Cleaning Co',
  audience: 'Busy households',
  call_to_action: 'Request an estimate',
  duration_seconds: 30,
  claims: [{ text: 'We clean offices', evidence_ref: '' }],
  approved_assets: []
};

test('Work Saban hands four original commercial beats to fourteen existing Saban council roles', async () => {
  const proof = await runLocalCreativeCouncilPreview({
    task: 'Make a 30-second commercial for Example Cleaning Co',
    brief: sample
  });
  assert.equal(proof.schema, 'evercraft.work-saban.fallen-council-preview.v1');
  assert.equal(proof.state, 'creative_direction_generated_source_held');
  assert.equal(proof.registered_council_invocations, 56);
  assert.equal(proof.council_role_count, 14);
  assert.equal(proof.shot_count, 4);
  assert.equal(proof.council_worker_receipts.length, 56);
  assert.equal(proof.local_work.worker_receipts.length, 4);
  for (const shot of proof.shots) {
    const receipts = proof.council_worker_receipts.filter(r => r.result.shot_id === shot.id);
    assert.equal(receipts.length, 14);
    assert.deepEqual(receipts.map(r => r.role), COUNCIL_ROLES);
    assert.ok(receipts.every(r => r.schema === 'evercraft.saban.registered-worker-receipt.v1'));
    assert.ok(receipts.every(r => r.result.boundaries.no_provider_call_implied === true));
    assert.ok(shot.coverage.every(x => x.status === 'missing'));
  }
  assert.equal(proof.council_reconciliation.blueprints.length, 4);
  assert.equal(proof.council_reconciliation.blocked_shot_count, 4);
  assert.ok(proof.council_reconciliation.blueprints.every(p => p.status === 'blocked'));
  for (const p of proof.council_reconciliation.blueprints) {
    assert.ok(p.creative_genome.voice_performance);
    assert.ok(p.creative_genome.music);
    assert.ok(p.creative_genome.beauty);
    assert.ok(p.rejection_contract.includes('missing_provenance_state'));
  }
  assert.equal(proof.source_coverage_verified, false);
  assert.equal(proof.generated_media, false);
  assert.equal(proof.provider_calls_performed, 0);
  assert.equal(proof.customer_delivery_performed, false);
  assert.equal(proof.external_effects_performed, false);
  assert.match(proof.receipt_sha256, /^[0-9a-f]{64}$/);
});

test('Fallen Workroom shows creative council holds and escapes hostile names', async () => {
  const proof = await runLocalCreativeCouncilPreview({
    task: 'Make a commercial for Example Cleaning Co',
    brief: { ...sample, business_name: '<img src=x onerror=alert(1)>' }
  });
  const html = renderFallenCouncilWorkroom(proof);
  assert.match(html, /Creative Council/);
  assert.match(html, /56 registered council/);
  assert.match(html, /Source coverage held/);
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!html.includes('LIVE AGENT'));
});

test('unmatched tasks cannot dispatch Fallen council workers', async () => {
  await assert.rejects(
    runLocalCreativeCouncilPreview({ task: 'Calculate payroll', brief: sample }),
    /not_admitted_to_skill/
  );
});
