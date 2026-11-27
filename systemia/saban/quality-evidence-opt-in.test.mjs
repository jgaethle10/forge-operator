import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {analyzeSalesCsv,checkSalesReport} from '../../public/work-saban/report/engine.mjs';
import {evaluateSwarmQuality} from './quality-gate.mjs';

const csv='month,revenue\n2026-10,10.00\n2026-11,14.50\n';
const sha=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
const mission='saban-shadow-mission-204';

function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-opt-in-quality-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const summary=analyzeSalesCsv(csv);
  const analyst=JSON.stringify(summary)+'\n';
  const auditor=JSON.stringify({
    schema:'evercraft.saban.shadow-audit.v1',
    source_sha256:sha(csv),analyst_sha256:sha(analyst),passed:true,
  })+'\n';
  fs.writeFileSync(path.join(root,'analyst.json'),analyst);
  fs.writeFileSync(path.join(root,'auditor.json'),auditor);
  const entries=[
    {role:'analyst',agent_id:'analyst-worker-1',task_id:mission+':analyst',
      idempotency_key:'saban:'+mission+':analyst',
      relative_path:'analyst.json',expected_sha256:sha(analyst),expected_bytes:Buffer.byteLength(analyst)},
    {role:'auditor',agent_id:'auditor-worker-2',task_id:mission+':auditor',
      idempotency_key:'saban:'+mission+':auditor',
      relative_path:'auditor.json',expected_sha256:sha(auditor),expected_bytes:Buffer.byteLength(auditor)},
  ];
  return {
    root,csvText:csv,
    manifest:{mission_id:mission,source_sha256:sha(csv),entries},
    workerReports:entries.map(e=>({
      mission_id:mission,role:e.role,task_id:e.task_id,agent_id:e.agent_id,
      idempotency_key:e.idempotency_key,source_sha256:sha(csv),
      status:'completed',verified:true,
    })),
  };
}
const plan={roles:['analyst','auditor'],logical_agents:2};
const results=[{role:'analyst'},{role:'auditor'}];
const schedulerSummary={total:2,counts:{completed:2,dead_letter:0}};
function quality({enabled=false,evidence=null,extraQuality={}}={}){
  return evaluateSwarmQuality({
    contract:{quality:{...(enabled?{require_shadow_sales_evidence:true}:{}),...extraQuality}},
    plan,results,schedulerSummary,shadowSalesEvidence:evidence,
  });
}

test('legacy Saban contracts preserve receipt-only outcome',()=>{
  const r=quality();
  assert.equal(r.status,'pass');
  assert.equal(r.enforcement,'receipt_only');
  assert.equal(Object.hasOwn(r,'shadow_sales_evidence'),false);
});

test('explicit opt-in without source or artifacts fails execution',()=>{
  const r=quality({enabled:true});
  assert.equal(r.status,'fail');
  assert.equal(r.enforcement,'fail_execution');
  assert.equal(r.failures.some(f=>f.code==='shadow_sales_evidence_required'),true);
  assert.equal(r.shadow_sales_evidence.status,'hold');
});

test('opted-in two-role deterministic source and outputs pass shadow quality',t=>{
  const r=quality({enabled:true,evidence:fixture(t)});
  assert.equal(r.status,'pass');
  assert.equal(r.enforcement,'fail_execution');
  assert.equal(r.shadow_sales_evidence.status,'shadow_artifacts_reconciled');
  assert.equal(r.shadow_sales_evidence.verified_artifacts,2);
  assert.equal(r.shadow_sales_evidence.deterministic_sales_check_passed,true);
  assert.equal(r.shadow_sales_evidence.independent_worker_identity_verified,false);
  assert.equal(r.shadow_sales_evidence.live_systemia_admission_verified,false);
});

test('receipt-only override cannot disable fail execution on opt-in',()=>{
  const r=quality({enabled:true,extraQuality:{enforcement:'receipt_only'}});
  assert.equal(r.status,'fail');
  assert.equal(r.enforcement,'fail_execution');
});

test('worker-reported completed and verified cannot replace a missing output',t=>{
  const f=fixture(t);
  fs.rmSync(path.join(f.root,'auditor.json'));
  const r=quality({enabled:true,evidence:f});
  assert.equal(r.status,'fail');
  assert.equal(r.shadow_sales_evidence.verified_artifacts,1);
});

test('a valid receipt cannot conceal a changed artifact',t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.root,'analyst.json'),'{}\n');
  assert.equal(quality({enabled:true,evidence:f}).status,'fail');
});

test('same byte sizes and malicious replacement still fail hash verification',t=>{
  const f=fixture(t);
  const fn=path.join(f.root,'auditor.json');
  const old=fs.readFileSync(fn,'utf8');
  const changed=old.replace('"passed":true','"passed":null');
  fs.writeFileSync(fn,changed.padEnd(Buffer.byteLength(old),' '));
  assert.equal(quality({enabled:true,evidence:f}).status,'fail');
});

test('wrong source hash or mismatched idempotency holds',t=>{
  const f=fixture(t);
  f.workerReports[1].idempotency_key='saban:wrong-task';
  assert.equal(quality({enabled:true,evidence:f}).status,'fail');
});

test('shadow quality does not override ordinary scheduler failures',t=>{
  const r=evaluateSwarmQuality({
    contract:{quality:{require_shadow_sales_evidence:true}},
    plan,results,schedulerSummary:{total:2,counts:{completed:1,dead_letter:1}},
    shadowSalesEvidence:fixture(t),
  });
  assert.equal(r.status,'fail');
  assert.equal(r.failures.some(f=>f.code==='completion_ratio_below_contract'),true);
});

test('quality receipt excludes customer CSV and raw worker output',t=>{
  const r=quality({enabled:true,evidence:fixture(t)});
  const json=JSON.stringify(r);
  assert.equal(json.includes(csv),false);
  assert.equal(json.includes('month,revenue'),false);
  assert.equal(json.includes('workerReports'),false);
  assert.match(json,/source_sha256/);
});

test('opt-in must have distinct analyst and auditor roles',t=>{
  const f=fixture(t);f.manifest.entries[1].role='analyst';
  const r=quality({enabled:true,evidence:f});
  assert.equal(r.status,'fail');
  assert.equal(r.shadow_sales_evidence.status,'hold');
});

test('quality remains opt-in despite malformed supplied evidence',t=>{
  const f=fixture(t);f.manifest.entries[0].role='hacker';
  const r=quality({enabled:false,evidence:f});
  assert.equal(r.status,'pass');
  assert.equal(r.enforcement,'receipt_only');
});
