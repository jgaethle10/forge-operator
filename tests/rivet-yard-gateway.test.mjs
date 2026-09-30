import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateYardReport } from '../systemia/rivet/report-runtime.mjs';
import { registerRivetReportGateway } from '../systemia/rivet/http-gateway.mjs';

async function start(options){
  const app=express();
  app.use(express.json());
  registerRivetReportGateway(app,options);
  const server=await new Promise((resolve,reject)=>{
    const s=app.listen(0,'127.0.0.1',()=>resolve(s));
    s.once('error',reject);
  });
  const address=server.address();
  return {
    url:'http://127.0.0.1:'+address.port,
    close:()=>new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()))
  };
}

const COVERAGE_KEYS=['geocoding','charging_inventory','traffic','traffic_temporal','utility_service_area','utility_tariff','incentives','parcel_planning','local_ev_stock','observed_sessions','freight','dwell_context','deep_market_evidence','provenance'];
const fakeGenerate=async({address,systemiaMachineKey,onProgress})=>{
  assert.equal(systemiaMachineKey,'machine-proof');
  onProgress({schema:'evercraft.rivet.report-progress.v1',stage:'ready',percent:100});
  return {
    schema:'evercraft.rivet.yard-report-record.v1',
    report_id:'rivet-yard:proof',
    generation_state:'ready',
    address,
    verification:{source_response_profile_verified:true,football_opened:true}
  };
};

{
  const runtime=await start({gatewayToken:'',systemiaMachineKey:'machine-proof',generate:fakeGenerate});
  try{
    const r=await fetch(runtime.url+'/api/rivet/reports',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({address:'6405 W Chestnut Ave'})});
    assert.equal(r.status,503);
  }finally{await runtime.close();}
}

{
  const runtime=await start({gatewayToken:'gateway-proof',systemiaMachineKey:'machine-proof'});
  try{
    const health=await fetch(runtime.url+'/api/rivet/report-health').then(r=>r.json());
    assert.equal(health.ok,true);
    assert.equal(health.configured,false);
    assert.equal(health.source_required,true);
    const created=await fetch(runtime.url+'/api/rivet/reports',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer gateway-proof'},body:JSON.stringify({address:'6405 W Chestnut Ave, Yakima, WA 98908'})});
    assert.equal(created.status,503);
  }finally{await runtime.close();}
}

{
  const runtime=await start({gatewayToken:'gateway-proof',systemiaMachineKey:'machine-proof',generate:fakeGenerate});
  try{
    const health=await fetch(runtime.url+'/api/rivet/report-health').then(r=>r.json());
    assert.equal(health.ok,true);
    assert.equal(health.configured,true);
    assert.equal(health.source_required,false);

    const denied=await fetch(runtime.url+'/api/rivet/reports',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer wrong'},body:JSON.stringify({address:'6405 W Chestnut Ave'})});
    assert.equal(denied.status,401);

    const missing=await fetch(runtime.url+'/api/rivet/reports',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer gateway-proof'},body:JSON.stringify({address:''})});
    assert.equal(missing.status,400);

    const created=await fetch(runtime.url+'/api/rivet/reports',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer gateway-proof'},body:JSON.stringify({address:'6405 W Chestnut Ave, Yakima, WA 98908'})});
    assert.equal(created.status,201);
    const body=await created.json();
    assert.equal(body.ok,true);
    assert.equal(body.generation_state,'ready');
    assert.equal(body.progress.percent,100);
    assert.equal(body.verification.football_opened,true);
  }finally{await runtime.close();}
}

{
  const stateDir=fs.mkdtempSync(path.join(os.tmpdir(),'rivet-gateway-source-'));
  const sourceSnapshot={
    response_profile:'rivet_report_snapshot_v1',
    evidence_state:'SOURCE_BACKED',
    access_policy:{commercial_access:true},
    matched_address:'19820 International Boulevard, SeaTac, WA 98188',
    latitude:47.4239385,
    longitude:-122.2955482,
    state:'WA',postal_code:'98188',retrieved_at:'2026-09-30T18:30:00.000Z',
    source_coverage_manifest:{
      schema:'evercraft.rivet.source-coverage.v1',generated_at:'2026-09-30T18:30:00.000Z',
      domains:Object.fromEntries(COVERAGE_KEYS.map(key=>[key,{state:'CONNECTED',record_count:1,source_status:'gateway-proof'}]))
    },
    traffic:[{aadt:35000}],chargers:[{name:'Gateway charger'}],incentives:[{name:'Gateway incentive'}],
    nearby_observed_usage:[{charging_sessions_count:42,period_start:'2026-08-01',period_granularity:'month'}]
  };
  const runtime=await start({
    gatewayToken:'gateway-proof',
    systemiaMachineKey:'machine-proof',
    sourceUrl:'https://aliev.internal.evercraft.test/rivet-report',
    stateDir,
    generate:(args)=>generateYardReport({...args,sourceFetch:async()=>new Response(JSON.stringify(sourceSnapshot),{status:200})})
  });
  try{
    const created=await fetch(runtime.url+'/api/rivet/reports',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer gateway-proof'},body:JSON.stringify({address:'19820 International Boulevard, SeaTac, WA 98188'})});
    assert.equal(created.status,201);
    const made=await created.json();
    assert.equal(made.generation_state,'ready');
    assert.equal(made.verification.full_source_snapshot_persisted,true);

    const report=await fetch(runtime.url+'/api/rivet/reports/'+encodeURIComponent(made.report_id),{headers:{authorization:'Bearer gateway-proof'}});
    assert.equal(report.status,200);
    const reportBody=await report.json();
    assert.equal(reportBody.report_id,made.report_id);

    const source=await fetch(runtime.url+'/api/rivet/reports/'+encodeURIComponent(made.report_id)+'/source',{headers:{authorization:'Bearer gateway-proof'}});
    assert.equal(source.status,200);
    const sourceBody=await source.json();
    assert.equal(sourceBody.sha256,made.source_snapshot.sha256);
    assert.equal(sourceBody.source_snapshot.matched_address,sourceSnapshot.matched_address);
    assert.equal(Object.keys(sourceBody.source_snapshot.source_coverage_manifest.domains).length,14);
  }finally{
    await runtime.close();
    fs.rmSync(stateDir,{recursive:true,force:true});
  }
}

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.rivet.yard-gateway-proof.v1',
  fail_closed_when_unconfigured:true,
  auth_required:true,
  address_required:true,
  ready_report_returned:true,
  stored_report_retrieval:true,
  full_source_snapshot_retrieval:true,
  exact_source_integrity_verified:true
},null,2));
