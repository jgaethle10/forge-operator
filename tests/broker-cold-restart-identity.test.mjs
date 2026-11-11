import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {startOutboundCapacityBroker} from '../systemia/network/outbound-capacity-broker.mjs';
import {assessResidentBrokerRecovery} from '../systemia/yard/broker-recovery-admission.mjs';

const RECEIPT='sha256:'+'b'.repeat(64);
const deployment=instance=>({
  receipt:{workload_class:'systemia.remote-capacity-broker.v1',receipt_hash:RECEIPT},
  result:{instance_id:instance,service_id:'svc_0123456789abcdef'},
});
test('actual local broker cold restart invalidates prior instance and receipt binding',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-broker-recovery-'));
  const stateDir=path.join(root,'broker');
  let oldBroker,newBroker;
  try{
    oldBroker=await startOutboundCapacityBroker({
      stateDir,host:'127.0.0.1',port:0,authorizedDevices:{},
    });
    const oldInstance=oldBroker.instance_id;
    const original=oldBroker.setDeploymentReceipt(RECEIPT);
    assert.equal(original.instance_id,oldInstance);
    assert.equal(original.deployment_receipt_ref,RECEIPT);
    const existing=assessResidentBrokerRecovery({
      yardDeployment:deployment(oldInstance),
      brokerHealth:oldBroker.health(),
    });
    assert.equal(existing.verified_existing_identity,true);
    assert.deepEqual(existing.reasons,[]);
    assert.equal(existing.restart_authorized,false,
      'matching live identity never authorizes a restart');
    await oldBroker.close();
    oldBroker=null;

    // Same state directory, new process instance. No production host or
    // actual device is contacted. Reusing the directory is NOT enough.
    newBroker=await startOutboundCapacityBroker({
      stateDir,host:'127.0.0.1',port:0,authorizedDevices:{},
    });
    assert.notEqual(newBroker.instance_id,oldInstance);
    const unbound=newBroker.health();
    assert.equal(unbound.deployment_receipt_bound,false);
    assert.equal(unbound.deployment_receipt_ref,null);
    const rejected=assessResidentBrokerRecovery({
      yardDeployment:deployment(oldInstance),brokerHealth:unbound,
    });
    assert.equal(rejected.verified_existing_identity,false);
    assert.equal(rejected.may_preserve_existing_yard_deployment,false);
    assert.ok(rejected.reasons.includes('cold_restart_requires_new_deployment_identity'));
    assert.ok(rejected.reasons.includes('broker_receipt_not_bound'));
    assert.ok(rejected.reasons.includes('deployment_receipt_mismatch'));
    assert.equal(rejected.restart_authorized,false);
    assert.equal(rejected.new_broker_auto_admission_authorized,false);

    // Rebinding to the old receipt is not a legitimate recovery shortcut.
    const rebound=newBroker.setDeploymentReceipt(RECEIPT);
    assert.equal(rebound.deployment_receipt_bound,true);
    const stillRejected=assessResidentBrokerRecovery({
      yardDeployment:deployment(oldInstance),brokerHealth:rebound,
    });
    assert.equal(stillRejected.verified_existing_identity,false);
    assert.ok(stillRejected.reasons.includes('cold_restart_requires_new_deployment_identity'));
    assert.equal(stillRejected.restart_authorized,false);
  }finally{
    if(newBroker)await newBroker.close();
    if(oldBroker)await oldBroker.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});
test('forged health and missing Yard authorization never qualify as matching identity',()=>{
  const base={
    ok:true,schema:'evercraft.remote-capacity.broker-health.v1',
    service:'remote-capacity-broker',runtime:'Evercraft Compute',
    instance_id:'remote_broker_'+'a'.repeat(24),
    deployment_receipt_bound:true,deployment_receipt_ref:RECEIPT,
    secure_envelope_schema:'evercraft.secure-envelope.v1',
  };
  const old=deployment(base.instance_id);
  for(const [description,health,expected] of [
    ['wrong instance',{...base,instance_id:'remote_broker_'+'c'.repeat(24)},'cold_restart_requires_new_deployment_identity'],
    ['unbound receipt',{...base,deployment_receipt_bound:false},'broker_receipt_not_bound'],
    ['wrong receipt',{...base,deployment_receipt_ref:'sha256:'+'a'.repeat(64)},'deployment_receipt_mismatch'],
    ['wrong envelope',{...base,secure_envelope_schema:'untrusted'},'broker_secure_envelope_unverified'],
    ['wrong service',{...base,service:'untrusted'},'broker_health_untrusted'],
  ]){
    const gate=assessResidentBrokerRecovery({yardDeployment:old,brokerHealth:health});
    assert.equal(gate.verified_existing_identity,false,description);
    assert.ok(gate.reasons.includes(expected),description);
  }
  assert.ok(assessResidentBrokerRecovery({brokerHealth:base}).reasons
    .includes('yard_not_remote_broker_deployment'));
});
