import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {analyzeSalesCsv,checkSalesReport} from '../../public/work-saban/report/engine.mjs';
import {reconcileShadowSalesDelegation} from './shadow-delegated-sales-reconciliation.mjs';
import {EvercraftRemoteOperator} from '../compute/remote-operator.mjs';

const CSV='month,revenue\n2026-09,10.00\n2026-10,20.50\n';
const sha=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const mission='synthetic-sales-204';

function fixture(t,{tamperSummary=false,lieAboutAudit=false}={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-shadow-sales-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  // Coordinator's exact expected bytes are determined before the simulated
  // workers write output; this is NOT a live independent agent demonstration.
  const summary=analyzeSalesCsv(CSV);
  if(tamperSummary)summary.totalCents='999999';
  const analystBytes=JSON.stringify(summary)+'\n';
  const expectedAnalyst=sha(analystBytes);
  const audit={
    schema:'evercraft.saban.shadow-audit.v1',
    source_sha256:sha(CSV),
    analyst_sha256:expectedAnalyst,
    passed:lieAboutAudit?true:checkSalesReport(CSV,summary),
  };
  const auditorBytes=JSON.stringify(audit)+'\n';
  const entries=[
    {role:'analyst',agent_id:'worker-analyst-1',task_id:mission+':analyst',
      idempotency_key:'saban:'+mission+':analyst',
      relative_path:'analyst.json',expected_sha256:expectedAnalyst,
      expected_bytes:Buffer.byteLength(analystBytes)},
    {role:'auditor',agent_id:'worker-auditor-2',task_id:mission+':auditor',
      idempotency_key:'saban:'+mission+':auditor',
      relative_path:'auditor.json',expected_sha256:sha(auditorBytes),
      expected_bytes:Buffer.byteLength(auditorBytes)},
  ];
  const manifest={mission_id:mission,source_sha256:sha(CSV),entries};
  const workerReports=entries.map(e=>({
    mission_id:mission,role:e.role,task_id:e.task_id,
    agent_id:e.agent_id,idempotency_key:e.idempotency_key,
    source_sha256:sha(CSV),status:'completed',verified:true,
  }));
  // Synthetic worker writes: deterministic fixtures, no LLMs, shell or network.
  fs.writeFileSync(path.join(root,'analyst.json'),analystBytes);
  fs.writeFileSync(path.join(root,'auditor.json'),auditorBytes);
  return {root,csvText:CSV,manifest,workerReports};
}
const check=x=>reconcileShadowSalesDelegation(x);

test('two distinct shadow worker receipts, real artifact bytes and arithmetic reconcile',t=>{
  const r=check(fixture(t));
  assert.equal(r.status,'shadow_artifacts_reconciled');
  assert.equal(r.verified_artifacts,2);
  assert.equal(r.deterministic_sales_check_passed,true);
  assert.equal(r.runtime_dispatched,false);
  assert.equal(r.independent_worker_identity_verified,false);
  assert.equal(r.live_systemia_admission_verified,false);
  assert.deepEqual(r.roles.map(x=>x.role),['analyst','auditor']);
});

test('self-reported completion cannot substitute for missing auditor artifact',t=>{
  const f=fixture(t);fs.rmSync(path.join(f.root,'auditor.json'));
  const r=check(f);
  assert.equal(r.status,'hold');
  assert.equal(r.verified_artifacts,1);
  assert.match(r.reason,/artifact_auditor_artifact_missing/);
});

test('changed analyst output after declaration holds',t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.root,'analyst.json'),'{"totalCents":"9"}\n');
  assert.equal(check(f).status,'hold');
});

test('false but predeclared analyst total fails arithmetic independent of hashes',t=>{
  const r=check(fixture(t,{tamperSummary:true,lieAboutAudit:true}));
  assert.equal(r.status,'hold');
  assert.equal(r.reason,'independent_sales_arithmetic_failed');
});

test('auditor cannot claim pass over an unrelated source',t=>{
  const f=fixture(t);f.manifest.source_sha256=sha('other');
  assert.equal(check(f).reason,'source_identity_mismatch');
});

test('report for wrong agent cannot claim another registered role',t=>{
  const f=fixture(t);f.workerReports[1].agent_id='worker-analyst-1';
  assert.equal(check(f).reason,'worker_report_binding_mismatch');
});

test('duplicate worker reports fail closed',t=>{
  const f=fixture(t);f.workerReports[1]=f.workerReports[0];
  assert.equal(check(f).reason,'duplicate_or_missing_worker_report');
});

test('duplicate idempotency and cross-mission assignment denied',t=>{
  const f=fixture(t);
  f.manifest.entries[1].idempotency_key=f.manifest.entries[0].idempotency_key;
  assert.equal(check(f).reason,'assignment_binding_mismatch');
});

test('path traversal never returns artifact success',t=>{
  const f=fixture(t);f.manifest.entries[0].relative_path='../analyst.json';
  assert.equal(check(f).status,'hold');
});

test('symlinked worker artifact never returns success',t=>{
  const f=fixture(t);
  fs.renameSync(path.join(f.root,'analyst.json'),path.join(f.root,'actual.json'));
  fs.symlinkSync('actual.json',path.join(f.root,'analyst.json'));
  assert.equal(check(f).status,'hold');
});

test('repeat read is stable and does not dispatch or create another worker',t=>{
  const f=fixture(t);
  const first=check(f),second=check(f);
  assert.deepEqual(first,second);
  assert.equal(second.runtime_dispatched,false);
});

test('auditor false while arithmetic true holds even if bytes are declared',t=>{
  const f=fixture(t);
  const audit={
    schema:'evercraft.saban.shadow-audit.v1',source_sha256:sha(CSV),
    analyst_sha256:f.manifest.entries[0].expected_sha256,passed:false,
  };
  const bytes=JSON.stringify(audit)+'\n';
  fs.writeFileSync(path.join(f.root,'auditor.json'),bytes);
  Object.assign(f.manifest.entries[1],{expected_sha256:sha(bytes),expected_bytes:Buffer.byteLength(bytes)});
  assert.equal(check(f).reason,'auditor_claim_binding_mismatch');
});


function attachVerifiedRemoteSource(t, f) {
  // The existing Remote Operator supplies real bounded pages from a local
  // file; no agent, network call, synthetic signature or customer source.
  fs.writeFileSync(path.join(f.root, 'source.csv'), CSV);
  const operator = new EvercraftRemoteOperator({
    roots: { home: f.root },
    stateDir: path.join(f.root, 'remote-operator-state'),
  });
  const sourcePages = [];
  let offset = 0;
  while (offset !== null) {
    const page = operator.read({
      root_key: 'home', path: 'source.csv', encoding: 'base64',
      max_bytes: 9, offset_bytes: offset,
      ...(offset ? { expected_sha256: sha(CSV) } : {}),
    });
    sourcePages.push(page);
    offset = page.next_offset_bytes;
    assert.ok(sourcePages.length < 100);
  }
  f.manifest.source_observation = {
    source_id: 'saban-sales-csv', root_key: 'home', relative_path: 'source.csv',
  };
  f.sourcePages = sourcePages;
  return f;
}

test('existing two-role reconciliation accepts complete verified remote source bytes', t => {
  const f = attachVerifiedRemoteSource(t, fixture(t));
  const r = check(f);
  assert.equal(r.status, 'shadow_artifacts_reconciled');
  assert.equal(r.remote_source_observation_status, 'source_bytes_verified');
  assert.equal(r.remote_source_pages_verified, f.sourcePages.length);
  assert.equal(r.verified_artifacts, 2);
  assert.equal(r.deterministic_sales_check_passed, true);
  assert.equal(r.remote_node_identity_attested, false);
  assert.equal(r.live_systemia_admission_verified, false);
});

test('verified analyst and auditor cannot overcome incomplete source pagination', t => {
  const f = attachVerifiedRemoteSource(t, fixture(t));
  f.sourcePages.pop();
  const r = check(f);
  assert.equal(r.status, 'hold');
  assert.equal(r.reason, 'source_observation_source_read_incomplete');
  assert.equal(r.verified_artifacts, 0);
});

test('source observation declared but pages absent never bypasses gate', t => {
  const f = attachVerifiedRemoteSource(t, fixture(t));
  delete f.sourcePages;
  const r = check(f);
  assert.equal(r.reason, 'source_observation_pages_required_or_limit_exceeded');
});

test('remote page tampering holds even if both workers claim verified', t => {
  const f = attachVerifiedRemoteSource(t, fixture(t));
  f.sourcePages[0].content = Buffer.from('ABC').toString('base64');
  const r = check(f);
  assert.equal(r.reason, 'source_observation_page_content_integrity_mismatch');
});

test('remote page bound to different root/path cannot satisfy mission', t => {
  const f = attachVerifiedRemoteSource(t, fixture(t));
  f.manifest.source_observation.relative_path = 'different.csv';
  const r = check(f);
  assert.equal(r.reason, 'source_observation_page_identity_binding_mismatch');
});

test('source pages supplied without coordinator source observation binding hold', t => {
  const f = attachVerifiedRemoteSource(t, fixture(t));
  delete f.manifest.source_observation;
  const r = check(f);
  assert.equal(r.reason, 'source_observation_binding_missing');
});

test('legacy shadow reconciliation still works without remote source declaration', t => {
  const r = check(fixture(t));
  assert.equal(r.status, 'shadow_artifacts_reconciled');
  assert.equal(r.remote_source_observation_status, 'not_requested');
  assert.equal(r.remote_source_pages_verified, 0);
});
