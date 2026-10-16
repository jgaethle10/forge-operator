import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  validateFabricDeploymentProof,
  startFabricLocalRuntime,
} from '../systemia/mcp/fabric-local-runtime.mjs';

const release='a'.repeat(40);
const instance='fabric_local_'+'b'.repeat(20);
function makeProof(){
  const proof={
    schema:'evercraft.fabric.deployment-proof.v1',
    source_release_ref:release,
    instance_id:instance,
    observed_at:'2026-10-16T15:30:00.000Z',
  };
  return {...proof,receipt_hash:'sha256:'+crypto.createHash('sha256').update(JSON.stringify(proof)).digest('hex')};
}
test('only matching instance-bound and release-bound deployment proof validates',()=>{
  const p=makeProof();
  assert.equal(validateFabricDeploymentProof(p,{sourceReleaseRef:release,instanceId:instance}),p.receipt_hash);
  assert.equal(validateFabricDeploymentProof(p,{sourceReleaseRef:'c'.repeat(40),instanceId:instance}),null);
  assert.equal(validateFabricDeploymentProof(p,{sourceReleaseRef:release,instanceId:'fabric_local_'+'d'.repeat(20)}),null);
  assert.equal(validateFabricDeploymentProof({...p,receipt_hash:'sha256:'+'0'.repeat(64)},{sourceReleaseRef:release,instanceId:instance}),null);
  assert.equal(validateFabricDeploymentProof({...p,observed_at:'not-a-date'},{sourceReleaseRef:release,instanceId:instance}),null);
  assert.equal(validateFabricDeploymentProof({...p,source_release_ref:'c'.repeat(40)},{sourceReleaseRef:release,instanceId:instance}),null);
  assert.equal(validateFabricDeploymentProof(null,{sourceReleaseRef:release,instanceId:instance}),null);
});
test('a local Fabric process cannot self-attest merely because its release marker exists',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fabric-unattested-'));
  const releaseFile=path.join(dir,'runtime-release-ref');
  fs.writeFileSync(releaseFile,release+'\n');
  const runtime=await startFabricLocalRuntime({host:'127.0.0.1',port:0,faieSurfaceEnabled:false,catalog:[],releaseRefFile:releaseFile});
  try{
    const h=await fetch(runtime.url+'/health').then(r=>r.json());
    assert.equal(h.source_release_ref_bound,true);
    assert.equal(h.deployment_receipt_bound,false);
    assert.equal(h.deployment_receipt_source,null);
    assert.equal(h.deployment_receipt_ref,null);
  }finally{
    await runtime.close();
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
test('owned updater issues a root-owned runtime proof only after resident verification',()=>{
  const s=fs.readFileSync('scripts/update-fabric-owned-edge.sh','utf8');
  assert.match(s,/RUNTIME_DEPLOYMENT_PROOF_FILE="\$STATE_DIR\/runtime-deployment-proof\.json"/);
  assert.match(s,/install -o root -g "\$RUN_USER" -m 0640 "\$tmp" "\$RUNTIME_DEPLOYMENT_PROOF_FILE"/);
  assert.match(s,/h\.source_release_ref_bound!==true/);
  assert.match(s,/source_release_ref:ref/);
  assert.match(s,/instance_id:h\.instance_id/);
  assert.match(s,/h\.deployment_receipt_source!=='owned_updater_verified'/);
  assert.match(s,/rm -f "\$RUNTIME_DEPLOYMENT_PROOF_FILE"/);
  for(const expected of ['before','target']){
    const branch=s.indexOf(expected==='before'?'if [[ "$before" == "$target" ]]':'rollback() {');
    const verified=s.indexOf('verify_current_runtime "$expected_count" "$'+expected+'"',branch);
    const proof=s.indexOf('write_runtime_deployment_proof "$'+expected+'"',branch);
    assert.ok(verified!==-1&&proof>verified,'deployment proof must follow independent resident verification');
  }
});
