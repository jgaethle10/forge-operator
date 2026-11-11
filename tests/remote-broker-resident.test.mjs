import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {startNodeSeed} from '../systemia/compute/node-seed.mjs';
import {
  startPrivateBroker,loopbackFromReceipt,verifyCapacity,verifyBrokerHealth,
} from '../systemia/yard/remote-broker-resident.mjs';

const fingerprint='sha256:'+'a'.repeat(64);
const receipt={
  schema:'evercraft.compute.nodeseed-receipt.v1',
  node_id:'test-node',device_fingerprint:fingerprint,
  endpoint:'http://10.0.0.40:4848',
};
test('NodeSeed receipt is bound to loopback, never advertised LAN',()=>{
  assert.equal(loopbackFromReceipt(receipt),'http://127.0.0.1:4848');
  assert.throws(()=>loopbackFromReceipt({...receipt,endpoint:'https://10.0.0.40:4848'}));
  assert.throws(()=>loopbackFromReceipt({...receipt,endpoint:'http://user:pass@10.0.0.40:4848'}));
});
test('live capacity requires exact device identity and broker workload',()=>{
  const capacity={
    protocol:'evercraft.capacity.v1',node_id:'test-node',
    device_fingerprint:fingerprint,supported_workloads:['systemia.remote-capacity-broker.v1'],
  };
  assert.equal(verifyCapacity(receipt,capacity),true);
  assert.throws(()=>verifyCapacity(receipt,{...capacity,node_id:'impostor'}));
  assert.throws(()=>verifyCapacity(receipt,{...capacity,supported_workloads:[]}));
});
test('broker health must match both instance and Yard receipt',()=>{
  const record={result:{instance_id:'same'},receipt:{receipt_hash:'sha256:abc'}};
  const health={
    ok:true,service:'remote-capacity-broker',runtime:'Evercraft Compute',
    instance_id:'same',deployment_receipt_bound:true,
    deployment_receipt_ref:'sha256:abc',
    secure_envelope_schema:'evercraft.secure-envelope.v1',
  };
  assert.equal(verifyBrokerHealth(health,record),true);
  assert.throws(()=>verifyBrokerHealth({...health,deployment_receipt_bound:false},record));
  assert.throws(()=>verifyBrokerHealth({...health,instance_id:'impostor'},record));
});
test('real private Yard broker deploy / resume / stop uses no public route',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-remote-broker-resident-'));
  const allocatorToken='isolated-proof-allocator-secret';
  const seed=await startNodeSeed({
    root,nodeId:'local-resident-proof',
    host:'127.0.0.1',port:0,advertiseHost:'127.0.0.1',
    allocatorToken,announce:false,
  });
  try{
    const first=await startPrivateBroker({root,allocatorToken,port:0,requirePhysical:false});
    assert.equal(first.mode,'deployed');
    const health=await fetch(first.localUrl+'/v1/remote/health').then(r=>r.json());
    assert.equal(health.authorized_devices,0);
    assert.equal(health.deployment_receipt_bound,true);
    assert.equal(health.instance_id,first.record.result.instance_id);
    const route=await first.yard.verifyRoute('evercraft-remote-broker-resident');
    assert.equal(route.ok,false);
    assert.equal(route.state,'public_route_unbound');

    const resumed=await startPrivateBroker({
      root,allocatorToken,port:Number(new URL(first.localUrl).port),
      requirePhysical:false,
    });
    assert.equal(resumed.mode,'resumed');
    assert.equal(resumed.record.result.instance_id,first.record.result.instance_id);
    await resumed.yard.stopDeployment('evercraft-remote-broker-resident',{reason:'proof_complete'});
    const status=JSON.parse(fs.readFileSync(path.join(root,'remote-broker-resident/status.json'),'utf8'));
    assert.equal(status.public_https_verified,false);
    assert.equal(status.production_remote_device_authorized_by_this_runner,false);
  }finally{
    await seed.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});
