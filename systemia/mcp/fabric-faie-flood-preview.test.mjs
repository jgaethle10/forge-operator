import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createFabricFaieSurface} from './fabric-faie-runtime.mjs';

async function withServer(fetchImpl,fn){
  const stateDir=fs.mkdtempSync(path.join(os.tmpdir(),'faie-fema-point-'));
  const surface=createFabricFaieSurface({stateDir,fetchImpl,startResident:false,collectorConfig:{enabled:false}});
  const server=createServer(async(req,res)=>{
    try{if(!await surface.handle(req,res)){res.writeHead(404);res.end();}}
    catch(error){res.writeHead(500);res.end(String(error));}
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port;
  const post=async(input)=>{
    const response=await fetch(origin+'/api/faie/flood/preview',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)
    });
    return {status:response.status,body:await response.json()};
  };
  try{await fn({post,stateDir,surface});}
  finally{await new Promise(resolve=>server.close(resolve));await surface.close();fs.rmSync(stateDir,{recursive:true,force:true});}
}
const valid={latitude:46.6021,longitude:-120.5059};
const fixture=(url)=>{
  if(url.includes('/28/query'))return {features:[{attributes:{
    FLD_ZONE:'X',ZONE_SUBTY:'0.2 PCT ANNUAL CHANCE FLOOD HAZARD',SFHA_TF:'F',FLD_AR_ID:'TEST'
  }}]};
  return {features:[{attributes:{FIRM_PAN:'53077C0800D',EFF_DATE:1700000000000}}]};
};
test('public FEMA point route returns factual source data without private persistent archive',async()=>{
  let calls=0;
  await withServer(async(url,options)=>{
    calls++;assert.ok(url.startsWith('https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/'));
    assert.equal(options.method,'GET');
    return {ok:true,status:200,text:async()=>JSON.stringify(fixture(url))};
  },async({post,stateDir,surface})=>{
    const response=await post(valid);
    assert.equal(response.status,200);
    assert.equal(response.body.schema,'evercraft.faie.fema-flood-point.v1');
    assert.equal(response.body.hazard_polygons[0].flood_zone,'X');
    assert.equal(response.body.hazard_polygons[0].special_flood_hazard_area,false);
    assert.equal(response.body.insurance_eligibility_decision,null);
    assert.equal(response.body.insurance_premium_estimate,null);
    assert.equal(response.body.request_persisted,false);
    assert.equal(surface.health().investigation_count,0);
    assert.equal(surface.health().observation_count,0);
    assert.ok(!fs.readFileSync(path.join(stateDir,'state.json'),'utf8').includes('46.6021'));
  });
  assert.equal(calls,2);
});
test('invalid and missing point coordinates fail before any official request',async()=>{
  let calls=0;
  await withServer(async()=>{calls++;throw Error('unexpected upstream')},async({post})=>{
    for(const input of [{},{latitude:0,longitude:0},{latitude:46.6021},{latitude:'',longitude:-120}]){
      const response=await post(input);
      assert.equal(response.status,400);
    }
  });
  assert.equal(calls,0);
});
test('source not available fails closed; no insured status or risk computed',async()=>{
  await withServer(async()=>({ok:false,status:503,text:async()=>''}),async({post})=>{
    const response=await post(valid);
    assert.equal(response.status,502);
    assert.equal(response.body.request_persisted,false);
    assert.ok(!JSON.stringify(response.body).includes('insurance_eligibility_decision'));
  });
});
test('public point lookup is rate-limited across anonymous requests',async()=>{
  let calls=0;
  await withServer(async(url)=>{
    calls++;
    return {ok:true,status:200,text:async()=>JSON.stringify(fixture(url))};
  },async({post})=>{
    for(let i=0;i<4;i++)assert.equal((await post(valid)).status,200);
    const fifth=await post(valid);
    assert.equal(fifth.status,429);
    assert.equal(fifth.body.error,'flood_preview_rate_limited');
  });
  assert.equal(calls,8);
});
