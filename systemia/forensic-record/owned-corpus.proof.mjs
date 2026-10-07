import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { adaptLegacyForensicRecordEntity } from '../migrations/base44-exit/forensic-record-domain-adapter.mjs';
import {
  ingestForensicRecords,
  searchForensicFindings,
  forensicCorpusHealth,
  getForensicRecord
} from './corpus-store.mjs';
import { startForensicRecordRuntime } from './runtime.mjs';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'forensic-record-owned-'));
const adapted=adaptLegacyForensicRecordEntity({
  entityName:'ForensicFinding',
  rows:[
    {
      id:'a',finding_number:18041,title:'First legacy row',
      source_document:'Ghislaine Maxwell Deposition, page 17',
      source_url:'',truth_label:'EVIDENCE',category:'Legal Process',
      quote:'Excerpt A'
    },
    {
      id:'b',finding_number:18041,title:'Collision stays visible',
      source_document:'Ghislaine Maxwell Deposition, page 18',
      source_url:'https://example.test/doc',truth_label:'TESTIMONY',category:'Victim Testimony',
      quote:'Excerpt B'
    },
    {
      id:'c',finding_number:18042,title:'Explicit evidence boundary',
      source_document:'Another document',page_reference:'PDF p. 9',
      source_url:'https://example.test/another',truth_label:'FACT',category:'Legal Process'
    }
  ]
});
assert.equal(adapted.accepted,3);

const receipt=ingestForensicRecords({
  stateDir:dir,
  domain:'findings',
  records:adapted.records,
  source:{name:'bounded Base44 extraction',evidence_state:'MIGRATED_VERIFIED'}
});
assert.equal(receipt.inserted,3);
assert.equal(receipt.finding_number_collision_keys,1);

const duplicate=ingestForensicRecords({
  stateDir:dir,
  domain:'findings',
  records:[adapted.records[0]],
  source:{name:'retry'}
});
assert.equal(duplicate.deduped,1);

const revised=structuredClone(adapted.records[0]);
revised.significance='Later migration enrichment without deleting prior bytes.';
const versioned=ingestForensicRecords({stateDir:dir,domain:'findings',records:[revised]});
assert.equal(versioned.updated,1);
const reopened=getForensicRecord({stateDir:dir,recordKey:revised.record_key});
assert.equal(reopened.entry.versions.length,1);
assert.equal(reopened.record.significance,revised.significance);

const byNumber=searchForensicFindings({stateDir:dir,findingNumber:18041});
assert.equal(byNumber.count,2);
assert.equal(byNumber.results[0].source_document,'Ghislaine Maxwell Deposition');
assert.equal(byNumber.results[0].page_reference,'page 17');

const health=forensicCorpusHealth({stateDir:dir});
assert.equal(health.finding_rows,3);
assert.equal(health.unique_finding_numbers,2);
assert.equal(health.duplicate_number_keys,1);
assert.equal(health.duplicate_number_extra_rows,1);
assert.equal(health.missing_source_url,1);
assert.equal(health.destructive_dedupe,false);
assert.equal(health.prior_versions_preserved,true);
assert.equal(health.base44_runtime_required,false);

const runtime=await startForensicRecordRuntime({
  stateDir:dir,
  systemiaMachineKey:'systemia-test',
  ingestToken:'ingest-test'
});
const healthResponse=await fetch(runtime.service_url+'/health');
assert.equal(healthResponse.status,200);
const runtimeHealth=await healthResponse.json();
assert.equal(runtimeHealth.runtime,'Evercraft Compute');
assert.equal(runtimeHealth.private_source_runtime,true);
assert.equal(runtimeHealth.public_edge_separate,true);

const unauthorized=await fetch(runtime.service_url+'/v1/search',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({finding_number:18041})
});
assert.equal(unauthorized.status,401);

const authorized=await fetch(runtime.service_url+'/v1/search',{
  method:'POST',
  headers:{'content-type':'application/json','x-systemia-machine-key':'systemia-test'},
  body:JSON.stringify({finding_number:18041})
});
assert.equal(authorized.status,200);
const body=await authorized.json();
assert.equal(body.count,2);

const publicFindingResponse=await fetch(runtime.service_url+'/v1/public/findings/18041');
assert.equal(publicFindingResponse.status,200);
assert.equal(publicFindingResponse.headers.get('access-control-allow-origin'),'*');
const publicFinding=await publicFindingResponse.json();
assert.equal(publicFinding.variant_count,2);
assert.equal(publicFinding.duplicate_number_preserved,true);
assert.equal(publicFinding.findings[0].page_reference,'page 17');
assert.equal('record_key' in publicFinding.findings[0],false);
assert.equal('migration_lineage' in publicFinding.findings[0],false);

const publicSearch=await fetch(runtime.service_url+'/v1/public/search?q=legacy&limit=10').then(r=>r.json());
assert.equal(publicSearch.ok,true);
assert.ok(publicSearch.count>=1);
assert.match(publicSearch.evidence_boundary,/not by itself an adjudicated fact/i);

const publicMeta=await fetch(runtime.service_url+'/v1/public/meta').then(r=>r.json());
assert.equal(publicMeta.finding_rows,3);
assert.equal(publicMeta.unique_finding_numbers,2);
assert.equal(publicMeta.duplicate_number_extra_rows,1);

const publicWrite=await fetch(runtime.service_url+'/v1/ingest',{
  method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify({domain:'findings',records:[]})
});
assert.equal(publicWrite.status,401);

runtime.setDeploymentReceipt('yard:deployment:test');
assert.equal(runtime.health().deployment_receipt_bound,true);
await runtime.close();

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.forensic-record.owned-corpus-proof.v1',
  content_addressed_store:true,
  duplicate_finding_numbers_preserved_and_flagged:true,
  missing_citations_not_fabricated:true,
  version_history_preserved:true,
  read_only_search_runtime:true,
  public_read_only_api:true,
  public_duplicate_variants_preserved:true,
  public_internal_lineage_redacted:true,
  public_write_requires_auth:true,
  systemia_machine_gate:true,
  base44_runtime_required:false,
  yard_receipt_binding_supported:true
},null,2));
