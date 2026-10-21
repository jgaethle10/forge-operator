import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startEvercraftComputeNode } from './runtime-node.mjs';
import { buildForgeOperatorServiceSpec } from './forge-operator-service-spec.mjs';
import { YardOperator } from '../yard/operator.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'forge-operator-compute-proof-'));
const computeRoot=path.join(root,'compute');
const yardState=path.join(root,'yard');
fs.mkdirSync(computeRoot,{recursive:true});

const releaseRef='a'.repeat(40);
const imageDigest='sha256:'+'b'.repeat(64);
const releaseReceiptRef='release-execution://forge-proof';
const instanceId='forge-proof-instance';

let closed=false;
let deploymentReceiptRef='';
let factoryCalls=0;
let factoryArgs=null;

const forgeRuntimeFactory=async(args)=>{
  factoryCalls+=1;
  factoryArgs={...args};
  return {
    url:'http://127.0.0.1:39999',
    instanceId,
    async health(){
      return {
        ok:!closed,
        service:'forge-operator',
        provider:'Evercraft',
        runtime:'Evercraft Compute',
        workload_class:'systemia.forge-operator-runtime.v1',
        instance_id:instanceId,
        immutable_container:true,
        release_ref:args.releaseRef,
        image_digest:args.imageDigest,
        release_execution_receipt_ref:args.releaseReceiptRef,
        university_benchmark_ingress_ready:true,
        university_remote_persistence:false,
        university_public_write_allowed:false,
        deployment_receipt_bound:Boolean(deploymentReceiptRef),
        deployment_receipt_ref:deploymentReceiptRef||null,
        upstream_health_ok:true,
        secret_material_exposed:false,
      };
    },
    setDeploymentReceipt(value){
      deploymentReceiptRef=String(value||'');
      return {
        ok:true,
        service:'forge-operator',
        runtime:'Evercraft Compute',
        workload_class:'systemia.forge-operator-runtime.v1',
        instance_id:instanceId,
        deployment_receipt_bound:Boolean(deploymentReceiptRef),
        deployment_receipt_ref:deploymentReceiptRef||null,
        immutable_container:true,
        release_ref:args.releaseRef,
        image_digest:args.imageDigest,
      };
    },
    async close(){closed=true;},
  };
};

const node=await startEvercraftComputeNode({
  root:computeRoot,
  nodeId:'forge-operator-proof-node',
  forgeRuntimeFactory,
});
const yard=new YardOperator({stateDir:yardState});

try{
  const capacity=await fetch(node.endpoint+'/v1/capacity').then(r=>r.json());
  assert.equal(capacity.supported_workloads.includes('systemia.forge-operator-runtime.v1'),true);
  assert.equal(capacity.capacity_hint.services.forge_operator.ready,true);
  assert.equal(capacity.capacity_hint.services.forge_operator.immutable_container_required,true);
  assert.equal(capacity.capacity_hint.services.forge_operator.arbitrary_image_execution,false);

  await assert.rejects(
    yard.deployRelease({
      deploymentId:'forge-missing-digest',
      releaseRef,
      workloadClass:'systemia.forge-operator-runtime.v1',
      capacityEndpoint:node.endpoint,
      input:{release_receipt_ref:releaseReceiptRef},
      rollbackTarget:'proof:previous',
      leaseTtlMs:120000,
    }),
    /forge_operator_image_digest_required/
  );
  assert.equal(factoryCalls,0);

  const spec=buildForgeOperatorServiceSpec({
    releaseRef,
    imageDigest,
    releaseReceiptRef,
    hostname:'forge',
  });
  const deployment=await yard.deployRelease({
    deploymentId:'forge-operator-proof',
    releaseRef:spec.release_ref,
    workloadClass:spec.workload_class,
    capacityEndpoint:node.endpoint,
    input:spec.input,
    rollbackTarget:spec.rollback_target,
    leaseTtlMs:120000,
  });

  assert.equal(factoryCalls,1);
  assert.equal(factoryArgs.releaseRef,releaseRef);
  assert.equal(factoryArgs.imageDigest,imageDigest);
  assert.equal(factoryArgs.releaseReceiptRef,releaseReceiptRef);
  assert.equal(factoryArgs.repository,'ghcr.io/jgaethle10/forge-operator');
  assert.equal(factoryArgs.requireAiReady,true);

  assert.equal(deployment.state,'ready');
  assert.equal(deployment.receipt.health_verification,'healthy');
  assert.equal(
    deployment.receipt.route_verification,
    'local_forge_operator_health_verified_public_route_unbound'
  );
  assert.equal(deployment.result.immutable_container,true);
  assert.equal(deployment.result.release_ref,releaseRef);
  assert.equal(deployment.result.image_digest,imageDigest);
  assert.equal(deployment.result.release_execution_receipt_ref,releaseReceiptRef);
  assert.equal(deployment.result.arbitrary_image_execution,false);
  assert.equal(deploymentReceiptRef,deployment.receipt.receipt_hash);

  const route=await yard.verifyRoute('forge-operator-proof');
  assert.equal(route.ok,false);
  assert.equal(route.state,'public_route_unbound');
  assert.equal(route.local_health_ok,true);
  assert.equal(route.health.deployment_receipt_bound,true);
  assert.equal(route.health.deployment_receipt_ref,deployment.receipt.receipt_hash);
  assert.equal(route.health.university_benchmark_ingress_ready,true);
  assert.equal(route.health.university_remote_persistence,false);
  assert.equal(route.health.university_public_write_allowed,false);

  const stopped=await yard.stopDeployment('forge-operator-proof',{reason:'proof_complete'});
  assert.equal(stopped.ok,true);
  assert.equal(closed,true);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.compute.forge-operator-admission-proof.v1',
    workload_class:'systemia.forge-operator-runtime.v1',
    compute_capacity_advertised:true,
    immutable_release_sha_required:true,
    image_digest_required:true,
    release_execution_receipt_required:true,
    arbitrary_image_execution:false,
    yard_health_gate:true,
    deployment_receipt_bound:true,
    university_benchmark_ingress_ready:true,
    remote_persistence:false,
    public_write_allowed:false,
    public_route_state:'unbound_until_independently_verified',
    release_ref:releaseRef,
    image_digest:imageDigest,
    deployment_receipt:deployment.receipt.receipt_hash,
  },null,2));
}finally{
  await node.close();
  fs.rmSync(root,{recursive:true,force:true});
}
