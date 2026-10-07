import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startEvercraftComputeNode } from '../compute/runtime-node.mjs';
import { YardOperator } from './operator.mjs';
import { ingestForensicRecords } from '../forensic-record/corpus-store.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'forensic-public-yard-'));
const computeRoot=path.join(root,'compute');
const yardRoot=path.join(root,'yard');
const stateRoot=path.join(computeRoot,'forensic-public-state');

try{
  fs.mkdirSync(stateRoot,{recursive:true});
  ingestForensicRecords({
    stateDir:stateRoot,
    domain:'findings',
    records:[
      {
        record_key:'legacy:ForensicFinding:proof-a',
        finding_number:42,
        title:'Public staging proof',
        source_document:'Proof source',
        page_reference:'page 42',
        source_url:'https://example.test/source',
        truth_label:'EVIDENCE',
        quote:'Staging proof excerpt.',
        significance:'Proves the public lane is read-only.',
        category:'Legal Process',
        evidence_boundary:'A source-linked record is evidence of what the source contains. Presence, association, allegation, testimony and adjudicated fact must remain distinct.'
      }
    ]
  });
  fs.writeFileSync(path.join(stateRoot,'seed-receipt.json'),JSON.stringify({
    schema:'evercraft.forensic-record.owned-seed-receipt.v1',
    complete:true,
    base44_runtime_required:false,
    public_cutover_authorized:false,
    protected_entities_imported:false,
    source_manifest_sha256:'sha256:'+'c'.repeat(64),
    corpus_health:{finding_rows:1}
  },null,2));

  const node=await startEvercraftComputeNode({
    root:computeRoot,
    nodeId:'forensic-public-proof-node'
  });
  const yard=new YardOperator({stateDir:yardRoot});
  try{
    const deployment=await yard.deployRelease({
      deploymentId:'forensic-record-public-proof',
      releaseRef:'1234567890abcdef1234567890abcdef12345678',
      workloadClass:'systemia.forensic-record-public-runtime.v1',
      capacityEndpoint:node.endpoint,
      input:{state_root:stateRoot,require_seed:true,max_requests_per_minute:1000},
      rollbackTarget:'proof:forensic-public-previous',
      leaseTtlMs:120000
    });

    assert.equal(deployment.state,'ready');
    assert.equal(deployment.receipt.health_verification,'healthy');
    assert.equal(deployment.receipt.route_verification,'local_forensic_public_health_verified_public_route_unbound');
    assert.equal(deployment.result.public_read_only,true);
    assert.equal(deployment.result.safe_projection,true);
    assert.equal(deployment.result.write_routes_exposed,false);

    const health=await fetch(deployment.result.local_url+'/health').then(r=>r.json());
    assert.equal(health.service,'forensic-record-public-runtime');
    assert.equal(health.mode,'public_read_only');
    assert.equal(health.read_only,true);
    assert.equal(health.public_safe_projection,true);
    assert.equal(health.protected_domains_exposed,false);
    assert.equal(health.write_routes_exposed,false);
    assert.equal(health.base44_runtime_required,false);
    assert.equal(health.seed_complete,true);
    assert.equal(health.deployment_receipt_ref,deployment.receipt.receipt_hash);

    const search=await fetch(deployment.result.local_url+'/v1/search',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({finding_number:42})
    });
    assert.equal(search.status,200);
    const body=await search.json();
    assert.equal(body.count,1);
    assert.equal(body.results[0].title,'Public staging proof');
    assert.equal('record_key' in body.results[0],false);
    assert.equal('migration_lineage' in body.results[0],false);

    const writeAttempt=await fetch(deployment.result.local_url+'/v1/ingest',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:'{}'
    });
    assert.equal(writeAttempt.status,404);

    const route=await yard.verifyPublicRoute('forensic-record-public-proof',{
      origin:deployment.result.local_url,
      allowLoopbackProof:true
    });
    assert.equal(route.scope,'loopback_proof');
    assert.equal(route.verified,false);
    assert.equal(route.service,'forensic-record-public-runtime');

    const routeState=await yard.verifyRoute('forensic-record-public-proof');
    assert.equal(routeState.ok,false);
    assert.equal(routeState.state,'public_route_unbound');
    assert.equal(routeState.local_health_ok,true);

    console.log(JSON.stringify({
      ok:true,
      schema:'evercraft.forensic-record.public-yard-proof.v1',
      compute_admission:true,
      yard_health_gate:true,
      deployment_receipt_bound:true,
      safe_projection:true,
      write_routes_exposed:false,
      protected_domains_exposed:false,
      loopback_route_shape_verified:true,
      public_https_cutover_not_claimed:true
    },null,2));
  }finally{
    await node.close();
  }
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
