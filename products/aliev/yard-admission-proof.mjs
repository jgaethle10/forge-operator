import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startEvercraftComputeNode } from '../../systemia/compute/runtime-node.mjs';
import { YardOperator } from '../../systemia/yard/operator.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'aliev-yard-proof-'));
const node=await startEvercraftComputeNode({root:path.join(root,'compute'),nodeId:'aliev-yard-proof'});
const yard=new YardOperator({stateDir:path.join(root,'yard')});
try{
  const releaseRef='11d16e6eddb4ad08bbea940f02bafeab06c91f5f';
  const d=await yard.deployRelease({
    deploymentId:'aliev-rivet-report-proof',
    releaseRef,
    workloadClass:'aliev.rivet-report-snapshot.v1',
    capacityEndpoint:node.endpoint,
    input:{address:'6405 W Chestnut Ave, Yakima, WA 98908',mode:'rivet_report_snapshot'},
    rollbackTarget:'rivet-base44-compatibility-adapter'
  });
  assert.equal(d.state,'ready');
  assert.equal(d.result?.schema,'evercraft.aliev.rivet-report-snapshot.v1');
  assert.equal(d.result?.state,'adapter_required');
  assert.equal(d.result?.evidence_state,'not_executed');
  assert.ok(d.receipt?.workload_receipt_hash);
  const verified=yard.verifyDeployment('aliev-rivet-report-proof');
  assert.equal(verified.ok,true);
  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.aliev.yard-admission-proof.v1',
    workload:'aliev.rivet-report-snapshot.v1',
    bounded_mode:true,
    immutable_release:true,
    fabricated_intelligence:false,
    deployment_receipt:d.receipt.receipt_hash,
    workload_receipt:d.receipt.workload_receipt_hash
  },null,2));
}finally{
  await node.close();
  fs.rmSync(root,{recursive:true,force:true});
}
