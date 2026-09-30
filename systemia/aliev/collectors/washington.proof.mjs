import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  collectWashingtonTraffic,
  collectWashingtonUtilityServiceArea,
  collectWashingtonFreight,
  refreshWashingtonSiteDomains,
  WSDOT_TRAFFIC_URL,
  WA_UTILITY_AREA_URL,
  WSDOT_FREIGHT_TRUCK_URL,
  WSDOT_FREIGHT_ECON_URL
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
  if(url.origin+url.pathname===new URL(WSDOT_FREIGHT_TRUCK_URL).origin+new URL(WSDOT_FREIGHT_TRUCK_URL).pathname){
    assert.equal(url.searchParams.get('distance'),'15');
    return new Response(JSON.stringify({
      features:[{attributes:{OBJECTID:11,RouteIdentifier:'I-5',RoadName:'Interstate 5',RoadNumber:'5',FGTSClass:'T-1',TruckTonnage:123456,TruckAADT:9000,TruckPercentage:18.2,TruckVolumeDataYear:'2025',CityName:'SeaTac',CountyName:'King',PublishDate:1750000000000}}]
    }),{status:200,headers:{'content-type':'application/json'}});
  }
  if(url.origin+url.pathname===new URL(WSDOT_FREIGHT_ECON_URL).origin+new URL(WSDOT_FREIGHT_ECON_URL).pathname){
    return new Response(JSON.stringify({
      features:[{attributes:{OBJECTID:12,RouteIdentifier:'SR 518',RoadName:'SR 518',RoadNumber:'518',FGTSClass:'T-2',EconomicCorridorType:'High-volume corridor',Description:'Proof',CityName:'SeaTac',CountyName:'King',StartLocation:'A',EndLocation:'B',ConnectorID:'C1',PublishDate:1750000000000}}]
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

  const freight=await collectWashingtonFreight({
    stateDir:root,latitude:47.4239,longitude:-122.2955,fetchImpl,retrievedAt:'2026-09-30T21:30:00Z'
  });
  assert.equal(freight.source_status,'connected');
  assert.equal(freight.records,2);
  const freightRows=queryAliEvDomain({stateDir:root,domain:'freight',latitude:47.4239,longitude:-122.2955,radiusMiles:1});
  assert.equal(freightRows.length,2);
  assert.ok(freightRows.some(x=>x.fgts_class==='T-1'&&x.truck_aadt===9000));
  assert.ok(freightRows.every(x=>/Query anchor only/.test(x.spatial_semantics)));

  const refreshed=await refreshWashingtonSiteDomains({
    stateDir:root,latitude:47.4239,longitude:-122.2955,fetchImpl,retrievedAt:'2026-09-30T21:31:00Z'
  });
  assert.equal(refreshed.collectors.traffic.source_status,'connected');
  assert.equal(refreshed.collectors.utility_service_area.source_status,'screen_match');
  assert.equal(refreshed.collectors.freight.source_status,'connected');
  assert.equal(calls.length,8);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.aliev.washington-owned-collectors-proof.v1',
    wsdot_aadt_direct_to_evercraft:true,
    invalid_missing_aadt_not_ingested:true,
    wa_ecology_utility_screen_direct_to_evercraft:true,
    utility_screen_guardrail_preserved:true,
    freight_corridor_context_direct_to_evercraft:true,
    freight_query_anchor_not_fabricated_centroid:true,
    base44_runtime_required:false
  },null,2));
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
