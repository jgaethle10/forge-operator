import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readPrivateInteractionLedger} from './interaction-ledger-adapter.mjs';
import {writeCrmHeartbeatArtifacts} from './heartbeat.mjs';
import {KaidanceRuntime} from '../collider/runtime.mjs';

const start=new Date('2026-10-17T20:00:00Z');
const hash=x=>'sha256:'+createHash('sha256').update(JSON.stringify(x)).digest('hex');
function signed(event_id,extra={}) {
  const core={
    schema:'evercraft.interaction-ledger.event.v1',
    event_id,idempotency_key:event_id,
    subject_ref:'person:private-contact',
    channel:'email',direction:'system',
    event_type:'commitment_opened',content_fingerprint:null,
    commitment_ref:'promise:send-actual-work',due_at:'2026-10-17T19:00:00Z',
    evidence_ref:'private-evidence:'+event_id,
    occurred_at:'2026-10-17T18:00:00Z',recorded_at:'2026-10-17T18:00:00Z',
    raw_message_body_stored:false,...extra
  };
  return {...core,receipt_hash:hash(core)};
}
function writeEvents(root,items) {
  fs.writeFileSync(path.join(root,'interaction-events.jsonl'),items.map(x=>JSON.stringify(x)).join('\n')+'\n',{mode:0o600});
}
test('two KAIDANCE cycles consume changed private relationship state without outbound actions',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'crm-kaidance-'));
  const privateRoot=path.join(root,'private-ledger'), artifacts=path.join(root,'artifacts');
  const output=path.join(artifacts,'crm-heartbeat');
  fs.mkdirSync(privateRoot,{recursive:true,mode:0o700});
  fs.mkdirSync(artifacts,{recursive:true});
  try {
    writeEvents(privateRoot,[signed('open')]);
    const firstInput=readPrivateInteractionLedger(privateRoot,{now:start});
    const first=writeCrmHeartbeatArtifacts({inputData:firstInput,inputPath:'',outDir:output,now:start});
    assert.equal(first.report.coverage.open,1);
    const configPath=path.join(artifacts,'mission-sources.json');
    const config={schema:'evercraft.kaidance.mission-fabric-config.v1',
      sources:[{source_key:'evercraft-company-crm',path:'crm-heartbeat/mission-snapshot.json',
        required:true,stale_after_seconds:900}]};
    fs.writeFileSync(configPath,JSON.stringify(config),{mode:0o600});
    const runtime=new KaidanceRuntime({
      root:path.join(root,'runtime'),colliderKey:'crm-proof',
      heartbeatTargetSeconds:300,graceSeconds:120,
      deploymentReceipt:'synthetic:integration-test',
      missionFabricConfigPath:configPath,missionFabricAllowedRoot:artifacts,
      clock:()=>start
    });
    const one=await runtime.runOnce(start);
    assert.equal(one.ok,true);
    assert.equal(one.cycle.counts.held,5); // 1 overdue promise and four explicitly unavailable divisions
    assert.equal(one.health.mission_fabric_degraded_required_sources,0);
    assert.equal(one.cycle.counts.admitted,0);

    const twoAt=new Date(start.getTime()+301000);
    writeEvents(privateRoot,[signed('open'),signed('closed',{
      event_type:'commitment_fulfilled',direction:'system',due_at:null,
      occurred_at:'2026-10-17T20:01:00Z',recorded_at:'2026-10-17T20:01:00Z'
    })]);
    const secondInput=readPrivateInteractionLedger(privateRoot,{now:twoAt});
    const second=writeCrmHeartbeatArtifacts({inputData:secondInput,inputPath:'',outDir:output,now:twoAt});
    assert.equal(second.report.coverage.open,0);
    const next=await runtime.runOnce(twoAt);
    assert.equal(next.ok,true);
    assert.equal(next.cycle.counts.held,4); // Only genuinely unconnected systems remain held
    assert.notEqual(one.coverageReceipt.receipt_key,next.coverageReceipt.receipt_key);
    const publicArtifacts=fs.readFileSync(path.join(output,'latest.json'),'utf8')+
      fs.readFileSync(path.join(output,'mission-snapshot.json'),'utf8');
    assert.equal(publicArtifacts.includes('person:private-contact'),false);
    assert.equal(publicArtifacts.includes('promise:send-actual-work'),false);
    assert.equal(publicArtifacts.includes('private-evidence:'),false);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
