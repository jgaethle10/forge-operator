import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {NAVIGATION_ASSETS,probeWorldsNavigationPublic,WORLDS_NAVIGATION_READBACK_SCHEMA} from '../scripts/probe-worlds-navigation-public.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const origin='https://worlds.example.test';
function fakeEdge({tamper=null,badType=null,status=null,cors=false}={}){
 return async (url,opts)=>{
  assert.equal(url.startsWith(origin+'/worlds/'),true,'Only owned Worlds routes should be fetched');
  assert.equal(opts.redirect,'error');
  assert.equal(opts.cache,'no-store');
  assert.ok(opts.signal);
  const asset=NAVIGATION_ASSETS.find(x=>url===origin+x.path);
  assert.ok(asset,'No unrecognized endpoint may be fetched');
  const headers={'content-type':asset.mime+(asset.mime==='text/html'?'; charset=utf-8':'')};
  if(cors)headers['access-control-allow-origin']='*';
  let bytes=readFileSync(resolve(root,asset.file));
  if(tamper===asset.path)bytes=Buffer.from('old or replaced asset');
  if(badType===asset.path)headers['content-type']='text/plain';
  return new Response(bytes,{status:status===asset.path?404:200,headers});
 };
}
test('Navigation manifest covers current seven-destination gateway and three interactive entrances',()=>{
 assert.equal(NAVIGATION_ASSETS.length,9);
 const names=NAVIGATION_ASSETS.map(x=>x.path);
 assert.equal(new Set(names).size,names.length);
 for(const path of ['/worlds/gateway/','/worlds/destinations.v1.json','/worlds/wayfinder.mjs','/worlds/','/worlds/flight/','/worlds/hidden-world/yakima-walk/'])assert.ok(names.includes(path),path);
});
test('Read-only source-to-public SHA-256 verification passes matching owned HTTPS assets',async()=>{
 const receipt=await probeWorldsNavigationPublic(origin,{fetchFn:fakeEdge()});
 assert.equal(receipt.schema,WORLDS_NAVIGATION_READBACK_SCHEMA);
 assert.equal(receipt.verified,true);
 assert.equal(receipt.read_only,true);
 assert.equal(receipt.physical_device_verified,false);
 assert.equal(receipt.world_state_transferred,false);
 assert.equal(receipt.checks.length,NAVIGATION_ASSETS.length);
 assert.ok(receipt.checks.every(x=>x.verified&&/^[a-f0-9]{64}$/.test(x.sha256)));
});
test('Stale or missing public file fails closed with identified exact path',async()=>{
 for(const [options,reason] of [
  [{tamper:'/worlds/wayfinder.mjs'},'source_public_hash_mismatch'],
  [{status:'/worlds/gateway/'},'http_not_200'],
  [{badType:'/worlds/destinations.v1.json'},'content_type_mismatch'],
  [{cors:true},'unsafe_cors']
 ]){
  const receipt=await probeWorldsNavigationPublic(origin,{fetchFn:fakeEdge(options)});
  assert.equal(receipt.verified,false);
  assert.equal(receipt.reason,reason);
  assert.ok(receipt.failed_path.startsWith('/worlds/'));
 }
});
test('Reject insecure or offsite origins before any network access',async()=>{
 for(const invalid of ['http://worlds.example.test','https://worlds.example.test/a','https://user:pass@worlds.example.test','']){
  let called=false;
  const receipt=await probeWorldsNavigationPublic(invalid,{fetchFn:async()=>{called=true;throw Error('No request allowed')}});
  assert.equal(receipt.verified,false);
  assert.equal(receipt.reason,'invalid_owned_https_origin');
  assert.equal(called,false);
 }
});
test('Unreachable edge and unavailable local source never give a PASS',async()=>{
 const unreachable=await probeWorldsNavigationPublic(origin,{fetchFn:async()=>{throw Error('network down')}});
 assert.equal(unreachable.reason,'public_fetch_failed');
 assert.equal(unreachable.verified,false);
 const unavailable=await probeWorldsNavigationPublic(origin,{readFn:()=>{throw Error('missing local file')},fetchFn:fakeEdge()});
 assert.equal(unavailable.reason,'local_source_unavailable');
 assert.equal(unavailable.verified,false);
});
