import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {classifyJournalEdition,probeJournalOwnedEdge} from './journal-edge-readiness.mjs';

const origin='https://fabric.systemiacommandcenters.com/journal';
const now=new Date('2026-10-21T20:00:00.000Z');
const digest=text=>crypto.createHash('sha256').update(text).digest('hex');
function fixture({live=false,stale=false}={}){
  const slug=live?'current-proof':'archived-proof';
  const story_id=live?'journal:current-proof':'journal:archived-proof';
  const canonical_url=origin+'/'+slug+'/';
  const article='<html><head><meta name="evercraft:story_id" content="'+story_id+'"><link rel="canonical" href="'+canonical_url+'"><meta property="og:url" content="'+canonical_url+'"></head><body>Evercraft Journal</body></html>';
  const entry={story_id,slug,title:'Archive identity',canonical_url,
    ...(live?{}:{state:'archived',freshness_expires_at:'2026-10-19T20:00:00.000Z'})};
  const index={schema:'evercraft.journal.index.v1',live_edition:live,
    stories:live?[entry]:[],archive:live?[]:[entry]};
  const receipt={story_id,slug,canonical_url,article_sha256:digest(article),
    publication_state:live?'live':'archived',
    live_edition_eligible:live,
    freshness_expires_at:stale?'2026-10-20T20:00:00.000Z':'2026-10-22T20:00:00.000Z'};
  const fetched=[];
  const fetchImpl=async(url)=>{
    fetched.push(url);
    if(url===origin+'/')return response(200,'<title>Evercraft Journal</title>','text/html');
    if(url===origin+'/index.json')return response(200,index,'application/json');
    if(url===canonical_url)return response(200,article,'text/html');
    if(url===origin+'/receipts/'+slug+'.json')return response(200,receipt,'application/json');
    return response(404,{error:'not_found'},'application/json');
  };
  return {index,receipt,article,fetched,fetchImpl};
}
function response(status,body,type){
  return {ok:status>=200&&status<300,status,headers:new Headers({'content-type':type}),
    async text(){return typeof body==='string'?body:JSON.stringify(body)},
    async json(){return typeof body==='string'?JSON.parse(body):body}};
}
test('archive only is explicitly degraded even when web route, identity and digest all work',async()=>{
  const {fetchImpl,fetched}=fixture();
  const result=await probeJournalOwnedEdge({origin,fetchImpl,now});
  assert.equal(result.state,'archive_only_degraded');
  assert.equal(result.archive_verified,true);
  assert.equal(result.transport_verified,true);
  assert.equal(result.current_edition_verified,false);
  assert.equal(result.newsroom_active,false);
  assert.equal(result.error,'journal_live_edition_missing');
  assert.equal(fetched.length,4);
});
test('approved current edition with matching receipt and unexpired evidence is verified',async()=>{
  const {fetchImpl}=fixture({live:true});
  const result=await probeJournalOwnedEdge({origin,fetchImpl,now});
  assert.equal(result.state,'current_edition_verified');
  assert.equal(result.current_edition_verified,true);
  assert.equal(result.newsroom_active,true);
  assert.equal(result.checks.receipt_digest,true);
});
test('a stale live receipt is never elevated to healthy',async()=>{
  const {fetchImpl}=fixture({live:true,stale:true});
  const result=await probeJournalOwnedEdge({origin,fetchImpl,now});
  assert.equal(result.state,'unavailable');
  assert.equal(result.current_edition_verified,false);
  assert.match(result.error,/live_receipt_expired/);
});
test('an expired story presented as live does not get converted to an archive pass',()=>{
  const {index}=fixture({live:true});
  index.live_edition=false;
  assert.throws(()=>classifyJournalEdition(index,{now}),/live_flag_drift/);
});
test('the index cannot silently call an archive a current story',()=>{
  const {index}=fixture();
  index.live_edition=true;
  assert.throws(()=>classifyJournalEdition(index,{now}),/live_flag_drift/);
});
test('a forged remote story hash produces an explicit failure',async()=>{
  const item=fixture();
  item.receipt.article_sha256='0'.repeat(64);
  const result=await probeJournalOwnedEdge({origin,fetchImpl:item.fetchImpl,now});
  assert.equal(result.state,'unavailable');
  assert.match(result.error,/receipt_drift/);
});
test('an archived receipt claiming live is rejected',async()=>{
  const item=fixture();
  item.receipt.publication_state='live';
  const result=await probeJournalOwnedEdge({origin,fetchImpl:item.fetchImpl,now});
  assert.equal(result.state,'unavailable');
  assert.match(result.error,/archive_receipt_claims_live/);
});
test('unavailable or broken primary site is not an archive success',async()=>{
  const item=fixture();
  const result=await probeJournalOwnedEdge({
    origin,now,fetchImpl:async(url)=>url===origin+'/'?response(502,'upstream error','text/html'):item.fetchImpl(url),
  });
  assert.equal(result.state,'unavailable');
  assert.equal(result.transport_verified,false);
  assert.equal(result.archive_verified,false);
});
test('archive links must be within the configured first-party Journal origin',async()=>{
  const item=fixture();
  item.index.archive[0].canonical_url='https://journal.evercraft.global/archived-proof/';
  const result=await probeJournalOwnedEdge({origin,fetchImpl:item.fetchImpl,now});
  assert.equal(result.state,'unavailable');
  assert.match(result.error,/canonical_origin_mismatch/);
});
test('live and archive cannot reuse the same identity',()=>{
  const item=fixture({live:true});
  item.index.archive.push({...item.index.stories[0],state:'archived'});
  assert.throws(()=>classifyJournalEdition(item.index,{now}),/duplicate_story/);
});
