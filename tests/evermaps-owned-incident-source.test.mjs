import test from 'node:test';
import assert from 'node:assert/strict';
import {wfigsUrl,normalizeWfigs,createOwnedWfigsService,WFIGS} from '../systemia/evermaps/incident-source.mjs';
import {registerEvermapsIncidentRoutes} from '../systemia/evermaps/http.mjs';
const T=Date.parse('2026-10-17T20:00:00Z');
function fire(id,patch={},x=-120.4,y=46.6){
 return {attributes:{
  IrwinID:id,IncidentName:'Yakima Ridge',IncidentTypeCategory:'WF',
  ModifiedOnDateTime_dt:T-3600000,FireOutDateTime:null,
  IncidentSize:125,PercentContained:25,POOState:'US-WA',...patch
 },geometry:{x,y}};
}
function response(features,status=200){
 return new Response(JSON.stringify({features}),{status,headers:{'Content-Type':'application/json'}});
}
test('owned URL is fixed to public PNW WFIGS source without arbitrary user locations or credentials',()=>{
 const url=new URL(wfigsUrl());
 assert.equal(url.origin,'https://services3.arcgis.com');
 assert.equal(url.searchParams.get('where'),"IncidentTypeCategory='WF'");
 assert.equal(url.searchParams.get('geometry'),WFIGS.bounds.join(','));
 assert.equal(url.searchParams.get('f'),'json');
 assert.equal(url.searchParams.has('token'),false);
});

test('reported wildfire is source-dated but never labeled confirmed burning',()=>{
 const {records,coverage}=normalizeWfigs({features:[fire('a')]},T);
 assert.equal(coverage.received,1);
 assert.equal(records.length,1);
 assert.equal(records[0].reported_acres,125);
 assert.equal(records[0].reported_containment_percent,25);
 assert.equal(records[0].evidence_state,'SOURCE_REPORTED_INCIDENT_NOT_BURNING_CONFIRMATION');
 assert.equal(records[0].modified_at_utc,'2026-10-17T19:00:00.000Z');
});

test('exclude fire-out, stale/future, invalid type, missing source ID and distant coordinates',()=>{
 const data={features:[
  fire('valid'),
  fire('out',{FireOutDateTime:T-1000}),
  fire('stale',{ModifiedOnDateTime_dt:T-15*86400000}),
  fire('future',{ModifiedOnDateTime_dt:T+6000000}),
  fire('rx',{IncidentTypeCategory:'RX'}),
  fire(null,{IrwinID:null,UniqueFireIdentifier:null}),
  fire('far',{},-110,51)
 ]};
 const v=normalizeWfigs(data,T);
 assert.deepEqual(v.records.map(x=>x.incident_id),['valid']);
 assert.equal(v.coverage.excluded_out,1);
 assert.equal(v.coverage.excluded_stale,2);
 assert.equal(v.coverage.excluded_invalid,3);
});

test('reject malformed and truncated provider payloads',()=>{
 assert.throws(()=>normalizeWfigs({error:{code:500}},T),/INVALID_RESPONSE/);
 assert.throws(()=>normalizeWfigs({features:[],exceededTransferLimit:true},T),/TRUNCATED/);
 assert.throws(()=>normalizeWfigs({features:Array(WFIGS.maxResults).fill(fire('a'))},T),/TRUNCATED/);
});

test('one in-flight query is shared, cached during TTL, and refetched when TTL expires',async()=>{
 let now=T,count=0;
 const service=createOwnedWfigsService({clock:()=>now,cacheMs:1000,fetchImpl:async()=>{
  count++;return response([fire('one')]);
 }});
 const [a,b]=await Promise.all([service.read(),service.read()]);
 assert.equal(count,1);
 assert.equal(a,b);
 assert.equal(a.guarantees.current_feed_is_burning_confirmation,false);
 assert.equal(a.guarantees.zero_records_proves_zero_fires,false);
 assert.equal(service.health().state,'fresh');
 await service.read();assert.equal(count,1);
 now+=1100;await service.read();assert.equal(count,2);
});

test('upstream error after cache expiry fails closed rather than shipping stale incidents',async()=>{
 let now=T,calls=0;
 const service=createOwnedWfigsService({clock:()=>now,cacheMs:1000,fetchImpl:async()=>{
  calls++;
  return calls===1?response([fire('current')]):new Response('unavailable',{status:503});
 }});
 assert.equal((await service.read()).count,1);
 now+=1100;
 await assert.rejects(service.read(),/WFIGS_HTTP_503/);
 assert.equal(service.health().state,'unavailable');
});

test('a valid empty upstream feed is distinct from unavailable, and never proves zero fires',async()=>{
 const service=createOwnedWfigsService({clock:()=>T,fetchImpl:async()=>response([])});
 const value=await service.read();
 assert.equal(value.count,0);
 assert.equal(value.source_coverage.received,0);
 assert.equal(value.guarantees.zero_records_proves_zero_fires,false);
});

test('owned read-only HTTP route preserves 200/503 semantics and does not return cached live status on failure',async()=>{
 const routes=new Map();
 const app={get:(path,...handlers)=>routes.set(path,handlers)};
 let fail=false;
 const service={
  health:()=>({state:fail?'unavailable':'fresh'}),
  read:async()=>{if(fail)throw Error('source failed');return {count:1,schema:'evercraft.evermaps.incident-observations.v1'};}
 };
 registerEvermapsIncidentRoutes(app,{service});
 function reply(){
  let code=200,payload,headers={};
  const res={
   setHeader:(k,v)=>{headers[k]=v;return res},
   status:(v)=>{code=v;return res},
   json:(v)=>{payload=v;return res}
  };
  return {res,status:()=>code,payload:()=>payload,headers};
 }
 let x=reply();
 routes.get('/api/evermaps/source-health')[0]({},x.res);
 assert.deepEqual(x.payload(),{state:'fresh'});
 x=reply();
 await routes.get('/api/evermaps/incidents/pnw')[1]({},x.res);
 assert.equal(x.payload().count,1);assert.equal(x.status(),200);
 fail=true;
 x=reply();
 await routes.get('/api/evermaps/incidents/pnw')[1]({},x.res);
 assert.equal(x.status(),503);
 assert.equal(x.payload().status,'SOURCE_UNAVAILABLE');
 assert.equal(x.payload().count,null);
 assert.deepEqual(x.payload().records,[]);
});
