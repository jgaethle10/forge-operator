import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { startEvercraftComputeNode } from '../compute/runtime-node.mjs';
import { YardOperator } from './operator.mjs';

const appId='dddddddddddddddddddddddd';
const datasets={
  ForensicFinding:[
    {id:'f1',finding_number:1,title:'Seeded one',source_document:'Proof source, page 1',source_url:'https://example.test/source',truth_label:'EVIDENCE',quote:'A'},
    {id:'f2',finding_number:2,title:'Seeded two',source_document:'Proof source, page 2',source_url:'https://example.test/source',truth_label:'FACT',quote:'B'},
    {id:'f3',finding_number:2,title:'Seeded collision',source_document:'Proof source, page 3',source_url:'',truth_label:'EVIDENCE',quote:'C'},
  ],
  Source:[{id:'s1',title:'Proof source',url:'https://example.test/source',status:'ready'}],
  CorpusCoverage:[{id:'c1',corpus_id:'proof',label:'Proof corpus',status:'complete',updated_at:'2026-10-07T00:00:00Z'}],
  ArchiveMeta:[{id:'a1',phase_label:'proof',total_findings:3}],
  CorpusPageIndex:[{id:'p1',page_key:'p1',corpus_id:'proof',part_label:'Part',page_number:1,review_status:'reviewed',classification:'substantive_record',source_url:'https://example.test/source',updated_at:'2026-10-07T00:00:00Z'}],
  DocumentSet:[{id:'d1',name:'Proof set',pages_analyzed:3,status:'analyzed'}],
  MediaSource:[{id:'m1',media_id:'m1',title:'Proof media',media_type:'video',source_kind:'other',full_source_url:'https://example.test/media',publication_status:'published'}],
};
let sourceRequests=0;
function send(res,status,body,type='application/json'){
  res.writeHead(status,{'content-type':type});
  res.end(type==='application/json'?JSON.stringify(body):body);
}
const legacy=http.createServer((req,res)=>{
  sourceRequests++;
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/') return send(res,200,`<html><body data-app="${appId}"></body></html>`,'text/html');
  const count=url.pathname.match(/^\/api\/apps\/([a-f0-9]{24})\/entities\/([^/]+)\/count$/);
  if(count){
    if(count[1]!==appId||!datasets[count[2]]) return send(res,404,{error:'not_found'});
    return send(res,200,{count:datasets[count[2]].length});
  }
  const list=url.pathname.match(/^\/api\/apps\/([a-f0-9]{24})\/entities\/([^/]+)\/v2\/list$/);
  if(list){
    if(list[1]!==appId||!datasets[list[2]]) return send(res,404,{error:'not_found'});
    const rows=datasets[list[2]];
    const cursor=Number(url.searchParams.get('cursor')||0);
    const items=rows.slice(cursor,cursor+2);
    const next=cursor+items.length;
    return send(res,200,{items,next_cursor:next<rows.length?String(next):null,has_more:next<rows.length});
  }
  return send(res,404,{error:'not_found'});
});
await new Promise((resolve,reject)=>{legacy.once('error',reject);legacy.listen(0,'127.0.0.1',resolve);});
const legacyAddress=legacy.address();
const legacyOrigin='http://127.0.0.1:'+legacyAddress.port;

const root=fs.mkdtempSync(path.join(os.tmpdir(),'forensic-seeded-runtime-'));
const computeRoot=path.join(root,'compute');
const yardRoot=path.join(root,'yard');
const stateRoot=path.join(computeRoot,'forensic-seeded');

const oldMachine=process.env.SYSTEMIA_MACHINE_KEY;
const oldIngest=process.env.FORENSIC_RECORD_INGEST_TOKEN;
process.env.SYSTEMIA_MACHINE_KEY='seed-proof-machine';
process.env.FORENSIC_RECORD_INGEST_TOKEN='seed-proof-ingest';

const node=await startEvercraftComputeNode({root:computeRoot,nodeId:'forensic-seed-proof-node'});
const yard=new YardOperator({stateDir:yardRoot});

try{
  const args={
    releaseRef:'8fef03ad9d83ac6402018feca8aba5636fa0b6e3',
    workloadClass:'systemia.forensic-record-runtime.v1',
    capacityEndpoint:node.endpoint,
    input:{
      state_root:stateRoot,
      require_public_seed:true,
      bootstrap_public_snapshot:true,
      public_snapshot_site_url:legacyOrigin+'/',
      public_snapshot_api_origin:legacyOrigin,
    },
    rollbackTarget:'proof:forensic-seed-previous',
    leaseTtlMs:120000,
  };

  const first=await yard.deployRelease({deploymentId:'forensic-seed-first',...args});
  assert.equal(first.state,'ready');
  assert.equal(first.receipt.health_verification,'healthy');
  assert.equal(first.result.seed_required,true);
  assert.equal(first.result.seed_state,'bootstrapped_from_public_migration_source');
  assert.equal(first.result.seed_finding_rows,3);
  assert.equal(first.result.seed_unique_finding_numbers,2);
  assert.equal(first.result.seed_duplicate_number_extra_rows,1);

  const firstHealth=await fetch(first.result.local_url+'/health').then(r=>r.json());
  assert.equal(firstHealth.seed_receipt_present,true);
  assert.equal(firstHealth.seed_complete,true);
  assert.equal(firstHealth.seed_protected_entities_imported,false);
  assert.equal(firstHealth.finding_rows,3);
  assert.equal(firstHealth.unique_finding_numbers,2);
  assert.equal(firstHealth.duplicate_number_extra_rows,1);
  assert.equal(firstHealth.missing_page_reference,0);
  assert.equal(firstHealth.base44_runtime_required,false);
  assert.equal(firstHealth.deployment_receipt_ref,first.receipt.receipt_hash);
  assert.match(firstHealth.seed_source_manifest_sha256,/^sha256:[a-f0-9]{64}$/);

  const afterBootstrapRequests=sourceRequests;
  assert.ok(afterBootstrapRequests>0);
  await yard.stopDeployment('forensic-seed-first',{reason:'proof_restart'});

  const second=await yard.deployRelease({deploymentId:'forensic-seed-second',...args});
  assert.equal(second.state,'ready');
  assert.equal(second.result.seed_state,'reused_verified_seed');
  assert.equal(second.result.seed_finding_rows,3);
  assert.equal(sourceRequests,afterBootstrapRequests,'restart must reuse owned seed without re-reading legacy source');

  const secondHealth=await fetch(second.result.local_url+'/health').then(r=>r.json());
  assert.equal(secondHealth.seed_complete,true);
  assert.equal(secondHealth.finding_rows,3);
  assert.equal(secondHealth.base44_runtime_required,false);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.forensic-record.seeded-resident-runtime-proof.v1',
    first_boot_terminal_public_extraction:true,
    content_addressed_owned_seed:true,
    yard_seed_health_gate:true,
    restart_reuses_owned_seed:true,
    recurring_legacy_runtime_dependency:false,
    protected_ledgers_not_imported:true,
    finding_rows:secondHealth.finding_rows,
    unique_finding_numbers:secondHealth.unique_finding_numbers,
    duplicate_number_extra_rows:secondHealth.duplicate_number_extra_rows
  },null,2));
}finally{
  await node.close();
  await new Promise(resolve=>legacy.close(()=>resolve()));
  if(oldMachine===undefined) delete process.env.SYSTEMIA_MACHINE_KEY; else process.env.SYSTEMIA_MACHINE_KEY=oldMachine;
  if(oldIngest===undefined) delete process.env.FORENSIC_RECORD_INGEST_TOKEN; else process.env.FORENSIC_RECORD_INGEST_TOKEN=oldIngest;
  fs.rmSync(root,{recursive:true,force:true});
}
