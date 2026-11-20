import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createFaieRuntime} from './runtime.mjs';
import {createFabricFaieSurface} from '../mcp/fabric-faie-runtime.mjs';

const obs={
  observation_id:'usgs:yakima-water-2026-11-19',
  source_system:'systemia_sentinel_official',
  source_family:'usgs-water-data-api',
  observed_at:'2026-11-19T16:00:00Z',
  region_keys:['yakima-wa'],
  domains:['water','environment'],
  kind:'official_water_gauge',
  evidence_state:'observed',
  reliability:0.9,
  anomaly_score:0.2,
  summary:'Official USGS Yakima-area monitoring location observed water discharge.',
  provenance_refs:['https://api.waterdata.usgs.gov/ogcapi/v0/collections/latest-continuous/items/YK1?f=json'],
  facts:{metric_value:75,metric_unit:'cfs',private_address:'private visitor detail must never persist'}
};
function tempScope(fn){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'faie-history-runtime-'));
  try{return fn(dir)}finally{fs.rmSync(dir,{force:true,recursive:true})}
}
test('historical ledger backfills existing vetted official observations, not generic intake',()=>tempScope(dir=>{
  const rt=createFaieRuntime({stateDir:dir,collectorConfig:{enabled:false}});
  rt.ingest(obs,{now:'2026-11-19T16:05:00Z'});
  rt.ingest({...obs,observation_id:'external-1',source_system:'systemia_radar',source_family:'usgs-water-data-api'},{now:'2026-11-19T16:05:00Z'});
  assert.equal(rt.health().land_history_archive.archived_records,0);
  rt.close();

  const reopened=createFaieRuntime({stateDir:dir,collectorConfig:{enabled:false}});
  try{
    const h=reopened.health();
    assert.equal(h.land_history_archive.status,'active');
    assert.equal(h.land_history_archive.archived_records,1);
    assert.equal(h.land_history_archive.backfilled_existing_public_records,1);
    const timeline=reopened.historyForRegion('yakima-wa');
    assert.equal(timeline.records.length,1);
    assert.equal(timeline.records[0].source_family,'usgs-water-data-api');
    assert.equal(timeline.records[0].event_start,'2026-11-19');
    assert.ok(!JSON.stringify(timeline).includes('private_address'));
    assert.equal(timeline.site_suitability_verdict,null);
    assert.equal(reopened.historyArchiveIntegrity().ok,true);
  }finally{reopened.close()}
  const third=createFaieRuntime({stateDir:dir,collectorConfig:{enabled:false}});
  assert.equal(third.health().land_history_archive.archived_records,1);
  assert.equal(third.health().land_history_archive.backfilled_existing_public_records,0);
  third.close();
}));
test('public regional timeline endpoint is read-only and cannot expose point or parcel history',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'faie-history-public-'));
  let server=null;
  const runtime=createFaieRuntime({stateDir:dir,collectorConfig:{enabled:false}});
  runtime.ingest(obs,{now:'2026-11-19T16:05:00Z'});
  runtime.close();
  const surface=createFabricFaieSurface({stateDir:dir,startResident:false,collectorConfig:{enabled:false}});
  try{
    server=createServer(async(req,res)=>{
      try{if(!await surface.handle(req,res)){res.writeHead(404);res.end()}}
      catch(error){res.writeHead(500);res.end()}
    });
    server.listen(0,'127.0.0.1');
    await once(server,'listening');
    const origin='http://127.0.0.1:'+server.address().port;
    const good=await fetch(origin+'/api/faie/history/region?key=yakima-wa');
    const data=await good.json();
    assert.equal(good.status,200);
    assert.equal(data.schema,'evercraft.faie.public-land-timeline.v1');
    assert.equal(data.records.length,1);
    assert.equal(data.records[0].land_id,'region:yakima-wa');
    assert.equal(data.exhaustive_history,false);
    assert.equal(data.site_suitability_verdict,null);
    for(const invalid of ['?key=','?key=global','?key=46.6021,-120.5059','?key=../private']){
      const response=await fetch(origin+'/api/faie/history/region'+invalid);
      assert.equal(response.status,400);
    }
    const health=await (await fetch(origin+'/api/faie/health')).json();
    assert.equal(health.land_history_archive.archived_records,1);
    assert.equal(health.public_preview_persists_queries,false);
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    await surface.close();
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
test('the current public site scan does not create land-history entries',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'faie-history-ephemeral-'));
  const surface=createFabricFaieSurface({
    stateDir:dir,startResident:false,collectorConfig:{enabled:false},
    fetchImpl:async()=>({ok:false,status:503,text:async()=>''})
  });
  let server;
  try{
    server=createServer(async(req,res)=>{if(!await surface.handle(req,res)){res.writeHead(404);res.end()}});
    server.listen(0,'127.0.0.1');await once(server,'listening');
    const origin='http://127.0.0.1:'+server.address().port;
    // Even failed customer submissions must not be archived.
    const response=await fetch(origin+'/api/faie/site/scan',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({latitude:46.6021,longitude:-120.5059})
    });
    assert.equal(response.status,502);
    assert.equal(surface.health().land_history_archive.archived_records,0);
    assert.equal(surface.health().investigation_count,0);
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    await surface.close();
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
