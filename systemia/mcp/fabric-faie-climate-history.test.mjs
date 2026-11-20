import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createFabricFaieSurface } from './fabric-faie-runtime.mjs';

function records(year){
  const rows=[];
  for(let day=new Date(Date.UTC(year,0,1));day.getUTCFullYear()===year;day.setUTCDate(day.getUTCDate()+1)){
    rows.push({
      STATION:'USW00024243',DATE:day.toISOString().slice(0,10),
      TMAX:'95',TMIN:'31',PRCP:'0.02'
    });
  }
  return rows;
}
async function withServer(fetchImpl,fn){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'faie-climate-station-'));
  const surface=createFabricFaieSurface({
    stateDir:dir,fetchImpl,startResident:false,collectorConfig:{enabled:false}
  });
  const server=createServer(async(req,res)=>{
    try{if(!await surface.handle(req,res)){res.writeHead(404);res.end()}}
    catch(error){res.writeHead(500);res.end(String(error))}
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port;
  const post=async(body)=>{
    const response=await fetch(origin+'/api/faie/climate/history',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)
    });
    return {status:response.status,body:await response.json()};
  };
  try{await fn({post,surface,dir})}
  finally{
    await new Promise(resolve=>server.close(resolve));
    await surface.close();
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
test('owned public history endpoint returns two official years without saving user point',async()=>{
  const urls=[];
  const fetchImpl=async(url)=>{
    urls.push(url);
    const parsed=new URL(url);
    assert.equal(parsed.hostname,'www.ncei.noaa.gov');
    const year=Number(parsed.searchParams.get('startDate').slice(0,4));
    return {ok:true,status:200,text:async()=>JSON.stringify(records(year))};
  };
  await withServer(fetchImpl,async({post,surface,dir})=>{
    const result=await post({latitude:46.6021,longitude:-120.5059});
    assert.equal(result.status,200);
    assert.equal(result.body.schema,'evercraft.faie.ncei-station-history.v1');
    assert.equal(result.body.status,'historical_station_context_available');
    assert.equal(result.body.received_calendar_dates,731);
    assert.equal(result.body.metrics.freeze_nights_le_32f.threshold_days,731);
    assert.equal(result.body.station.id,'USW00024243');
    assert.ok(result.body.station.distance_km>0);
    assert.equal(result.body.request_persisted,false);
    assert.equal(result.body.site_suitability_verdict,null);
    assert.equal(surface.health().investigation_count,0);
    assert.equal(surface.health().observation_count,0);
    assert.ok(!fs.readFileSync(path.join(dir,'state.json'),'utf8').includes('46.6021'));
  });
  assert.equal(urls.length,2);
});
test('missing or distant coordinates fail before any NOAA calls',async()=>{
  let calls=0;
  await withServer(async()=>{calls++;throw Error('should not be called')},async({post})=>{
    assert.equal((await post({})).status,400);
    const far=await post({latitude:47.5,longitude:-121});
    assert.equal(far.status,422);
    assert.equal(far.body.request_persisted,false);
    assert.match(far.body.error,/No approved historical station/);
    assert.equal(calls,0);
  });
});
test('NOAA unavailable means no fabricated historical station statistics',async()=>{
  await withServer(async()=>({ok:false,status:503,text:async()=>''}),async({post})=>{
    const res=await post({latitude:46.6021,longitude:-120.5059});
    assert.equal(res.status,502);
    assert.equal(res.body.request_persisted,false);
    assert.ok(!JSON.stringify(res.body).includes('threshold_days'));
  });
});
