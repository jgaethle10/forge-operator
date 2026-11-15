import test from 'node:test';
import assert from 'node:assert/strict';
import {probeWorldsHeritagePublic} from '../scripts/probe-worlds-heritage-public.mjs';

const origin='https://worlds.example.org';
const entries={
 '/worlds/heritage/':{mime:'text/html; charset=utf-8',body:'<html>EDUCATIONAL SCHEMATIC</html>'},
 '/worlds/heritage/app.mjs':{mime:'text/javascript; charset=utf-8',body:'const buildHeritageDrawList=()=>{};'},
 '/worlds/heritage/scene.mjs':{mime:'text/javascript; charset=utf-8',body:'const id="pavlopetri-learning-scene-v1";'},
 '/worlds/heritage/tour.mjs':{mime:'text/javascript; charset=utf-8',body:'const heritageTourFrame=()=>{};'},
 '/worlds/heritage/atlas/':{mime:'text/html; charset=utf-8',body:'<html>SUBMERGED HERITAGE ATLAS</html>'},
 '/worlds/heritage/atlas/sites.geojson':{mime:'application/geo+json; charset=utf-8',
  body:JSON.stringify({type:'FeatureCollection',features:[
   ...Array.from({length:5},()=>({properties:{classification:'confirmed'}})),
   ...Array.from({length:2},()=>({properties:{classification:'disputed'}}))
  ]})}
};
function transport(mod={}){
 const calls=[];
 const fetchFn=async(url,opts)=>{
  assert.ok(url.startsWith(origin+'/worlds/'));
  assert.equal(opts.redirect,'error');assert.equal(opts.cache,'no-store');
  const path=url.slice(origin.length),entry={...entries[path],...(mod[path]||{})};
  calls.push(path);
  return new Response(entry.body||'',{status:entry.status||200,headers:{'content-type':entry.mime||'text/plain','access-control-allow-origin':entry.cors||''}});
 };
 return {fetchFn,calls};
}
test('external heritage route passes only when all six owned HTTPS resources match',async()=>{
 const t=transport();
 const result=await probeWorldsHeritagePublic(origin,{fetchFn:t.fetchFn});
 assert.equal(result.verified,true);
 assert.equal(result.checked_paths.length,6);
 assert.equal(result.write_test_performed,false);
 assert.deepEqual(result.checked_paths,t.calls);
});
test('fails closed when a nested route is missing',async()=>{
 const t=transport({'/worlds/heritage/':{status:404}});
 const r=await probeWorldsHeritagePublic(origin,{fetchFn:t.fetchFn});
 assert.equal(r.verified,false);assert.equal(r.reason,'http_not_200');assert.equal(r.path,'/worlds/heritage/');
});
test('rejects a soft-200 wrong page, a bad module MIME, and wildcard CORS',async()=>{
 for(const [path,change,reason] of [
  ['/worlds/heritage/atlas/',{body:'wrong content'},'unexpected_content'],
  ['/worlds/heritage/app.mjs',{mime:'text/html'},'javascript_content_type_mismatch'],
  ['/worlds/heritage/tour.mjs',{status:404},'http_not_200'],
  ['/worlds/heritage/',{cors:'*'},'unsafe_cors']
 ]){
  const t=transport({[path]:change}),r=await probeWorldsHeritagePublic(origin,{fetchFn:t.fetchFn});
  assert.equal(r.verified,false);assert.equal(r.reason,reason);assert.equal(r.path,path);
 }
});
test('does not certify missing or reclassified evidence',async()=>{
 const t=transport({'/worlds/heritage/atlas/sites.geojson':{body:JSON.stringify({type:'FeatureCollection',features:[]})}});
 const r=await probeWorldsHeritagePublic(origin,{fetchFn:t.fetchFn});
 assert.equal(r.verified,false);assert.equal(r.reason,'unexpected_evidence_records');
});
test('rejects http, pathful or credential-bearing public origins',async()=>{
 for(const url of ['http://worlds.example.org','https://worlds.example.org/path','https://user:pass@worlds.example.org']){
  await assert.rejects(()=>probeWorldsHeritagePublic(url,{fetchFn:transport().fetchFn}));
 }
});
