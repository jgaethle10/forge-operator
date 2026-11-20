import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createFabricFaieSurface } from './fabric-faie-runtime.mjs';

const now=()=>new Date().toISOString();
const future=(hours)=>new Date(Date.now()+hours*3600000).toISOString();
const fixtureSoil={Table:[
  ['saversion','saverest','areasymbol','areaname','mukey','musym','muname','farmlndcl','cokey','compname','comppct_r','majcompflag','slope_r','chkey','hzname','hzdept_r','hzdepb_r','sandtotal_r','silttotal_r','claytotal_r','dbthirdbar_r','wthirdbar_r','wfifteenbar_r'],
  ['18','2025-08-29T16:57:00','WA999','Fixture Survey','123','1','Example loam','Prime farmland','456','Example soil','80','Yes','2','789','A','0','20','40','40','20','1.3','25','10']
]};
const forecastUrl='https://api.weather.gov/gridpoints/PDT/11,42/forecast';

function fakeProviders({soilFailure=false,weatherFailure=false}={}){
  const calls=[];
  const fetchImpl=async(url,init)=>{
    calls.push({url,method:init.method});
    if(url.startsWith('https://sdmdataaccess.sc.egov.usda.gov/')){
      return soilFailure?{ok:false,status:503,text:async()=>''}:
        {ok:true,status:200,text:async()=>JSON.stringify(fixtureSoil)};
    }
    if(url.startsWith('https://api.weather.gov/points/')){
      return weatherFailure?{ok:false,status:503}:
        {ok:true,status:200,json:async()=>({properties:{gridId:'PDT',forecast:forecastUrl}})};
    }
    if(url===forecastUrl)return {
      ok:true,status:200,json:async()=>({properties:{
        generatedAt:now(),
        periods:[{
          name:'Tonight',startTime:future(0.1),endTime:future(6),
          temperature:30,temperatureUnit:'F',isDaytime:false,
          windSpeed:'10 mph',windDirection:'NW',
          probabilityOfPrecipitation:{value:45},
          shortForecast:'Cold'
        }]
      }})
    };
    throw new Error('unexpected_provider_url:'+url);
  };
  return {fetchImpl,calls};
}

async function withServer(provider,fn){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'faie-site-v12-'));
  const surface=createFabricFaieSurface({
    stateDir:dir,fetchImpl:provider.fetchImpl,startResident:false,collectorConfig:{enabled:false}
  });
  const server=createServer(async(req,res)=>{
    try{if(!await surface.handle(req,res)){res.writeHead(404);res.end();}}
    catch(err){res.writeHead(500);res.end(String(err));}
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port;
  const post=async(body,path='/api/faie/site/scan')=>{
    const response=await fetch(origin+path,{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)
    });
    return {status:response.status,body:await response.json()};
  };
  try{await fn({post,surface,dir});}
  finally{
    await new Promise(resolve=>server.close(resolve));
    await surface.close();
    fs.rmSync(dir,{recursive:true,force:true});
  }
}

test('owned public site scan returns both official sources, next checks and no persistence',async()=>{
  const provider=fakeProviders();
  await withServer(provider,async({post,surface,dir})=>{
    const result=await post({latitude:46.6021,longitude:-120.5059});
    assert.equal(result.status,200);
    const report=result.body;
    assert.equal(report.schema,'evercraft.faie.site-scan.v1');
    assert.equal(report.state,'bounded_evidence_available');
    assert.equal(report.sources_with_usable_evidence,2);
    assert.equal(report.soil.mapunits[0].name,'Example loam');
    assert.equal(report.soil.evidence_state,'REPORTED');
    assert.equal(report.weather.evidence_state,'MODELED');
    assert.equal(report.weather.periods[0].temperature_f,30);
    assert.ok(report.weather.screening_flags.some(f=>f.trigger==='freeze'));
    assert.ok(report.weather.provenance_urls.every(url=>url.startsWith('https://api.weather.gov/')));
    assert.equal(report.privacy.public_lookup_persisted,false);
    assert.equal(report.site_suitability_verdict,null);
    assert.equal(report.decision_authority,false);
    const health=surface.health();
    assert.equal(health.investigation_count,0);
    assert.equal(health.comparison_count,0);
    assert.equal(health.observation_count,0);
    assert.ok(!fs.readFileSync(path.join(dir,'state.json'),'utf8').includes('46.6021'));
  });
  assert.equal(provider.calls.length,3);
});

test('no location means no third-party requests; low-volume limit blocks route hopping',async()=>{
  const provider=fakeProviders();
  await withServer(provider,async({post})=>{
    assert.equal((await post({})).status,400);
    assert.equal((await post({latitude:0,longitude:0})).status,400);
    assert.equal((await post({latitude:46.6,longitude:-240})).status,400);
    assert.equal(provider.calls.length,0);
  });
  const second=fakeProviders();
  await withServer(second,async({post})=>{
    const point={latitude:46.6021,longitude:-120.5059};
    assert.equal((await post(point)).status,200);
    assert.equal((await post(point,'/api/faie/soil/preview')).status,200);
    assert.equal((await post(point)).status,200);
    assert.equal((await post(point)).status,200);
    assert.equal((await post(point)).status,429);
  });
});

test('partial sources stay partial; two failed official sources make 502 not a false report',async()=>{
  const partial=fakeProviders({weatherFailure:true});
  await withServer(partial,async({post})=>{
    const result=await post({latitude:46.6021,longitude:-120.5059});
    assert.equal(result.status,200);
    assert.equal(result.body.state,'partial_evidence');
    assert.equal(result.body.weather.status,'unavailable');
    assert.equal(result.body.sources_with_usable_evidence,1);
  });
  const failed=fakeProviders({soilFailure:true,weatherFailure:true});
  await withServer(failed,async({post})=>{
    const result=await post({latitude:46.6021,longitude:-120.5059});
    assert.equal(result.status,502);
    assert.equal(result.body.ok,false);
    assert.equal(result.body.request_persisted,false);
    assert.ok(Array.isArray(result.body.source_receipts));
    assert.ok(!JSON.stringify(result.body).includes('Example loam'));
  });
});
