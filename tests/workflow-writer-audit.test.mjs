import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectWorkflow,assessWriterInventory,auditWorkflowFiles,inspectScopedStateWriterReview } from '../scripts/audit-workflow-writers.mjs';
import fs from 'node:fs';

const known='.github/workflows/known-publisher.yml';
const baseline={existing_direct_main_writers:[known]};
test('standard read-only canary never becomes a writer',()=>{
 const r=inspectWorkflow("name: Readonly\non: push\npermissions:\n  contents: read\nsteps:\n  - run: node scripts/test.mjs",'.github/workflows/read.yml');
 assert.equal(r.writer,false);assert.equal(r.has_push_command,false);
});
test('write-permitted direct main pusher identified, and current exception tracked',()=>{
 const r=inspectWorkflow("name: Publisher\non: workflow_dispatch\npermissions:\n  contents: write\nsteps:\n  - run: |\n      git add public/chum\n      git commit -m ready\n      if git push origin HEAD:main; then\n        exit 0\n      fi",known);
 assert.equal(r.writer,true);assert.equal(r.pushes_to_main,true);
 assert.equal(r.public_chum_staging_risk,true);
 assert.equal(assessWriterInventory([r],baseline).ok,true);
});
test('new workflow able to push to main fails closed',()=>{
 const writer=inspectWorkflow("permissions:\n  contents: write\nsteps:\n  - run: git push origin HEAD:main",'.github/workflows/new-writer.yml');
 const r=assessWriterInventory([writer],baseline);
 assert.equal(r.ok,false);
 assert.ok(r.findings.some(x=>x.code==='NEW_UNAPPROVED_WORKFLOW_WRITER'));
});
test('permissioned PR target and broad silent commercial buyer path staging fail',()=>{
 const r=inspectWorkflow("on:\n  pull_request_target:\npermissions:\n  contents: write\nsteps:\n  - run: |\n      git add public/.well-known/evercraft-payments-buyer-doors.json\n      git push origin HEAD:main",known);
 const result=assessWriterInventory([r],baseline);
 assert.ok(result.findings.some(x=>x.code==='UNTRUSTED_PR_TARGET_HAS_WRITE_AUTHORITY'));
 assert.ok(result.findings.some(x=>x.code==='DIRECT_STAGE_OF_PROTECTED_BUYER_CONTRACT'));
});
test('write-less shell push is still treated as a risky writer',()=>{
 const r=inspectWorkflow("permissions:\n  contents: read\nsteps:\n  - run: git push origin HEAD:main",known);
 assert.equal(r.writer,true);
 assert.ok(assessWriterInventory([r],baseline).findings.some(x=>x.code==='PUSH_WITHOUT_DECLARED_CONTENTS_WRITE'));
});
test('removing a legacy writer is allowed rather than requiring stale permissions',()=>{
 const r=assessWriterInventory([],baseline);
 assert.equal(r.ok,true);
 assert.deepEqual(r.retired_baseline_writers,[known]);
});

test('new unreviewed OIDC grant fails; existing OIDC grants remain separately inventoried',()=>{
 const r=inspectWorkflow(['permissions:', '  contents: read', '  id-token: write', 'steps:', '  - uses: actions/checkout@v4'].join(String.fromCharCode(10)),'.github/workflows/oidc-new.yml');
 assert.equal(r.writer,false);
 assert.equal(r.id_token_write,true);
 assert.equal(r.unpinned_action_references,1);
 const assessment=assessWriterInventory([r],{...baseline,existing_oidc_token_writers:[]});
 assert.equal(assessment.ok,false);
 assert.ok(assessment.findings.some(x=>x.code==='NEW_UNAPPROVED_OIDC_TOKEN_WRITER'));
});
test('real repository audit runs with no new unapproved main writer',()=>{
 const r=auditWorkflowFiles();
 assert.equal(r.ok,true,JSON.stringify(r.findings));
 assert.ok(r.workflow_count>=12);
 assert.ok(r.writers.every(x=>x.startsWith('.github/workflows/')));
 assert.ok(r.writers.includes('.github/workflows/chum-watershed.yml'));
 assert.ok(!r.writers.includes('.github/workflows/legacy-provider-purge.yml'));
});

test('Mossmere scope review is tied to exact code and cannot authorize changed workflows',()=>{
  const review=JSON.parse(fs.readFileSync(new URL('../audits/window-state-writer-review-2026-10-19.json',import.meta.url),'utf8'));
  const workflow=fs.readFileSync(new URL('../.github/workflows/window-upstream-heartbeat.yml',import.meta.url),'utf8');
  const runner=fs.readFileSync(new URL('../systemia/society/window-heartbeat.mjs',import.meta.url),'utf8');
  const verified=inspectScopedStateWriterReview(review,workflow,runner);
  assert.equal(verified.valid,true);
  const writer=inspectWorkflow(workflow,review.workflow);
  assert.equal(writer.writer,true);
  const admitted=assessWriterInventory([writer],baseline,{scopedReview:verified});
  assert.equal(admitted.ok,true);
  assert.equal(admitted.scoped_state_writer_review,review.workflow);
  for(const candidate of [
    inspectScopedStateWriterReview({...review,workflow_blob_sha:'unreviewed'},workflow,runner),
    inspectScopedStateWriterReview({...review,state_branch:'main'},workflow,runner),
    inspectScopedStateWriterReview(review,workflow+'\\n# changed without code review',runner),
    inspectScopedStateWriterReview(review,workflow,runner+'\\n// changed without code review'),
  ]) {
    assert.equal(candidate.valid,false);
    const blocked=assessWriterInventory([writer],baseline,{scopedReview:candidate});
    assert.equal(blocked.ok,false);
    assert.ok(blocked.findings.some(x=>x.code==='NEW_UNAPPROVED_WORKFLOW_WRITER'));
  }
  const unrelated=inspectWorkflow('permissions:\n  contents: write\n','.github/workflows/unreviewed-writer.yml');
  assert.ok(assessWriterInventory([unrelated],baseline,{scopedReview:verified}).findings
    .some(x=>x.code==='NEW_UNAPPROVED_WORKFLOW_WRITER'));
});

test('direct Mossmere heartbeat remains read-only and cannot silently resume writes',()=>{
  const workflow=fs.readFileSync(new URL('../.github/workflows/window-heartbeat.yml',import.meta.url),'utf8');
  assert.match(workflow,/^permissions:\n  contents: read/m);
  assert.doesNotMatch(workflow,/^\s*contents: write\s*$/m);
  assert.match(workflow,/WINDOW_DRY_RUN: 'true'/);
  const classification=inspectWorkflow(workflow,'.github/workflows/window-heartbeat.yml');
  assert.equal(classification.writer,false);
  assert.equal(classification.contents_write,false);
});
