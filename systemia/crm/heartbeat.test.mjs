import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildCrmHeartbeat,writeCrmHeartbeatArtifacts} from './heartbeat.mjs';
const now=new Date('2026-10-17T20:00:00Z');
const input=()=>({schema:'evercraft.crm.heartbeat-input.v1',tenant_id:'evercraft',
  generated_at:'2026-10-17T19:59:00Z',source_revision:'opaque_revision_42',
  connectors:[{source_key:'interaction-ledger',state:'current',checked_at:'2026-10-17T19:59:00Z',evidence_ref:'private:receipt:1'}],
  signals:[{signal_key:'hidden-contact-abc',domain:'relationships',kind:'commitment_overdue',
    state:'open',severity:'high',evidence_state:'verified',observed_at:'2026-10-17T19:58:00Z',
    due_at:'2026-10-17T18:00:00Z',email:'sensitive@example.com',notes:'Do not leak me'}]});
test('sanitized holds, no action authority and valid KAIDANCE counters',()=>{
  const {report,snapshot}=buildCrmHeartbeat(input(),{now});
  assert.equal(report.coverage.due,1); assert.equal(report.domains.relationships.held,1);
  assert.deepEqual(snapshot.counts,{scanned:2,changed:1,admitted:0,held:1});
  assert.equal(report.contact_permission_granted,false);
  const data=JSON.stringify({report,snapshot});
  for(const word of ['sensitive@example.com','hidden-contact-abc','Do not leak me','private:receipt:1','opaque_revision_42']) assert.equal(data.includes(word),false);
});
test('resolved signal does not open an actionable hold',()=>{
  const x=input(); x.signals[0].state='resolved';
  assert.deepEqual(buildCrmHeartbeat(x,{now}).snapshot.counts,{scanned:2,changed:0,admitted:0,held:0});
});
test('connector failure produces review hold',()=>{
  const x=input();x.connectors[0].state='unavailable';
  const r=buildCrmHeartbeat(x,{now});
  assert.equal(r.report.state,'degraded'); assert.equal(r.snapshot.counts.held,2);
});
test('stale source is refused',()=>{
  const x=input();x.generated_at='2026-10-17T18:00:00Z';
  assert.throws(()=>buildCrmHeartbeat(x,{now}),/crm_source_stale_or_future/);
});
test('duplicate keys and invalid domains rejected',()=>{
  const x=input();x.signals.push({...x.signals[0]});
  assert.throws(()=>buildCrmHeartbeat(x,{now}),/duplicate/);
  const y=input();y.signals[0].domain='unknown';
  assert.throws(()=>buildCrmHeartbeat(y,{now}),/domain_invalid/);
});
test('unconfigured source produces explicit sanitized hold',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-crm-'));
  const r=writeCrmHeartbeatArtifacts({inputPath:'',outDir:root,now});
  assert.equal(r.report.reason,'source_not_configured');
  assert.equal(r.snapshot.counts.held,1);
  assert.ok(fs.existsSync(path.join(root,'mission-snapshot.json')));
  fs.rmSync(root,{recursive:true,force:true});
});
test('private source is reread on each cycle',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-crm-'));
  const file=path.join(root,'source.json');
  fs.writeFileSync(file,JSON.stringify(input()),{mode:0o600});
  const a=writeCrmHeartbeatArtifacts({inputPath:file,outDir:path.join(root,'output'),now});
  assert.equal(a.report.coverage.due,1);
  const next=input();next.signals=[];
  fs.writeFileSync(file,JSON.stringify(next),{mode:0o600});
  const b=writeCrmHeartbeatArtifacts({inputPath:file,outDir:path.join(root,'output'),now});
  assert.equal(b.report.coverage.due,0);
  fs.rmSync(root,{recursive:true,force:true});
});
