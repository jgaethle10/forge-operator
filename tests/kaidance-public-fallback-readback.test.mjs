import test from 'node:test';
import assert from 'node:assert/strict';
import {probeKaidanceFallback} from '../scripts/probe-kaidance-fallback.mjs';

const root='https://jgaethle10.github.io/forge-operator/';
function mock({pulseStatus=404,broken=null,wrongMime=null}={}) {
 const paths={
  'index.html':'<html><head><title>KAIDANCE | The Evercraft Pulse</title><link rel="stylesheet" href="./style.css"><link rel="icon" href="./mark.svg"></head><body>9:16 LIVE VIEW HEARTBEAT NOT CONNECTED <script src="./app.mjs"></script></body></html>',
  'app.mjs':"import {assessPublicPulse} from './pulse-source.mjs';import {normalizePublicActivity} from './work-source.mjs';fetch('./pulse.json')",
  'style.css':'body{background:#000; color:#fff; } /* viewport safe renderer */',
  'pulse-source.mjs':'export function assessPublicPulse() { return null; }',
  'work-source.mjs':'export function normalizePublicActivity() { return null; }',
  'mark.svg':'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9"/></svg>'
 };
 return async input=>{
  const name=new URL(input).pathname.split('/').pop()||'index.html';
  if(name==='pulse.json')return {status:pulseStatus,ok:pulseStatus===200,headers:new Headers({'content-type':'application/json'}),text:async()=>'{"not":"real"}'};
  const body=name===broken?'hi':paths[name];
  return {status:body?200:404,ok:!!body,headers:new Headers({'content-type':wrongMime===name?'text/plain':name==='index.html'?'text/html':name==='mark.svg'?'image/svg+xml':'text/javascript'}),text:async()=>body||'Not Found'};
 };
}
test('public fallback verifies real HTML/assets but never claims a Collider pulse',async()=>{
 const r=await probeKaidanceFallback({root,fetchImpl:mock(),now:new Date('2026-11-20T04:00:00Z')});
 assert.equal(r.result,'public_viewer_verified');
 assert.equal(r.verified_assets.length,6);
 assert.equal(r.approved_live_pulse,'not_present_on_fallback');
 assert.equal(r.url,root+'kaidance/');
 assert.equal(r.index_sha256.length,64);
});
test('fallback cannot publish fake heartbeat JSON',async()=>{
 await assert.rejects(()=>probeKaidanceFallback({root,fetchImpl:mock({pulseStatus:200})}),/fallback_heartbeat_must_not_be_published_on_pages/);
});
test('bad assets, no branding or improper response MIME are held',async()=>{
 await assert.rejects(()=>probeKaidanceFallback({root,fetchImpl:mock({broken:'app.mjs'})}));
 await assert.rejects(()=>probeKaidanceFallback({root,fetchImpl:mock({wrongMime:'mark.svg'})}),/fallback_brand_asset_invalid/);
 await assert.rejects(()=>probeKaidanceFallback({root,fetchImpl:mock({wrongMime:'index.html'})}),/fallback_not_html/);
});
test('only the known public repository Pages root is accepted',async()=>{
 for(const invalid of ['http://jgaethle10.github.io/forge-operator/','https://localhost/forge-operator/','https://jgaethle10.github.io/private/','https://user:secret@jgaethle10.github.io/forge-operator/']){
  await assert.rejects(()=>probeKaidanceFallback({root:invalid,fetchImpl:mock()}),/pages_root_must_be_verified_repository_fallback/);
 }
});
