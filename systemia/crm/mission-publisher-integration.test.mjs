import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {SystemiaMissionPublisher} from '../organism/mission-publisher.mjs';
import {writeCrmHeartbeatArtifacts} from './heartbeat.mjs';

test('publisher refreshes CRM before EVERY sync and replaces prior data with hold after refresh failure',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'crm-publisher-'));
  const configPath=path.join(root,'sources.json'),ledgerPath=path.join(root,'publisher-ledger.json');
  const sourcePath=path.join(root,'crm','mission-snapshot.json');
  const now=new Date('2026-10-17T20:00:00Z');
  const pushed=[], yard={
    async pushMissionSnapshot(deploymentId,{sourceKey,snapshot}) {
      assert.equal(deploymentId,'kaidance-proof');
      assert.equal(sourceKey,'evercraft-company-crm');
      pushed.push(snapshot);
      return {receipt_hash:'synthetic:receipt:'+pushed.length};
    }
  };
  fs.writeFileSync(configPath,JSON.stringify({
    schema:'evercraft.kaidance.mission-fabric-config.v1',sources:[
      {source_key:'evercraft-company-crm',path:'crm/mission-snapshot.json',required:true,stale_after_seconds:900}
    ]
  }));
  let generation=0,fail=false;
  const publisher=new SystemiaMissionPublisher({
    yard,deploymentId:'kaidance-proof',configPath,ledgerPath,
    allowedRoot:root,clock:()=>now,
    beforeSourceRead:({sourceKey,sourcePath:location,now:instant})=>{
      assert.equal(sourceKey,'evercraft-company-crm');
      assert.equal(location,sourcePath);
      generation++;
      if(fail)throw Error('private failure that must not leak');
      writeCrmHeartbeatArtifacts({inputPath:'',outDir:path.dirname(sourcePath),now:instant,
        inputData:{schema:'evercraft.crm.heartbeat-input.v1',tenant_id:'evercraft',
          generated_at:instant.toISOString(),source_revision:'revision:'+generation,
          connectors:[{source_key:'interaction-ledger',state:'current',
            checked_at:instant.toISOString(),evidence_ref:'private'}],signals:[]}
      });
    }
  });
  try {
    const first=await publisher.syncOnce(now);
    assert.equal(first.status,'ok');assert.equal(first.pushed,1);
    assert.equal(generation,1);
    assert.ok(pushed[0].snapshot_ref.startsWith('sha256:'));
    const second=await publisher.syncOnce(now);
    assert.equal(second.status,'ok');assert.equal(second.pushed,1);
    assert.equal(generation,2);
    assert.notEqual(pushed[0].snapshot_ref,pushed[1].snapshot_ref);
    fail=true;
    const last=await publisher.syncOnce(now);
    assert.equal(generation,3);assert.equal(last.status,'degraded');
    assert.equal(last.sources[0].reason,'source_refresh_failed');
    assert.equal(last.pushed,1);
    assert.equal(pushed.at(-1).snapshot_ref,'publisher-hold:evercraft-company-crm:source_refresh_failed');
    assert.equal(JSON.stringify(last).includes('private failure'),false);
    assert.equal(fs.existsSync(sourcePath),true); // stale file exists but was not reused
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
