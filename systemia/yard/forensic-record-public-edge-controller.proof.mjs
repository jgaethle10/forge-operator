import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startEvercraftComputeNode } from '../compute/runtime-node.mjs';
import { YardOperator } from './operator.mjs';
import { ForensicRecordPublicEdgeController } from './forensic-record-public-edge-controller.mjs';
import { ingestForensicRecords } from '../forensic-record/corpus-store.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'forensic-public-edge-proof-'));
const computeRoot=path.join(root,'compute');
const yardState=path.join(root,'yard');
const controllerState=path.join(root,'controller');
const stateRoot=path.join(computeRoot,'.evercraft','forensic-record-runtime');
const allocatorToken='forensic-public-edge-proof-allocator';
const machineKey='forensic-public-edge-proof-machine';
const releaseRef='9'.repeat(40);

const oldMachine=process.env.SYSTEMIA_MACHINE_KEY;
process.env.SYSTEMIA_MACHINE_KEY=machineKey;

try{
  fs.mkdirSync(stateRoot,{recursive:true});
  ingestForensicRecords({
    stateDir:stateRoot,
    domain:'findings',
    records:[
      {
        record_key:'legacy:ForensicFinding:staging-proof-1',
        finding_number:1,
        title:'Staging content canary',
        source_document:'Proof source',
        page_reference:'page 1',
        source_url:'https://example.test/source',
        truth_label:'EVIDENCE',
        quote:'Safe public canary.',
        significance:'Proves a real source-linked result traverses the public staging route.',
        category:'Legal Process',
        evidence_boundary:'A source-linked record is evidence of what the source contains. Presence, association, allegation, testimony and adjudicated fact must remain distinct.'
      }
    ],
  });
  fs.writeFileSync(path.join(stateRoot,'seed-receipt.json'),JSON.stringify({
    schema:'evercraft.forensic-record.owned-seed-receipt.v1',
    complete:true,
    base44_runtime_required:false,
    public_cutover_authorized:false,
    protected_entities_imported:false,
    source_manifest_sha256:'sha256:'+'d'.repeat(64),
    corpus_health:{finding_rows:1}
  },null,2));

  const node=await startEvercraftComputeNode({
    root:computeRoot,
    nodeId:'forensic-public-edge-proof-node',
    allocatorToken,
  });
  const yard=new YardOperator({stateDir:yardState});
  try{
    const edge=await yard.deployRelease({
      deploymentId:'evercraft-public-edge',
      releaseRef,
      workloadClass:'systemia.public-edge.v1',
      capacityEndpoint:node.endpoint,
      allocatorToken,
      input:{
        mode:'proof_loopback',
        control_host:'127.0.0.1',
        control_port:0,
        public_host:'127.0.0.1',
        public_port:0,
        base_domain:'',
        tls_key_path:'',
        tls_cert_path:'',
        allow_private_upstream:false,
      },
      rollbackTarget:'proof:forensic-edge-previous',
      leaseTtlMs:120000,
    });
    assert.equal(edge.state,'ready');

    const privateRuntime=await yard.deploySiblingRelease({
      sourceDeploymentId:'evercraft-public-edge',
      deploymentId:'forensic-record-runtime',
      releaseRef,
      workloadClass:'systemia.forensic-record-runtime.v1',
      input:{require_public_seed:true,bootstrap_public_snapshot:false},
      rollbackTarget:'proof:forensic-private-previous',
      leaseTtlMs:120000,
    });
    assert.equal(privateRuntime.state,'ready');
    assert.equal(privateRuntime.result.seed_state,'reused_verified_seed');
    assert.equal(privateRuntime.result.seed_finding_rows,1);

    const controller=new ForensicRecordPublicEdgeController({
      yard,
      stateDir:controllerState,
      leaseTtlMs:120000,
      renewEveryMs:60000,
      allowLoopbackProof:true,
      requestedHostname:'files-companion-staging-proof',
      stableHostname:true,
    });

    await assert.rejects(
      controller.provision({
        releaseRef,
        requestedHostname:'filescompanion.com',
        rollbackTarget:'proof:forensic-public-previous',
      }),
      /canonical_filescompanion_domain_cutover_forbidden/
    );

    const provisioned=await controller.provision({
      releaseRef,
      requestedHostname:'files-companion-staging-proof',
      rollbackTarget:'proof:forensic-public-previous',
    });
    assert.equal(provisioned.action,'provisioned');
    assert.equal(provisioned.runtime_fabric,'Evercraft Compute');
    assert.equal(provisioned.node_id,'forensic-public-edge-proof-node');
    assert.equal(provisioned.route_scope,'loopback_proof');
    assert.equal(provisioned.route_verified,false);
    assert.equal(provisioned.public_read_only,true);
    assert.equal(provisioned.safe_projection,true);
    assert.equal(provisioned.content_canary_verified,true);
    assert.equal(provisioned.canary_finding_number,1);
    assert.ok(provisioned.canary_result_count>=1);
    assert.equal(provisioned.canonical_domain_cutover,false);
    assert.match(provisioned.origin,/^http:\/\/127\.0\.0\.1:/);

    const page=await fetch(provisioned.origin+'/');
    assert.equal(page.status,200);
    assert.match(String(page.headers.get('content-type')||''),/^text\/html/);
    const html=await page.text();
    assert.match(html,/The Forensic Record/);
    assert.match(html,/Association is not culpability/);

    const search=await fetch(provisioned.origin+'/v1/findings/1').then(r=>r.json());
    assert.equal(search.ok,true);
    assert.ok(search.results.length>=1);
    assert.equal('record_key' in search.results[0],false);
    assert.equal('migration_lineage' in search.results[0],false);

    const restarted=new ForensicRecordPublicEdgeController({
      yard:new YardOperator({stateDir:yardState}),
      stateDir:controllerState,
      leaseTtlMs:120000,
      renewEveryMs:60000,
      allowLoopbackProof:true,
    });
    assert.ok(restarted.binding);
    const resumed=await restarted.resume({rebindIfNeeded:true});
    assert.equal(resumed.action,'resumed');
    assert.equal(resumed.health_state,'loopback_proof_healthy');
    assert.equal(resumed.content_canary_verified,true);
    assert.equal(resumed.canonical_domain_cutover,false);
    assert.equal(resumed.origin,provisioned.origin);

    const stopped=await restarted.close({reason:'proof_complete'});
    assert.equal(stopped.action,'stopped');
    assert.ok(stopped.route_release_receipt);

    await yard.stopDeployment('forensic-record-runtime',{reason:'proof_complete'});
    await yard.stopDeployment('evercraft-public-edge',{reason:'proof_complete'});

    console.log(JSON.stringify({
      ok:true,
      schema:'evercraft.forensic-record.public-edge-controller-proof.v1',
      seeded_private_runtime_required:true,
      public_read_only_sibling:true,
      real_finding_canary_through_edge:true,
      safe_projection_through_edge:true,
      restart_resume_without_manual_reprovision:true,
      route_release_proven:true,
      canonical_filescompanion_domain_refused:true,
      legacy_retirement_authorized:false,
      production_https_gate_remains_fail_closed:true,
      proof_scope:'loopback_only',
      provision_receipt:provisioned.receipt_hash,
      resume_receipt:resumed.receipt_hash,
    },null,2));
  }finally{
    try{await node.close();}catch{}
  }
}finally{
  if(oldMachine===undefined) delete process.env.SYSTEMIA_MACHINE_KEY;
  else process.env.SYSTEMIA_MACHINE_KEY=oldMachine;
  fs.rmSync(root,{recursive:true,force:true});
}
