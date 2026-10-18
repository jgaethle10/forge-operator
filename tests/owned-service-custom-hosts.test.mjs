import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {startFabricLocalRuntime} from '../systemia/mcp/fabric-local-runtime.mjs';

function requestOnHost(origin,pathname,host,method='GET'){
 const u=new URL(origin);
 return new Promise((resolve,reject)=>{
  const req=http.request({hostname:u.hostname,port:u.port,method,path:pathname,headers:{Host:host}},res=>{
   const chunks=[];
   res.on('data',chunk=>chunks.push(chunk));
   res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString()}));
  });
  req.on('error',reject);req.end();
 });
}

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
     const response=await requestOnHost(rt.url,'/?ref=customer',hostname);
     assert.equal(response.status,200,hostname+' '+response.body.slice(0,160));
     assert.match(response.headers['x-robots-tag']||'',/noindex/);
     assert.ok(response.body.includes(marker),hostname+' exact marker');
     assert.doesNotMatch(response.body,/base44\.app|base44Client|@base44/i);
     assert.equal((await requestOnHost(rt.url,'/health',hostname)).status,404);
     assert.equal((await requestOnHost(rt.url,'/mcp',hostname,'POST')).status,404);
     assert.equal((await requestOnHost(rt.url,'/offers',hostname)).status,404);
     const head=await requestOnHost(rt.url,'/',hostname,'HEAD');
     assert.equal(head.status,200);
     assert.equal(head.body.length,0);
   }
   const estimator=await requestOnHost(rt.url,'/apps/eps-estimator/','evercraftpropertyservices.com');
   assert.equal(estimator.status,200);
   assert.match(estimator.body,/EPS Precise Estimator/);
   assert.equal((await requestOnHost(rt.url,'/apps/eps-estimator/','havenlycleaning.com')).status,404);
   const normal=await requestOnHost(rt.url,'/','fabric.systemiacommandcenters.com');
   assert.equal(normal.status,200);
   assert.match(normal.body,/Evercraft/i);
 }finally{await rt.close()}
});
