import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ASSETS, RESIDENT_ORIGIN, classifyResidentAsset,probeAidenLabResident} from '../scripts/probe-aiden-lab-resident.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const bytes=(name)=>fs.readFileSync(path.join(ROOT,name==='classroom/index.html'?'public/apps/infinite-classroom/play/index.html':'public/aiden-lab/'+name),'utf8');
const assetPath=(url)=>new URL(url).pathname.slice('/aiden-lab/'.length);
const mime=(name)=>name.endsWith('.html')?'text/html; charset=utf-8':
  name.endsWith('.mjs')?'text/javascript; charset=utf-8':
  name.endsWith('.css')?'text/css; charset=utf-8':'image/svg+xml';
const server=(overrides={})=>async(url)=>{
  const name=assetPath(url);
  const fixture={status:200,url,
    headers:{get:(key)=>key==='x-evercraft-static-program'?'aidens-lab-v1':key==='x-evercraft-learning-world'?(name==='classroom/index.html'?'classroom-practice-v1':null):
      key==='content-type'?mime(name):null},
    text:async()=>bytes(name)};
  return {...fixture,...overrides};
};

test('owned resident release proof matches all seven public campus assets',async()=>{
  assert.equal(ASSETS.length,8);
  const receipt=await probeAidenLabResident({sourceRoot:ROOT,fetcher:server(),now:new Date('2026-11-20T00:00:00Z')});
  assert.equal(receipt.verified,true);
  assert.equal(receipt.release_state,'RESIDENT_PARITY_VERIFIED');
  assert.equal(receipt.assets.length,8);
  assert.equal(receipt.no_external_action_taken,true);
  assert.equal(receipt.no_private_data_accessed,true);
});

test('resident parity fails closed on stale scripts, spoofed marker and redirects',async()=>{
  const asset=ASSETS[0],source=bytes(asset.name);
  const accepted={status:200,final_url:RESIDENT_ORIGIN+'/aiden-lab/index.html',
    content_type:'text/html; charset=utf-8',marker:'aidens-lab-v1',body:source};
  assert.equal(classifyResidentAsset({asset,source,response:accepted}).state,'RESIDENT_SOURCE_VERIFIED');
  assert.ok(classifyResidentAsset({asset,source,response:{...accepted,body:'stale'}}).findings.includes('SOURCE_RESIDENT_SHA256_MISMATCH'));
  assert.ok(classifyResidentAsset({asset,source,response:{...accepted,marker:null}}).findings.includes('OWNED_ROUTE_MARKER_MISSING'));
  assert.ok(classifyResidentAsset({asset,source,response:{...accepted,final_url:'http://wrong.example/aiden-lab/index.html'}}).findings.includes('REDIRECTED_OR_UNEXPECTED_LOCAL_ROUTE'));
  assert.ok(classifyResidentAsset({asset,source,response:{...accepted,status:404}}).findings.includes('HTTP_NOT_200'));
});

test('resident checker rejects missing route and partial deployment',async()=>{
  const mock=async(url)=>{
    const name=assetPath(url);
    return {status:name==='app.mjs'?404:200,url,
      headers:{get:(key)=>key==='x-evercraft-static-program'?'aidens-lab-v1':key==='x-evercraft-learning-world'?(name==='classroom/index.html'?'classroom-practice-v1':null):
        key==='content-type'?mime(name):null},
      text:async()=>name==='app.mjs'?'Not Found':bytes(name)};
  };
  const result=await probeAidenLabResident({sourceRoot:ROOT,fetcher:mock});
  assert.equal(result.verified,false);
  assert.equal(result.release_state,'HOLD_UNVERIFIED_RESIDENT');
  assert.ok(result.assets.find(x=>x.path==='app.mjs').findings.includes('HTTP_NOT_200'));
});
