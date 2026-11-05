import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {startWorldsVault} from '../systemia/worlds/worlds-vault-runtime.mjs';
import {encodeSharedScene} from '../public/worlds/share-scene.mjs';
import {initialWorld} from '../public/worlds/world-core.mjs';
import {checkWorldsOrigin,probeWorldsPublic} from '../scripts/probe-worlds-public.mjs';
import {probeHiddenWorldPublic} from '../scripts/probe-hidden-world-public.mjs';
const json=(url,origin)=>fetch(url,{method:'POST',headers:{'content-type':'application/json',...(origin?{origin}:{})},body:JSON.stringify({scene_token:encodeSharedScene(initialWorld())})});
test('vault accepts configured public origin behind proxy and rejects cross-site writes',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'evercraft-worlds-origin-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const vault=await startWorldsVault({dataRoot:path.join(dir,'vault'),publicRoot:path.resolve('public'),publicOrigin:'https://worlds.example.org'});
 t.after(()=>vault.close());
 assert.equal((await json(vault.url+'/worlds/api/worlds','https://worlds.example.org')).status,201);
 for(const origin of ['https://attacker.example.org','not-an-origin','http://worlds.example.org'])
  assert.equal((await json(vault.url+'/worlds/api/worlds',origin)).status,403);
 await assert.rejects(()=>startWorldsVault({dataRoot:path.join(dir,'bad'),publicRoot:path.resolve('public'),host:'0.0.0.0'}),/loopback/);
 await assert.rejects(()=>startWorldsVault({dataRoot:path.join(dir,'bad2'),publicRoot:path.resolve('public'),publicOrigin:'http://worlds.example.org'}),/public_origin/);
});
test('public probe rejects untrusted URLs and false service status',async()=>{
 assert.equal(checkWorldsOrigin('https://worlds.example.org/'),'https://worlds.example.org');
 for(const bad of ['http://example.org','https://worlds.example.org/path','https://x.base44.app','https://a.example.org/?secret=1'])
  assert.throws(()=>checkWorldsOrigin(bad));
 const missing=await probeWorldsPublic('https://worlds.example.org',{fetchFn:async()=>({status:404})});
 assert.equal(missing.verified,false);assert.equal(missing.reason,'vault_health_status');
 const response=(status,body,headers={})=>({status,headers:{get:name=>headers[name]||null},json:async()=>JSON.parse(body),text:async()=>body});
 const healthy=await probeWorldsPublic('https://worlds.example.org',{fetchFn:async url=>{
  if(url.endsWith('/health'))return response(200,JSON.stringify({schema:'evercraft.worlds.vault.v1',ok:true,mode:'owned-durable-vault'}));
  if(url.endsWith('/cloud-client.mjs'))return response(200,'export function publishWorld(){}');
  return response(200,'EVERCRAFT world');
 }});
 assert.equal(healthy.verified,true);assert.equal(healthy.write_test_performed,false);
 const unsafe=await probeWorldsPublic('https://worlds.example.org',{fetchFn:async()=>response(200,'{}',{'access-control-allow-origin':'*'})});
 assert.equal(unsafe.reason,'unsafe_cors');
});

test('Hidden World public proof requires all four owned-origin artifacts',async()=>{
 const response=(status,body,type='text/html')=>({status,headers:{get:key=>key==='content-type'?type:null},json:async()=>JSON.parse(body),text:async()=>body});
 const health=JSON.stringify({schema:'evercraft.worlds.vault.v1',ok:true,mode:'owned-durable-vault'});
 const mock=async url=>{
  if(url.endsWith('/api/health'))return response(200,health,'application/json');
  if(url.endsWith('/hidden-world/'))return response(200,'Hidden World Atlas');
  if(url.endsWith('/yakima-evidence.html'))return response(200,'Connected tunnels established by the records reviewed');
  if(url.endsWith('/yakima-standalone.html'))return response(200,'scene-ready');
  if(url.endsWith('.csv'))return response(200,'id,title\nyakima,example','text/csv');
  if(url.endsWith('yakima-evidence-ledger.v1.json'))return response(200,JSON.stringify({schema:'evercraft.hidden-world.evidence-ledger.v1'}),'application/json');
  return response(404,'not found');
 };
 const healthy=await probeHiddenWorldPublic('https://worlds.example.org',{fetchFn:mock});
 assert.equal(healthy.verified,true);
 assert.equal(healthy.physical_iphone_verified,false);
 assert.equal(healthy.write_test_performed,false);
 const missing=await probeHiddenWorldPublic('https://worlds.example.org',{fetchFn:async url=>
  url.endsWith('yakima-evidence.html')?response(404,'not deployed'):mock(url)});
 assert.equal(missing.verified,false);
 assert.equal(missing.reason,'yakima_evidence_not_verified');
 const wrongMime=await probeHiddenWorldPublic('https://worlds.example.org',{fetchFn:async url=>
  url.endsWith('.csv')?response(200,'yakima,','text/html'):mock(url)});
 assert.equal(wrongMime.reason,'research_data_not_verified');
 const wrongRuntime=await probeHiddenWorldPublic('https://worlds.example.org',{fetchFn:async url=>
  url.endsWith('/api/health')?response(200,JSON.stringify({ok:true,schema:'another.service'}),'application/json'):mock(url)});
 assert.equal(wrongRuntime.reason,'worlds_runtime_identity_mismatch');
});
