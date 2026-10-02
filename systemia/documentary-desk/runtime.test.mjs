import test from 'node:test';
import assert from 'node:assert/strict';
import { compileDocumentaryPlan, assertDocumentaryReleaseReady, DOCUMENTARY_QA_GATES } from './runtime.mjs';
import { assertOwnedDocumentaryRuntime, documentaryExecutionLanes } from './owned-runtime.mjs';

function baseBrief() {
  return {
    id: 'doc-proof-001',
    title: 'Proof Film',
    logline: 'A proof fixture for the Evercraft Documentary Desk.',
    targetRuntimeMinutes: 18,
    evidence: [{
      id: 'claim-1',
      claim: 'A documented event occurred.',
      state: 'documented',
      confidence: 0.98,
      sources: [{ ref: 'source:official-1', authority: 'primary', rights: 'public_domain' }],
    }],
    visuals: [{
      id: 'visual-1',
      type: 'document',
      sourceRef: 'source:official-1',
      evidenceRefs: ['claim-1'],
      rights: 'public_domain',
    }],
    chapters: [{
      id: 'chapter-1',
      title: 'What happened',
      evidenceRefs: ['claim-1'],
      visualRefs: ['visual-1'],
    }],
  };
}

test('compiles an evidence-governed plan on owned runtimes only', () => {
  const plan = compileDocumentaryPlan(baseBrief());
  assert.equal(plan.schema, 'evercraft.documentary-desk.plan.v2');
  assert.equal(plan.systemia.runtimeAuthority, 'Evercraft-owned Systemia/Yard runtime only');
  assert.equal(plan.systemia.externalLegacyRuntimeAllowed, false);
  assert.equal(plan.systemia.ownedRuntimeReceipt.status, 'accepted');
  assert.equal(plan.outputs.socialCuts.intake, 'systemia/clip/media-intake.mjs');
  assert.equal(plan.outputs.socialCuts.publisher, 'systemia/clip/publisher-runtime.mjs');
  assert.equal(plan.qa.gates.length, DOCUMENTARY_QA_GATES.length);
  assert.equal(/base44/i.test(JSON.stringify(plan)), false);
});

test('owned runtime topology rejects remote or legacy-host targets', () => {
  assert.equal(assertOwnedDocumentaryRuntime(documentaryExecutionLanes()).status, 'accepted');
  assert.throws(() => assertOwnedDocumentaryRuntime([
    { lane: 'bad', runtime: 'evercraft_owned', modules: ['https://example.invalid/runtime'] },
  ]), /remote_runtime_dependency/);
  assert.throws(() => assertOwnedDocumentaryRuntime([
    { lane: 'bad', runtime: 'evercraft_owned', modules: ['systemia/base44/legacy.mjs'] },
  ]), /legacy_host_dependency/);
});

test('blocks synthetic visuals from acting as factual evidence', () => {
  const brief = baseBrief();
  brief.visuals = [{
    id: 'visual-ai',
    type: 'generated_visualization',
    evidenceRefs: ['claim-1'],
    rights: 'owned',
  }];
  brief.chapters[0].visualRefs = ['visual-ai'];
  const plan = compileDocumentaryPlan(brief);
  assert.equal(plan.qa.releaseState, 'blocked');
  assert.ok(plan.qa.warnings.some((w) => w.code === 'SYNTHETIC_EVIDENCE_BINDING'));
});

test('rejects unknown evidence references', () => {
  const brief = baseBrief();
  brief.chapters[0].evidenceRefs = ['missing-claim'];
  assert.throws(() => compileDocumentaryPlan(brief), /references unknown evidence/);
});

test('release receipt stays closed until QA passes', () => {
  const plan = compileDocumentaryPlan(baseBrief());
  assert.throws(() => assertDocumentaryReleaseReady(plan), /not release-ready/);
  plan.qa.gates = plan.qa.gates.map((gate) => ({ ...gate, status: 'passed' }));
  plan.qa.warnings = [];
  const receipt = assertDocumentaryReleaseReady(plan);
  assert.equal(receipt.status, 'release_ready');
  assert.equal(receipt.runtimeAuthority, 'evercraft_owned');
});
