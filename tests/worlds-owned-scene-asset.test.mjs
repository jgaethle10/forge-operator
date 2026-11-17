import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {admitOwnedGlb,parseOwnedGlb} from '../public/worlds/owned-glb.mjs';
import {createMossmereStoneGlb} from '../public/worlds/assets/mossmere-weathered-stone-generator.mjs';
import {loadOwnedSceneMesh} from '../public/worlds/owned-asset-client.mjs';
const rightsUrl=new URL('../public/worlds/assets/mossmere-weathered-stone.rights.json',import.meta.url);
test('original authored model produces repeatable real GLB bytes admitted by fixed SHA-256',async()=>{
 const bytes=createMossmereStoneGlb(),again=createMossmereStoneGlb();
 const manifest=JSON.parse(await readFile(rightsUrl,'utf8'));
 assert.deepEqual(bytes,again);
 assert.equal(new DataView(bytes.buffer).getUint32(0,true),0x46546c67);
 assert.equal(new DataView(bytes.buffer).getUint32(8,true),bytes.length);
 const model=await admitOwnedGlb(bytes,manifest);
 assert.equal(model.triangleCount,120);
 assert.equal(model.vertexCount,62);
 assert.equal(model.positions.length,1080);
 assert.equal(model.rights.digest_verified,true);
 assert.equal(model.rights.license,'Evercraft-original');
 assert.equal(model.material.model,'pbr');
});
test('generic owned asset client still admits future same-origin GLBs using manifest',async()=>{
 const bytes=createMossmereStoneGlb(),manifest=JSON.parse(await readFile(rightsUrl,'utf8'));
 const fetched=await loadOwnedSceneMesh('mossmere-weathered-stone',{
  baseUrl:'https://worlds.example.test/worlds/assets/',
  fetchFn:async url=>url.endsWith('.glb')?new Response(bytes):Response.json(manifest)
 });
 assert.equal(fetched.triangleCount,120);
 assert.equal(fetched.rights.digest_verified,true);
});
test('tampered source or rights never enters the world render path',async()=>{
 const bytes=createMossmereStoneGlb(),manifest=JSON.parse(await readFile(rightsUrl,'utf8'));
 const tampered=new Uint8Array(bytes);tampered[tampered.length-11]^=1;
 await assert.rejects(admitOwnedGlb(tampered,manifest),/sha256_mismatch/);
 await assert.rejects(loadOwnedSceneMesh('../escape',{baseUrl:'https://worlds.example.test/worlds/assets/',fetchFn:async()=>{throw Error('never')}}),/name_invalid/);
 await assert.rejects(loadOwnedSceneMesh('mossmere-weathered-stone',{baseUrl:'https://worlds.example.test/worlds/assets/',fetchFn:async()=>new Response('missing',{status:404})}),/unavailable/);
});
