import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSETS, DEFAULT_ORIGIN, validOwnedOrigin, assessAsset, runPublicCanary } from '../scripts/probe-aiden-lab-public.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const source = (p) => readFileSync(join(ROOT, p==='classroom/index.html' ? 'public/apps/infinite-classroom/play/index.html' : 'public/aiden-lab/'+p), 'utf8');
const assetPath = (url) => new URL(url).pathname.slice('/aiden-lab/'.length);

test('rejects arbitrary, private or third-party website origins', () => {
  assert.equal(validOwnedOrigin(DEFAULT_ORIGIN), DEFAULT_ORIGIN);
  for (const bad of [
    'http://fabric.systemiacommandcenters.com',
    'https://fabric.systemiacommandcenters.com.attacker.test',
    'https://fabric.systemiacommandcenters.com/extra',
    'https://fabric.systemiacommandcenters.com?token=1',
    'https://jgaethle10.github.io',
    'https://base44.app',
    'https://127.0.0.1',
    'https://fabric.systemiacommandcenters.com:444'
  ]) assert.throws(() => validOwnedOrigin(bad));
});

test('accepts exact sourced assets but rejects rewritten homepages and stale files', () => {
  const asset = ASSETS[0];
  const body = source(asset.path);
  const observed = {status:200,finalUrl:DEFAULT_ORIGIN+'/aiden-lab/index.html',contentType:'text/html; charset=utf-8',programMarker:'aidens-lab-v1',body};
  assert.equal(assessAsset(observed,asset,body,DEFAULT_ORIGIN).state,'EXACT_SOURCE_VERIFIED');
  assert.ok(assessAsset({...observed,body:'<h1>Evercraft homepage</h1>'},asset,body,DEFAULT_ORIGIN).findings.includes('SOURCE_LIVE_SHA256_MISMATCH'));
  assert.ok(assessAsset({...observed,finalUrl:'https://wrong.example/aiden-lab/index.html'},asset,body,DEFAULT_ORIGIN).findings.includes('WRONG_OR_REDIRECTED_ORIGIN'));
  assert.ok(assessAsset({...observed,contentType:'application/json'},asset,body,DEFAULT_ORIGIN).findings.includes('UNEXPECTED_CONTENT_TYPE'));
  assert.ok(assessAsset({...observed,status:404},asset,body,DEFAULT_ORIGIN).findings.includes('HTTP_NOT_200'));
  assert.ok(assessAsset({...observed,programMarker:null},asset,body,DEFAULT_ORIGIN).findings.includes('OWNED_FABRIC_ROUTE_IDENTITY_MISSING'));
});

test('five source-verified assets give a bounded proof, not a medical outcome', async () => {
  const mock = async (url) => {
    const path = assetPath(url);
    return {status:200,url,headers:{get:(name)=>name==='x-evercraft-static-program'?'aidens-lab-v1':name==='x-evercraft-learning-world'?(path==='classroom/index.html'?'classroom-practice-v1':null):path.endsWith('.html')?'text/html':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'text/javascript'},text:async()=>source(path)};
  };
  const result = await runPublicCanary({fetcher:mock,now:new Date('2026-11-20T00:00:00Z')});
  assert.equal(result.public_https_verified,true);
  assert.equal(result.publication_state,'EXACT_SOURCE_PUBLIC_VERIFIED');
  assert.equal(result.assets.length,7);
  assert.equal(result.medical_outcome_validated,false);
  assert.equal(result.external_action_taken,false);
  assert.equal(result.patient_data_accessed,false);
});

test('Classroom requires a first-party learning-world marker as well as exact source bytes',()=>{
  const asset=ASSETS.find(x=>x.path==='classroom/index.html');
  assert.ok(asset);
  const body=source(asset.path);
  const observed={status:200,finalUrl:DEFAULT_ORIGIN+'/aiden-lab/classroom/index.html',
    contentType:'text/html',programMarker:'aidens-lab-v1',learningMarker:'classroom-practice-v1',body};
  assert.equal(assessAsset(observed,asset,body,DEFAULT_ORIGIN).state,'EXACT_SOURCE_VERIFIED');
  assert.ok(assessAsset({...observed,learningMarker:null},asset,body,DEFAULT_ORIGIN)
    .findings.includes('LEARNING_WORLD_IDENTITY_MISSING'));
});

test('partial or stale publication fails closed', async () => {
  const mock = async (url) => ({
    status:200,url,headers:{get:(name)=>name==='x-evercraft-static-program'?'aidens-lab-v1':name==='x-evercraft-learning-world'?(assetPath(url)==='classroom/index.html'?'classroom-practice-v1':null):url.endsWith('.html')?'text/html':'text/javascript'},
    text:async()=>url.endsWith('catalog.mjs')?'stale code':source(assetPath(url))
  });
  const result = await runPublicCanary({fetcher:mock});
  assert.equal(result.public_https_verified,false);
  assert.equal(result.publication_state,'HOLD_UNVERIFIED_PUBLIC_ROUTE');
});
