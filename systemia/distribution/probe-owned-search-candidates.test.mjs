import test from 'node:test';
import assert from 'node:assert/strict';
import { CANDIDATES,classifyCandidate,probeCandidate } from './probe-owned-search-candidates.mjs';
const f=CANDIDATES[0],j=CANDIDATES[1];
const sample='<meta name="robots" content="noindex,nofollow"> Missing part.';
const ok=(url,body='Missing part.',xRobots='')=>({observed:true,status:200,final_url:url,content_type:'text/html; charset=utf-8',body,x_robots_tag:xRobots});
const gate={release_phase:'STAGED_NOT_PUBLICLY_RELEASED',launch_permission:false};
test('prelaunch noindex FindMyPart stays held despite a reachable owned URL',()=>{
 const p=classifyCandidate(f,sample,ok(f.url,sample),gate);
 assert.equal(p.state,'OWNED_PAGE_INDEX_HOLD');
 assert.equal(p.source_noindex,true);assert.equal(p.public_noindex,true);
 assert.equal(p.release_authorized,false);assert.equal(p.safe_for_reindex,false);
 assert.equal(p.search_engine_indexing_verified,false);
});
test('a source index hold cannot be bypassed by omitting noindex on the hosted copy',()=>{
 const p=classifyCandidate(f,sample,ok(f.url,'Missing part.'),gate);
 assert.equal(p.state,'OWNED_PAGE_INDEX_HOLD');assert.equal(p.exact_source_readback,false);
});
test('redirect to a legacy or arbitrary host is not first-party verification',()=>{
 const p=classifyCandidate(f,sample,ok('https://findmypart.base44.app/',sample),gate);
 assert.equal(p.state,'PUBLIC_RESPONSE_NOT_VERIFIED');
});
test('a 200 shell with wrong identity is explicitly rejected',()=>{
 const p=classifyCandidate(j,'Evercraft Journal',ok(j.url,'Generic 200 SPA shell'));
 assert.equal(p.state,'PUBLIC_IDENTITY_MISMATCH');
});
test('Journal archive-only source is not a current edition or automatic indexing release',()=>{
 const p=classifyCandidate(j,'Evercraft Journal',ok(j.url,'Evercraft Journal No current live edition'));
 assert.equal(p.state,'OWNED_JOURNAL_ARCHIVE_ONLY');
 assert.equal(p.current_edition_verified,false);assert.equal(p.safe_for_reindex,false);
});
test('network errors remain unknown, never false outage or success',()=>{
 const p=classifyCandidate(f,sample,{observed:false,error:'TypeError'},gate);
 assert.equal(p.state,'PUBLIC_ORIGIN_UNOBSERVED');assert.equal(p.public_http_status,null);
});
test('probe uses read-only GET with no redirects and never calls payment APIs',async()=>{
 let options;
 const result=await probeCandidate(f,{
  load:path=>path===f.source?sample:JSON.stringify(gate),
  fetchFn:async(url,opts)=>{options=opts;return {status:200,url,headers:{get:key=>key==='content-type'?'text/html':null},text:async()=>sample};}
 });
 assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
 assert.equal(result.state,'OWNED_PAGE_INDEX_HOLD');
});
test('reject nonowned origin even if payload looks authentic',()=>{
 assert.throws(()=>classifyCandidate({...f,url:'https://fabric.systemiacommandcenters.com.evil.example/findmypart/'},sample,ok(f.url,sample),gate),/unapproved_owned_search_probe_origin/);
});
