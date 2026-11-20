import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createFabricFaieSurface } from './fabric-faie-runtime.mjs';

const fixture={
  Table:[
    ['saversion','saverest','areasymbol','areaname','mukey','musym','muname','farmlndcl','cokey','compname','comppct_r','majcompflag','slope_r','chkey','hzname','hzdept_r','hzdepb_r','sandtotal_r','silttotal_r','claytotal_r','dbthirdbar_r','wthirdbar_r','wfifteenbar_r'],
    ['18','2025-08-29T16:57:00','WA999','Fixture Survey','123','1','Fixture loam','Prime farmland','456','Fixture soil','80','Yes','2','789','A','0','20','40','40','20','1.3','25','10']
  ]
};

async function withSoilServer(fetchImpl, fn){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-faie-soil-public-'));
  const surface=createFabricFaieSurface({
    stateDir:dir,fetchImpl,startResident:false,collectorConfig:{enabled:false}
  });
  const server=createServer(async(req,res)=>{
    try {if(!await surface.handle(req,res)){res.writeHead(404);res.end();}}
    catch(error){res.writeHead(500);res.end(String(error));}
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port;
  const post=async(body)=> {
    const response=await fetch(origin+'/api/faie/soil/preview',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)
    });
    return {status:response.status,body:await response.json()};
  };
  try {await fn({post,origin,dir,surface});}
  finally {await new Promise(resolve=>server.close(resolve));await surface.close();fs.rmSync(dir,{recursive:true,force:true});}
}

test('public exact-point USDA mapped soil preview returns actual source semantics without persisting location',async()=>{
  let calls=0;
  await withSoilServer(async(url,options)=>{
    calls+=1;
    assert.equal(new URL(url).hostname,'sdmdataaccess.sc.egov.usda.gov');
    assert.equal(options.method,'POST');
    assert.match(String(options.body),/SDA_Get_Mukey_from_intersection_with_WktWgs84/);
    return {ok:true,status:200,text:async()=>JSON.stringify(fixture)};
  },async({post,dir,surface})=>{
    const reply=await post({latitude:46.6021,longitude:-120.5059});
    assert.equal(reply.status,200);
    assert.equal(reply.body.schema,'evercraft.faie.public-soil-preview.v1');
    assert.equal(reply.body.status,'mapped_soil_available');
    assert.equal(reply.body.source,'USDA NRCS Soil Data Access / SSURGO');
    assert.equal(reply.body.mapunit_count,1);
    assert.equal(reply.body.mapunits[0].name,'Fixture loam');
    assert.equal(reply.body.mapunits[0].survey_area_name,'Fixture Survey');
    assert.equal(reply.body.mapunits[0].farmland_classification,'Prime farmland');
    assert.equal(reply.body.mapunits[0].components[0].slope_percent,2);
    assert.equal(reply.body.evidence_state,'REPORTED');
    assert.equal(reply.body.field_verification_required,true);
    assert.equal(reply.body.soil_testing_performed,false);
    assert.equal(reply.body.site_suitability_verdict,null);
    assert.equal(reply.body.decision_authority,false);
    assert.equal(reply.body.request_persisted,false);
    assert.match(reply.body.warning,/not a field soil test/);
    assert.equal(surface.runtime.health().investigation_count,0);
    assert.equal(surface.runtime.health().observation_count,0);
    assert.ok(!fs.readFileSync(path.join(dir,'state.json'),'utf8').includes('46.6021'));
  });
  assert.equal(calls,1);
});

test('public soil preview requires explicitly supplied US coordinates and rejects invalid requests before USDA',async()=>{
  let calls=0;
  const invalid=[
    {},{latitude:0,longitude:0},{latitude:46.6},{latitude:'',longitude:-120.5},
    {latitude:91,longitude:-120.5},{latitude:46.6,longitude:-220},{latitude:'not a latitude',longitude:-120.5}
  ];
  // Invalid traffic also consumes the protective per-client limit.
  // Divide the negative cases across fresh isolated windows.
  for (const batch of [invalid.slice(0,4),invalid.slice(4)]) {
    await withSoilServer(async()=>{calls++;throw new Error('unexpected upstream request');},async({post})=>{
      for(const body of batch){
        const reply=await post(body);
        assert.equal(reply.status,400);
        assert.equal(reply.body.ok,false);
      }
    });
  }
  assert.equal(calls,0);
});

test('public soil preview reports failed or empty USDA results instead of inventing soil',async()=>{
  await withSoilServer(async()=>({ok:false,status:503,text:async()=>''}),async({post})=>{
    const reply=await post({latitude:46.6021,longitude:-120.5059});
    assert.equal(reply.status,502);
    assert.match(reply.body.error,/could not be verified/);
  });
  await withSoilServer(async()=>({ok:true,status:200,text:async()=>JSON.stringify({Table:[]})}),async({post})=>{
    const reply=await post({latitude:46.6021,longitude:-120.5059});
    assert.equal(reply.status,200);
    assert.equal(reply.body.status,'no_mapped_soil_found');
    assert.deepEqual(reply.body.mapunits,[]);
    assert.equal(reply.body.site_suitability_verdict,null);
  });
});

test('public soil preview limits repeated anonymous requests',async()=>{
  let calls=0;
  await withSoilServer(async()=>{calls++;return {ok:true,status:200,text:async()=>JSON.stringify(fixture)};},async({post})=>{
    for(let i=0;i<4;i++) assert.equal((await post({latitude:46.6021,longitude:-120.5059})).status,200);
    const fifth=await post({latitude:46.6021,longitude:-120.5059});
    assert.equal(fifth.status,429);
    assert.equal(fifth.body.error,'soil_preview_rate_limited');
  });
  assert.equal(calls,4);
});
