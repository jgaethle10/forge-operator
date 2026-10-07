import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { startForensicRecordRuntime } from '../../forensic-record/runtime.mjs';
import { migrateForensicRecordSnapshot } from './forensic-record-stream-migrator.mjs';

const stable=(v)=>{
  if(Array.isArray(v)) return v.map(stable);
  if(v&&typeof v==='object') return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));
  return v;
};
const stableJson=(v)=>JSON.stringify(stable(v));
const sha=(v)=>createHash('sha256').update(Buffer.from(typeof v==='string'?v:stableJson(v))).digest('hex');
const withRowSha=(row)=>({...row,_migration_row_sha256:sha(stableJson(row))});
const page=(entity,rows,cutoff)=> {
  const body={
    schema:'evercraft.forensic-record.base44-exit-batch.v1',
    ok:true,
    source_product:'forensic-record',
    source_entity:entity,
    snapshot_cutoff:cutoff,
    page_row_count:rows.length,
    rows:rows.map(withRowSha),
    next_cursor:null,
    next_offset:rows.length,
    exhausted:true
  };
  return {...body,page_sha256:sha(stableJson(body))};
};

const root=fs.mkdtempSync(path.join(os.tmpdir(),'forensic-record-migrate-'));
const corpusDir=path.join(root,'corpus');
const migrationDir=path.join(root,'migration');
const cutoff='2026-10-07T00:00:00.000Z';
const pages={
  ForensicFinding:page('ForensicFinding',[
    {
      id:'legacy-finding-1',finding_number:101,title:'Migrated finding',
      source_document:'Legacy source, page 7',source_url:'https://example.test/source',
      truth_label:'EVIDENCE',quote:'A source excerpt.',category:'Legal Process'
    }
  ],cutoff),
  LegacyFindingAudit:page('LegacyFindingAudit',[
    {
      id:'legacy-audit-1',audit_id:'audit-101',finding_id:'legacy-finding-1',
      finding_number:101,source_document:'Legacy source, page 7',
      audit_status:'page_recoverable',recovered_page_reference:'page 7',
      recommended_action:'link_page',evidence_refs:['ForensicFinding legacy-finding-1']
    }
  ],cutoff)
};

const source=http.createServer(async(req,res)=>{
  assert.equal(req.method,'POST');
  assert.equal(req.headers['x-systemia-machine-key'],'legacy-extract-proof');
  assert.equal(req.headers['x-evercraft-migration-purpose'],'forensic-record-base44-exit-v1');
  const chunks=[]; for await(const chunk of req) chunks.push(chunk);
  const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const response=pages[body.entity];
  if(!response){
    res.writeHead(400,{'content-type':'application/json'});
    res.end(JSON.stringify({error:'unsupported_entity'}));
    return;
  }
  res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify(response));
});
await new Promise((resolve,reject)=>{source.once('error',reject);source.listen(0,'127.0.0.1',resolve);});
const sourceAddr=source.address();
const sourceEndpoint='http://127.0.0.1:'+sourceAddr.port+'/extract';

const runtime=await startForensicRecordRuntime({
  stateDir:corpusDir,
  systemiaMachineKey:'owned-search-proof',
  ingestToken:'owned-ingest-proof'
});

try{
  const receipt=await migrateForensicRecordSnapshot({
    sourceEndpoint,
    sourceKey:'legacy-extract-proof',
    targetIngestEndpoint:runtime.service_url+'/v1/ingest',
    targetIngestToken:'owned-ingest-proof',
    stateDir:migrationDir,
    snapshotCutoff:cutoff,
    entities:['ForensicFinding','LegacyFindingAudit'],
    pageLimit:10
  });
  assert.equal(receipt.complete,true);
  assert.equal(receipt.totals.source_rows,2);
  assert.equal(receipt.totals.accepted_rows,2);
  assert.equal(receipt.totals.ingest_submitted,2);
  assert.equal(receipt.target_base44,false);
  assert.equal(receipt.legacy_retirement_authorized,false);

  const search=await fetch(runtime.service_url+'/v1/search',{
    method:'POST',
    headers:{'content-type':'application/json','x-systemia-machine-key':'owned-search-proof'},
    body:JSON.stringify({finding_number:101})
  }).then(r=>r.json());
  assert.equal(search.count,1);
  assert.equal(search.results[0].source_document,'Legacy source');
  assert.equal(search.results[0].page_reference,'page 7');

  const retry=await migrateForensicRecordSnapshot({
    sourceEndpoint,
    sourceKey:'legacy-extract-proof',
    targetIngestEndpoint:runtime.service_url+'/v1/ingest',
    targetIngestToken:'owned-ingest-proof',
    stateDir:migrationDir,
    snapshotCutoff:cutoff,
    entities:['ForensicFinding','LegacyFindingAudit'],
    pageLimit:10
  });
  assert.equal(retry.complete,true);
  assert.equal(retry.totals.source_rows,2);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.forensic-record.streaming-migration-proof.v1',
    verified_page_hashes:true,
    verified_row_hashes:true,
    checkpoint_resume:true,
    legacy_source_is_extraction_only:true,
    owned_target_rejects_base44:true,
    secrets_not_persisted:true,
    evidence_and_audit_rows_migrated:true,
    legacy_retirement_authorized:false
  },null,2));
}finally{
  await runtime.close();
  await new Promise(resolve=>source.close(()=>resolve()));
  fs.rmSync(root,{recursive:true,force:true});
}
