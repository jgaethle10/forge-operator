import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startEvercraftComputeNode } from '../compute/runtime-node.mjs';
import { YardOperator } from './operator.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'forensic-record-yard-'));
const computeRoot=path.join(root,'compute');
const yardState=path.join(root,'yard');

const oldMachine=process.env.SYSTEMIA_MACHINE_KEY;
const oldIngest=process.env.FORENSIC_RECORD_INGEST_TOKEN;
process.env.SYSTEMIA_MACHINE_KEY='forensic-proof-machine';
process.env.FORENSIC_RECORD_INGEST_TOKEN='forensic-proof-ingest';

const node=await startEvercraftComputeNode({root:computeRoot,nodeId:'forensic-record-proof-node'});
const yard=new YardOperator({stateDir:yardState});

try{
  const deployment=await yard.deployRelease({
    deploymentId:'forensic-record-owned-proof',
    releaseRef:'12f115306bbb4ee4bdb68855c79bf21156684766',
    workloadClass:'systemia.forensic-record-runtime.v1',
    capacityEndpoint:node.endpoint,
    input:{state_root:path.join(computeRoot,'forensic-state')},
    rollbackTarget:'proof:forensic-record-previous',
    leaseTtlMs:120000
  });

  assert.equal(deployment.state,'ready');
  assert.equal(deployment.receipt.health_verification,'healthy');
  assert.equal(
    deployment.receipt.route_verification,
    'private_forensic_record_health_verified_public_route_unbound'
  );
  assert.equal(deployment.result.private_source_runtime,true);
  assert.ok(deployment.result.instance_id);
  assert.ok(deployment.result.local_url);

  const localHealth=await fetch(deployment.result.local_url+'/health').then(r=>r.json());
  assert.equal(localHealth.ok,true);
  assert.equal(localHealth.service,'forensic-record-owned-runtime');
  assert.equal(localHealth.runtime,'Evercraft Compute');
  assert.equal(localHealth.canonical_store,'content-addressed-forensic-corpus-v1');
  assert.equal(localHealth.deployment_receipt_bound,true);
  assert.equal(localHealth.deployment_receipt_ref,deployment.receipt.receipt_hash);
  assert.equal(localHealth.base44_runtime_required,false);

  const ingest=await fetch(deployment.result.local_url+'/v1/ingest',{
    method:'POST',
    headers:{
      'content-type':'application/json',
      authorization:'Bearer forensic-proof-ingest'
    },
    body:JSON.stringify({
      domain:'findings',
      source:{name:'yard resident proof',evidence_state:'PROOF_ONLY'},
      records:[{
        record_key:'proof:finding:1',
        finding_number:1,
        title:'Owned runtime evidence proof',
        source_document:'Proof document',
        page_reference:'page 1',
        source_url:'https://example.test/proof',
        truth_label:'EVIDENCE',
        quote:'Proof-only fixture.',
        category:'Legal Process',
        evidence_boundary:'A source-linked record is evidence of what the source contains. Presence, association, allegation, testimony and adjudicated fact must remain distinct.'
      }]
    })
  });
  assert.equal(ingest.status,201);
  const ingestReceipt=await ingest.json();
  assert.equal(ingestReceipt.inserted,1);

  const search=await fetch(deployment.result.local_url+'/v1/search',{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-systemia-machine-key':'forensic-proof-machine'
    },
    body:JSON.stringify({finding_number:1})
  });
  assert.equal(search.status,200);
  const searchBody=await search.json();
  assert.equal(searchBody.count,1);
  assert.equal(searchBody.results[0].title,'Owned runtime evidence proof');

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.forensic-record.resident-yard-proof.v1',
    compute_admission:true,
    yard_deployment_receipt_bound:true,
    content_addressed_corpus_live:true,
    authenticated_ingest:true,
    systemia_read_only_search:true,
    base44_runtime_required:false,
    public_route_state:'unbound_until_independently_verified',
    instance_id:deployment.result.instance_id,
    deployment_receipt:deployment.receipt.receipt_hash
  },null,2));
}finally{
  await node.close();
  if(oldMachine===undefined) delete process.env.SYSTEMIA_MACHINE_KEY; else process.env.SYSTEMIA_MACHINE_KEY=oldMachine;
  if(oldIngest===undefined) delete process.env.FORENSIC_RECORD_INGEST_TOKEN; else process.env.FORENSIC_RECORD_INGEST_TOKEN=oldIngest;
  fs.rmSync(root,{recursive:true,force:true});
}
