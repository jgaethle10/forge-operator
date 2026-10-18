import test from 'node:test';
import assert from 'node:assert/strict';
import {startFabricLocalRuntime} from '../systemia/mcp/fabric-local-runtime.mjs';

test('approved customer hostnames resolve to their own private-brand first-party static frontage',async()=>{
 const rt=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[],faieSurfaceEnabled:false});
 const cases=[
  ['evercraftpropertyservices.com','eps-continuity-20261017'],
  ['www.evercraftpropertyservices.com','eps-continuity-20261017'],
  ['havenlycleaning.com','havenly-continuity-20261017'],
  ['www.havenlycleaning.com','havenly-continuity-20261017'],
  ['sunshineandspotless.com','sunshine-spotless-continuity-20261018'],
  ['www.sunshineandspotless.com','sunshine-spotless-continuity-20261018']
 ];
 try{
   const h=await fetch(rt.url+'/health').then(r=>r.json());
   assert.equal(h.owned_service_custom_host_routing_source_ready,true);
   assert.equal(h.owned_service_custom_domain_tls_verified,false);
   assert.equal(h.owned_service_frontages_dns_cutover_verified,false);
   for(const [hostname,marker] of cases){
     const response=await fetch(rt.url+'/?ref=customer',{headers:{host:hostname}});
     assert.equal(response.status,200,hostname);
     assert.match(response.headers.get('x-robots-tag')||'',/noindex/);
     const html=await response.text();
     assert.ok(html.includes(marker),hostname+' exact marker');
     assert.doesNotMatch(html,/base44\.app|base44Client|@base44/i);
     assert.equal((await fetch(rt.url+'/health',{headers:{host:hostname}})).status,404);
     assert.equal((await fetch(rt.url+'/mcp',{headers:{host:hostname},method:'POST'})).status,404);
     assert.equal((await fetch(rt.url+'/offers',{headers:{host:hostname}})).status,404);
     const head=await fetch(rt.url+'/',{method:'HEAD',headers:{host:hostname}});
     assert.equal(head.status,200);
     assert.equal((await head.text()).length,0);
   }
   const estimator=await fetch(rt.url+'/apps/eps-estimator/',{headers:{host:'evercraftpropertyservices.com'}});
   assert.equal(estimator.status,200);
   assert.match(await estimator.text(),/EPS Precise Estimator/);
   assert.equal((await fetch(rt.url+'/apps/eps-estimator/',{headers:{host:'havenlycleaning.com'}})).status,404);
   const normal=await fetch(rt.url+'/',{headers:{host:'fabric.systemiacommandcenters.com'}});
   assert.equal(normal.status,200);
   assert.match(await normal.text(),/Evercraft/i);
 }finally{await rt.close()}
});
