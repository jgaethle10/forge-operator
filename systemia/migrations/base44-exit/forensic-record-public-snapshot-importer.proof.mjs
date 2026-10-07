import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { extractPublicForensicSnapshot } from './forensic-record-public-extractor.mjs';
import { importPublicForensicSnapshot } from './forensic-record-public-snapshot-importer.mjs';

const appId='cccccccccccccccccccccccc';
const datasets={
  ForensicFinding:[
    {id:'f1',finding_number:1,title:'One',source_document:'Doc, page 1',source_url:'',truth_label:'EVIDENCE',quote:'A'},
    {id:'f2',finding_number:2,title:'Two',source_document:'Doc, page 2',source_url:'https://example.test/doc',truth_label:'FACT',quote:'B'},
    {id:'f3',finding_number:2,title:'Duplicate number',source_document:'Doc, page 3',source_url:'https://example.test/doc',truth_label:'EVIDENCE',quote:'C'},
  ],
  Source:[{id:'s1',title:'Doc',url:'https://example.test/doc',status:'ready'}],
  CorpusCoverage:[{id:'c1',corpus_id:'c',label:'Corpus',status:'complete',updated_at:'2026-10-07T00:00:00Z'}],
  ArchiveMeta:[{id:'a1',phase_label:'proof',total_findings:3}],
  CorpusPageIndex:[{id:'p1',page_key:'p1',corpus_id:'c',part_label:'Part',page_number:1,review_status:'reviewed',classification:'substantive_record',source_url:'https://example.test/doc',updated_at:'2026-10-07T00:00:00Z'}],
  DocumentSet:[{id:'d1',name:'Set',pages_analyzed:3,status:'analyzed'}],
  MediaSource:[{id:'m1',media_id:'m1',title:'Video',media_type:'video',source_kind:'other',full_source_url:'https://example.test/video',publication_status:'published'}],
};

function send(res,status,body,type='application/json'){
  res.writeHead(status,{'content-type':type});
  res.end(type==='application/json'?JSON.stringify(body):body);
}
const server=http.createServer((req,res)=>{
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
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const address=server.address();
const origin='http://127.0.0.1:'+address.port;
const root=fs.mkdtempSync(path.join(os.tmpdir(),'forensic-owned-seed-'));
const snapshotDir=path.join(root,'snapshot');
const stateDir=path.join(root,'owned');

try{
  const extraction=await extractPublicForensicSnapshot({
    siteUrl:origin+'/',
    apiOrigin:origin,
    outDir:snapshotDir,
    pageSize:2,
  });
  assert.equal(extraction.receipt.finding_rows,3);

  const receipt=importPublicForensicSnapshot({snapshotDir,stateDir});
  assert.equal(receipt.complete,true);
  assert.equal(receipt.corpus_health.finding_rows,3);
  assert.equal(receipt.corpus_health.unique_finding_numbers,2);
  assert.equal(receipt.corpus_health.duplicate_number_extra_rows,1);
  assert.equal(receipt.corpus_health.missing_page_reference,0);
  assert.equal(receipt.corpus_health.missing_source_url,1);
  assert.equal(receipt.corpus_health.base44_runtime_required,false);
  assert.equal(receipt.protected_entities_imported,false);
  assert.equal(receipt.public_cutover_authorized,false);
  assert.equal(receipt.legacy_retirement_authorized,false);
  assert.ok(fs.existsSync(path.join(stateDir,'index.json')));
  assert.ok(fs.existsSync(path.join(stateDir,'seed-receipt.json')));

  assert.throws(
    ()=>importPublicForensicSnapshot({snapshotDir,stateDir}),
    /target_not_empty/
  );

  const broken=JSON.parse(fs.readFileSync(path.join(snapshotDir,'manifest.json'),'utf8'));
  broken.entities[0].rows+=1;
  fs.writeFileSync(path.join(snapshotDir,'manifest.json'),JSON.stringify(broken,null,2)+'\n');
  assert.throws(
    ()=>importPublicForensicSnapshot({snapshotDir,stateDir:path.join(root,'broken')}),
    /manifest_sha_mismatch/
  );

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.forensic-record.owned-seed-proof.v1',
    raw_snapshot_verified:true,
    legacy_records_adapted:true,
    content_addressed_corpus_seeded:true,
    duplicate_finding_numbers_preserved:true,
    recoverable_page_references_normalized:true,
    protected_ledgers_not_imported:true,
    replay_into_nonempty_target_refused:true,
    manifest_tamper_detection:true,
    base44_runtime_required:false,
    public_cutover_authorized:false
  },null,2));
}finally{
  await new Promise(resolve=>server.close(()=>resolve()));
  fs.rmSync(root,{recursive:true,force:true});
}
