import test from 'node:test';
import assert from 'node:assert/strict';
import {startFabricLocalRuntime} from '../systemia/mcp/fabric-local-runtime.mjs';

test('four first-party public service surfaces are served without legacy provider links',async()=>{
 const server=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[],faieSurfaceEnabled:false});
 try{
  const cases=[
   ['/eps/','eps-continuity-20261017','Evercraft Property Services'],
   ['/havenly/','havenly-continuity-20261017','HAVENLY'],
   ['/sunshine-spotless/','Sunshine','Cleaning'],
   ['/apps/eps-estimator/','EPS Precise Estimator','Estimator']
  ];
  const health=await fetch(server.url+'/health').then(r=>r.json());
  assert.equal(health.owned_service_frontages_source_ready,true);
  assert.equal(health.owned_service_frontages_backend_intake_verified,false);
  assert.equal(health.owned_service_frontages_dns_cutover_verified,false);
  for(const [route,marker,other] of cases){
   const r=await fetch(server.url+route);
   assert.equal(r.status,200,route);
   assert.match(r.headers.get('content-type')||'',/text\/html/);
   assert.match(r.headers.get('x-robots-tag')||'',/noindex/);
   const text=await r.text();
   assert.ok(text.includes(marker),route+' marker');
   assert.ok(text.includes(other),route+' content');
   assert.doesNotMatch(text,/https?:\/\/[^"\s]*base44\.app|@base44|base44Client/i);
   const head=await fetch(server.url+route,{method:'HEAD'});
   assert.equal(head.status,200,route+' HEAD');
   assert.equal((await head.text()).length,0);
  }
  assert.equal((await fetch(server.url+'/eps/no-accidental-route')).status,404);
  assert.equal((await fetch(server.url+'/havenly/private.json')).status,404);
 }finally{await server.close()}
});
