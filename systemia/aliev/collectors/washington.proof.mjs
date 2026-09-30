import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  collectWashingtonTraffic,
  collectWashingtonUtilityServiceArea,
  refreshWashingtonSiteDomains,
  WSDOT_TRAFFIC_URL,
  WA_UTILITY_AREA_URL
} from './washington.mjs';
import { queryAliEvDomain } from '../domain-store.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'wa-owned-collector-proof-'));
const calls=[];
const fetchImpl=async(input)=>{
  const url=new URL(String(input));
  calls.push(url);
  if(url.origin+url.pathname===new URL(WSDOT_TRAFFIC_URL).origin+new URL(WSDOT_TRAFFIC_URL).pathname){
    assert.equal(url.searchParams.get('geometry'),'-122.2955,47.4239');
    assert.equal(url.searchParams.get('distance'),'10');
    return new Response(JSON.stringify({
      features:[
        {properties:{OBJECTID:101,RouteIdentifier:'SR 518',Location:'SeaTac',AADT:52000,ReportingYear:2025},geometry:{coordinates:[-122.296,47.424]}},
        {properties:{OBJECTID:102,RouteIdentifier:'I-5',Location:'SeaTac',AADT:null,ReportingYear:2025},geometry:{coordinates:[-122.30,47.42]}}
      ]
    }),{status:200,headers:{'content-type':'application/json'}});
  }
  if(url.origin+url.pathname===new URL(WA_UTILITY_AREA_URL).origin+new URL(WA_UTILITY_AREA_URL).pathname){
    assert.equal(url.searchParams.get('geometry'),'-122.2955,47.4239');
    return new Response(JSON.stringify({
      features:[{attributes:{OBJECTID:7,Name:'Seattle City Light'}}]
    }),{status:200,headers:{'content-type':'application/json'}});
  }
  return new Response('{}',{status:404});
};

try{
  const traffic=await collectWashingtonTraffic({
    stateDir:root,latitude:47.4239,longitude:-122.2955,fetchImpl,retrievedAt:'2026-09-30T21:30:00Z'
  });
  assert.equal(traffic.source_status,'connected');
  assert.equal(traffic.records,1);
  const trafficRows=queryAliEvDomain({stateDir:root,domain:'traffic',latitude:47.4239,longitude:-122.2955,radiusMiles:10});
  assert.equal(trafficRows.length,1);
  assert.equal(trafficRows[0].aadt,52000);
  assert.equal(trafficRows[0].state,'WA');
  assert.match(trafficRows[0].semantics,/not live congestion/i);

  const utility=await collectWashingtonUtilityServiceArea({
    stateDir:root,latitude:47.4239,longitude:-122.2955,fetchImpl,retrievedAt:'2026-09-30T21:30:00Z'
  });
  assert.equal(utility.source_status,'screen_match');
  const utilityRows=queryAliEvDomain({stateDir:root,domain:'utility_service_area',latitude:47.4239,longitude:-122.2955,radiusMiles:0.5});
  assert.equal(utilityRows.length,1);
  assert.equal(utilityRows[0].utility_name,'Seattle City Light');
  assert.match(utilityRows[0].semantics,/confirm actual service/i);

  const refreshed=await refreshWashingtonSiteDomains({
    stateDir:root,latitude:47.4239,longitude:-122.2955,fetchImpl,retrievedAt:'2026-09-30T21:31:00Z'
  });
  assert.equal(refreshed.collectors.traffic.source_status,'connected');
  assert.equal(refreshed.collectors.utility_service_area.source_status,'screen_match');
  assert.equal(calls.length,4);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.aliev.washington-owned-collectors-proof.v1',
    wsdot_aadt_direct_to_evercraft:true,
    invalid_missing_aadt_not_ingested:true,
    wa_ecology_utility_screen_direct_to_evercraft:true,
    utility_screen_guardrail_preserved:true,
    base44_runtime_required:false
  },null,2));
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
