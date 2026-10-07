import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {
  PUBLIC_FORENSIC_ENTITIES,
  discoverLegacyForensicApp,
  extractPublicForensicSnapshot
} from './forensic-record-public-extractor.mjs';

const appId='aaaaaaaaaaaaaaaaaaaaaaaa';
const wrongId='bbbbbbbbbbbbbbbbbbbbbbbb';
const datasets={
  ForensicFinding:[
    {id:'1',finding_number:1,title:'One',source_document:'Doc, page 1',truth_label:'EVIDENCE'},
    {id:'2',finding_number:2,title:'Two',source_document:'Doc, page 2',page_reference:'page 2',source_url:'https://example.test/2',truth_label:'FACT'},
    {id:'3',finding_number:2,title:'Collision',source_document:'Doc, page 3',page_reference:'page 3',source_url:'https://example.test/3',truth_label:'EVIDENCE'},
  ],
  Source:[{id:'s1',title:'Doc'}],
  CorpusCoverage:[{id:'c1',corpus_id:'c',label:'Corpus',status:'partial'}],
  ArchiveMeta:[{id:'m1',phase_label:'proof'}],
  CorpusPageIndex:[{id:'p1',page_key:'p1',corpus_id:'c',part_label:'Part',page_number:1,review_status:'reviewed',classification:'substantive_record',source_url:'https://example.test/doc',updated_at:'2026-10-07T00:00:00Z'}],
  DocumentSet:[{id:'d1',name:'Set'}],
  MediaSource:[{id:'v1',media_id:'v1',title:'Video',media_type:'video',source_kind:'other',full_source_url:'https://example.test/v',publication_status:'published'}],
};

function send(res,status,body,type='application/json'){
  res.writeHead(status,{'content-type':type});
  res.end(type==='application/json'?JSON.stringify(body):body);
}
let truncateFindings=false;
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/'){
    return send(res,200,`<html><script>window.APP="${wrongId}"</script><script src="/assets/app.js"></script></html>`,'text/html');
  }
  if(url.pathname==='/assets/app.js'){
    return send(res,200,`const appId="${appId}";`,'application/javascript');
  }
  const countMatch=url.pathname.match(/^\/api\/apps\/([a-f0-9]{24})\/entities\/([^/]+)\/count$/);
  if(countMatch){
    const [,id,entity]=countMatch;
    if(id!==appId||!datasets[entity]) return send(res,404,{error:'not_found'});
    return send(res,200,{count:datasets[entity].length});
  }
  const listMatch=url.pathname.match(/^\/api\/apps\/([a-f0-9]{24})\/entities\/([^/]+)\/v2\/list$/);
  if(listMatch){
    const [,id,entity]=listMatch;
    if(id!==appId||!datasets[entity]) return send(res,404,{error:'not_found'});
    const rows=datasets[entity];
    const cursor=Number(url.searchParams.get('cursor')||0);
    const limit=Math.max(1,Math.min(2,Number(url.searchParams.get('limit')||2)));
    const items=rows.slice(cursor,cursor+limit);
    let next=cursor+items.length;
    const hasMore=next<rows.length;
    if(truncateFindings&&entity==='ForensicFinding'&&cursor===0){
      return send(res,200,{items:items.slice(0,1),next_cursor:null,has_more:false});
    }
    return send(res,200,{items,next_cursor:hasMore?String(next):null,has_more:hasMore});
  }
  return send(res,404,{error:'not_found'});
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const address=server.address();
const origin='http://127.0.0.1:'+address.port;
const root=fs.mkdtempSync(path.join(os.tmpdir(),'forensic-public-snapshot-'));

try{
  const discovered=await discoverLegacyForensicApp({siteUrl:origin+'/',apiOrigin:origin});
  assert.equal(discovered.appId,appId);
  assert.equal(discovered.findingCount,3);
  assert.match(discovered.appIdSha256,/^sha256:[a-f0-9]{64}$/);
  assert.notEqual(discovered.appIdSha256,'sha256:'+appId);

  const result=await extractPublicForensicSnapshot({
    siteUrl:origin+'/',
    apiOrigin:origin,
    outDir:root,
    pageSize:2,
  });
  assert.equal(result.receipt.finding_rows,3);
  assert.equal(result.receipt.entity_count,PUBLIC_FORENSIC_ENTITIES.length);
  assert.equal(result.receipt.protected_entities_excluded,true);
  assert.equal(result.receipt.legacy_app_id_persisted,false);
  assert.equal(result.receipt.public_cutover_authorized,false);
  assert.equal(result.manifest.finding_integrity.unique_finding_numbers,2);
  assert.equal(result.manifest.finding_integrity.duplicate_number_extra_rows,1);
  assert.equal(result.manifest.finding_integrity.missing_page_reference,1);
  assert.equal(result.manifest.finding_integrity.missing_source_url,1);
  const persisted=fs.readFileSync(path.join(root,'manifest.json'),'utf8')+
    fs.readFileSync(path.join(root,'extraction-receipt.json'),'utf8');
  assert.equal(persisted.includes(appId),false);
  assert.equal(persisted.includes('LegacyFindingAudit'),true);
  assert.equal(persisted.includes('Chunk'),true);

  truncateFindings=true;
  await assert.rejects(
    extractPublicForensicSnapshot({
      siteUrl:origin+'/',
      apiOrigin:origin,
      outDir:path.join(root,'truncated'),
      entities:['ForensicFinding'],
      pageSize:2,
    }),
    /terminal_count_mismatch/
  );

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.forensic-record.public-snapshot-proof.v1',
    app_discovery_without_persisting_id:true,
    cursor_pagination:true,
    exact_count_reconciliation:true,
    content_addressed_files:true,
    duplicate_shape_measured:true,
    protected_ledgers_excluded:true,
    truncated_stream_fails_closed:true,
    public_cutover_authorized:false
  },null,2));
}finally{
  await new Promise(resolve=>server.close(()=>resolve()));
  fs.rmSync(root,{recursive:true,force:true});
}
