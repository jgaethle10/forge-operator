import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {admitOwnedGlb} from '../public/worlds/owned-glb.mjs';
import {loadOwnedSceneMesh} from '../public/worlds/owned-asset-client.mjs';
const asset=new URL('../public/worlds/assets/mossmere-weathered-stone.glb',import.meta.url);
const rightsUrl=new URL('../public/worlds/assets/mossmere-weathered-stone.rights.json',import.meta.url);
test('original sculpted pond stone is real binary GLB, hash-verified and admitted',async()=>{
 const bytes=await readFile(asset),manifest=JSON.parse(await readFile(rightsUrl,'utf8'));
 assert.equal(bytes.readUInt32LE(0),0x46546c67);
 const model=await admitOwnedGlb(bytes,manifest);
 assert.equal(model.schema,'evercraft.worlds.asset-mesh.v1');
 assert.equal(model.triangleCount,120);
 assert.equal(model.vertexCount,62);
 assert.equal(model.positions.length,1080);
 assert.equal(model.rights.license,'Evercraft-original');
 assert.equal(model.rights.digest_verified,true);
 assert.equal(model.material.model,'pbr');
});
test('same-origin browser asset route verifies model and approved manifest before use',async()=>{
 const bytes=await readFile(asset),manifest=JSON.parse(await readFile(rightsUrl,'utf8'));
 let requests=0;
 const fetched=await loadOwnedSceneMesh('mossmere-weathered-stone',{
  baseUrl:'https://worlds.example.test/worlds/assets/',
  fetchFn:async url=>{
   requests++;
   if(url.endsWith('.glb'))return new Response(bytes,{headers:{'content-length':String(bytes.length)}});
   if(url.endsWith('.rights.json'))return Response.json(manifest);
   throw Error('unexpected_asset_url');
  }
 });
 assert.equal(requests,2);
 assert.equal(fetched.triangleCount,120);
 assert.equal(fetched.rights.digest_verified,true);
});
test('client refuses unsafe asset names, missing files and mismatched digests',async()=>{
 const bytes=await readFile(asset),rights=JSON.parse(await readFile(rightsUrl,'utf8'));
 const baseUrl='https://worlds.example.test/worlds/assets/';
 await assert.rejects(loadOwnedSceneMesh('../evil',{baseUrl,fetchFn:async()=>{throw Error('should not fetch')}}),/name_invalid/);
 await assert.rejects(loadOwnedSceneMesh('mossmere-weathered-stone',{baseUrl,fetchFn:async()=>new Response('missing',{status:404})}),/unavailable/);
 await assert.rejects(loadOwnedSceneMesh('mossmere-weathered-stone',{baseUrl,fetchFn:async url=>
  url.endsWith('.glb')?new Response(bytes):Response.json({...rights,sha256:'0'.repeat(64)})}),/sha256_mismatch/);
});
