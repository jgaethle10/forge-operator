import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runAssignment, reconcile } from '../systemia/saban/work-skills/commercial-adapter.mjs';

const actualWorkerPresent = existsSync(fileURLToPath(new URL('../systemia/saban/registered-worker.mjs', import.meta.url)));
const runLocal = async input => {
  const { runLocalCommercialBrief } = await import('../systemia/saban/work-skills/run-local.mjs');
  return runLocalCommercialBrief(input);
};
const contract = {
  software_id: 'work-saban-commercial-brief',
  roles: ['research', 'creative', 'production', 'review'],
  side_effects: { default: 'deny' }
};
const example = {
  business_name: 'Example Cleaning Co', audience: 'Busy households',
  call_to_action: 'Request an estimate', duration_seconds: 30,
  claims: [{ text: 'We clean offices', evidence_ref: '' }],
  approved_assets: [{ id: 'old-commercial', rights_status: 'cleared', license_ref: 'user-ledger-1', used_in_prior_commercial: true }]
};
const assignment = (role, brief = example, prior_receipts = []) => ({
  agent_id: 'test-' + role, role, work: { type: 'draft_commercial_brief' },
  item: { raw: { brief, prior_receipts } }
});

test('commercial worker creates a research draft and flags unverified evidence', async () => {
  const r = await runAssignment({ assignment: assignment('research'), contract });
  assert.equal(r.status, 'completed_with_holds');
  assert.equal(r.local_draft_created, true);
  assert.equal(r.output.claims[0].independently_verified, false);
  assert.ok(r.findings.includes('asset_rights_not_cleared'));
  assert.ok(r.findings.includes('claim_evidence_missing'));
  assert.equal(r.output.assets[0].eligible_for_use, false);
  assert.equal(r.external_effects_performed, false);
});

test('creative and production generate structured outlines, not pretend media', async () => {
  const c = await runAssignment({ assignment: assignment('creative'), contract });
  const p = await runAssignment({ assignment: assignment('production'), contract });
  assert.equal(c.output.storyboard.length, 4);
  assert.equal(c.output.script_status, 'outline_only_unapproved');
  assert.equal(p.output.delivery_state, 'shot_list_only_no_media_created');
  assert.equal(p.video_or_audio_rendered, false);
});

test('review holds release when actual prior receipts and assets are missing', async () => {
  const r = await runAssignment({ assignment: assignment('review'), contract });
  assert.equal(r.output.final_advertisement_ready, false);
  assert.ok(r.findings.includes('required_role_receipt_missing:creative'));
  assert.equal(r.output.approval_state, 'held');
});

test('contract and payload tampering fail closed', async () => {
  await assert.rejects(runAssignment({ assignment: assignment('creative'),
    contract: { ...contract, side_effects: { default: 'allow' } } }), /unsafe_role/);
  await assert.rejects(runAssignment({ assignment: assignment('payment'), contract }), /unsafe_role/);
  await assert.rejects(runAssignment({ assignment: { ...assignment('research'), item: { raw: { what: 'anything' } } }, contract }), /invalid_brief_payload/);
});

test('reconciliation records completed role invocations without certifying delivery', async () => {
  const results = [];
  for (const role of contract.roles) {
    results.push({ role, result: await runAssignment({ assignment: assignment(role, example, results), contract }) });
  }
  const r = await reconcile({ results, plan: { roles: contract.roles } });
  assert.equal(r.status, 'reconciled_with_holds');
  assert.equal(r.actual_local_role_invocations, 4);
  assert.equal(r.video_rendered, false);
  assert.equal(r.final_delivery_ready, false);
});

test('real Saban registered-worker path executes four bounded roles and emits receipt', { skip: !actualWorkerPresent }, async () => {
  const receipt = await runLocal({
    task: 'Create a narrated commercial for Example Cleaning Co', brief: example
  });
  assert.equal(receipt.state, 'drafts_produced_held');
  assert.equal(receipt.worker_receipts.length, 4);
  for (const [i, role] of contract.roles.entries()) {
    assert.equal(receipt.worker_receipts[i].schema, 'evercraft.saban.registered-worker-receipt.v1');
    assert.equal(receipt.worker_receipts[i].role, role);
    assert.equal(receipt.worker_receipts[i].result.local_draft_created, true);
  }
  assert.equal(receipt.generated_video, false);
  assert.equal(receipt.external_effects_performed, false);
  assert.equal(receipt.publication_performed, false);
  assert.match(receipt.receipt_sha256, /^[a-f0-9]{64}$/);
});

test('local execution rejects unrelated request', { skip: !actualWorkerPresent }, async () => {
  await assert.rejects(runLocal({ task: 'Conduct payroll', brief: example }), /not_admitted_to_skill/);
});


test('read-only workroom safely renders actual statuses without script injection', async () => {
  const { renderLocalWorkroom } = await import('../systemia/saban/work-skills/workroom.mjs');
  const receipt = {
    schema:'evercraft.work-saban.local-commercial-run-receipt.v1',
    state:'drafts_produced_held',role_count:1,receipt_sha256:'abc',
    worker_receipts:[{role:'research',result:{status:'completed_with_holds',
      findings:['<img src=x onerror=alert(1)>'],output:{name:'<script>alert(1)</script>'}}}],
    reconciliation:{findings:['unverified']},next_gate:'owner_review'
  };
  const html=renderLocalWorkroom(receipt);
  assert.match(html,/Research/);
  assert.match(html,/held/);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('running'));
});
