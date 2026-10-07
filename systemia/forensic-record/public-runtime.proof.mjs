import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ingestForensicRecords } from './corpus-store.mjs';
import { startForensicRecordPublicRuntime } from './public-runtime.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'forensic-public-runtime-'));
try{
  ingestForensicRecords({
    stateDir:root,
    domain:'findings',
    records:[
      {
        record_key:'legacy:ForensicFinding:a',
        finding_number:7,
        title:'Public proof finding',
        source_document:'Proof document',
        page_reference:'page 4',
        source_url:'https://example.test/proof',
        truth_label:'EVIDENCE',
        quote:'Public proof excerpt.',
        significance:'Demonstrates safe public projection.',
        category:'Legal Process',
        evidence_boundary:'A source-linked record is evidence of what the source contains. Presence, association, allegation, testimony and adjudicated fact must remain distinct.',
        migration_lineage:{source_platform:'base44',source_entity:'ForensicFinding',source_record_id:'a'}
      },
      {
        record_key:'legacy:ForensicFinding:b',
        finding_number:7,
        title:'Collision remains visible',
        source_document:'Proof document',
        page_reference:'page 5',
        source_url:'',
        truth_label:'FACT',
        quote:'Second proof excerpt.',
        significance:'Collision proof.',
        category:'Legal Process',
        evidence_boundary:'A source-linked record is evidence of what the source contains. Presence, association, allegation, testimony and adjudicated fact must remain distinct.',
        migration_lineage:{source_platform:'base44',source_entity:'ForensicFinding',source_record_id:'b'}
      }
    ],
  });
  fs.writeFileSync(path.join(root,'seed-receipt.json'),JSON.stringify({
    schema:'evercraft.forensic-record.owned-seed-receipt.v1',
    complete:true,
    base44_runtime_required:false,
    public_cutover_authorized:false,
    protected_entities_imported:false,
    source_manifest_sha256:'sha256:'+'a'.repeat(64),
    corpus_health:{finding_rows:2}
  },null,2));

  const runtime=await startForensicRecordPublicRuntime({stateDir:root,maxRequestsPerMinute:1000});
  try{
    const h=await fetch(runtime.service_url+'/health').then(r=>r.json());
    assert.equal(h.ok,true);
    assert.equal(h.service,'forensic-record-public-runtime');
    assert.equal(h.mode,'public_read_only');
    assert.equal(h.read_only,true);
    assert.equal(h.public_safe_projection,true);
    assert.equal(h.protected_domains_exposed,false);
    assert.equal(h.write_routes_exposed,false);
    assert.equal(h.base44_runtime_required,false);
    assert.equal(h.seed_complete,true);
    assert.equal(h.finding_rows,2);

    const detail=await fetch(runtime.service_url+'/v1/findings/7').then(r=>r.json());
    assert.equal(detail.ok,true);
    assert.equal(detail.collision_count,2);
    assert.equal(detail.results[0].finding_number,7);
    assert.equal('record_key' in detail.results[0],false);
    assert.equal('migration_lineage' in detail.results[0],false);

    const search=await fetch(runtime.service_url+'/v1/search',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({text:'Public proof',limit:25})
    });
    assert.equal(search.status,200);
    const body=await search.json();
    assert.equal(body.count,1);
    assert.equal(body.results[0].title,'Public proof finding');

    const unfiltered=await fetch(runtime.service_url+'/v1/search',{
      method:'POST',headers:{'content-type':'application/json'},body:'{}'
    });
    assert.equal(unfiltered.status,400);

    const ingest=await fetch(runtime.service_url+'/v1/ingest',{
      method:'POST',headers:{'content-type':'application/json'},body:'{}'
    });
    assert.equal(ingest.status,404);

    const stats=await fetch(runtime.service_url+'/v1/stats').then(r=>r.json());
    assert.equal(stats.finding_rows,2);
    assert.equal(stats.unique_finding_numbers,1);
    assert.equal(stats.duplicate_number_extra_rows,1);
    assert.equal(stats.base44_runtime_required,false);

    runtime.setDeploymentReceipt('sha256:'+'b'.repeat(64));
    assert.equal(runtime.health().deployment_receipt_bound,true);

    console.log(JSON.stringify({
      ok:true,
      schema:'evercraft.forensic-record.public-runtime-proof.v1',
      read_only:true,
      safe_projection:true,
      collision_visibility:true,
      public_search_bounded:true,
      protected_domains_exposed:false,
      write_routes_exposed:false,
      base44_runtime_required:false
    },null,2));
  }finally{
    await runtime.close();
  }
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
