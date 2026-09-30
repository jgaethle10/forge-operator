import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  collectUsAfdcCharging,
  collectUsAfdcIncentives,
  refreshOwnedAliEvSiteDomains,
  AFDC_NEAREST_URL,
  AFDC_INCENTIVES_URL
} from './us.mjs';
import { WSDOT_TRAFFIC_URL, WA_UTILITY_AREA_URL } from './washington.mjs';
import { queryAliEvDomain } from '../domain-store.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'us-owned-collectors-proof-'));
const calls=[];
const samePath=(a,b)=>{
  const x=new URL(a),y=new URL(b);
  return x.origin+x.pathname===y.origin+y.pathname;
};
const fetchImpl=async(input)=>{
  const url=new URL(String(input));
  calls.push(url);
  if(samePath(url,AFDC_NEAREST_URL)){
    assert.equal(url.searchParams.get('fuel_type'),'ELEC');
    assert.equal(url.searchParams.get('access'),'public');
    assert.equal(url.searchParams.get('status'),'E');
    assert.equal(url.searchParams.get('api_key'),'proof-key');
    return new Response(JSON.stringify({
      fuel_stations:[
        {
          id:9001,station_name:'Proof Fast Site',ev_network:'Proof Network',
          latitude:47.425,longitude:-122.297,street_address:'1 Proof Way',city:'SeaTac',state:'WA',zip:'98188',
          ev_level2_evse_num:2,ev_dc_fast_num:6,ev_level1_evse_num:null,ev_other_evse:null,
          ev_connector_types:['J1772','CCS'],
          ev_charging_units:[{port_count:6,connectors:{a:{power_kw:250}}}],
          access_code:'public',status_code:'E',ev_pricing:'$0.45/kWh',
          updated_at:'2026-09-30T21:00:00Z'
        }
      ]
    }),{status:200,headers:{'content-type':'application/json'}});
  }
  if(samePath(url,AFDC_INCENTIVES_URL)){
    assert.equal(url.searchParams.get('jurisdiction'),'US-WA');
    assert.equal(url.searchParams.get('technology'),'ELEC');
    assert.equal(url.searchParams.get('api_key'),'proof-key');
    return new Response(JSON.stringify({
      result:[{id:77,title:'Proof Charging Grant',type:'Incentive',jurisdiction:'US-WA',description:'Proof only',url:'https://example.test/incentive'}]
    }),{status:200,headers:{'content-type':'application/json'}});
  }
  if(samePath(url,WSDOT_TRAFFIC_URL)){
    return new Response(JSON.stringify({
      features:[{properties:{OBJECTID:10,RouteIdentifier:'SR 518',Location:'SeaTac',AADT:51000,ReportingYear:2025},geometry:{coordinates:[-122.296,47.424]}}]
    }),{status:200,headers:{'content-type':'application/json'}});
  }
  if(samePath(url,WA_UTILITY_AREA_URL)){
    return new Response(JSON.stringify({
      features:[{attributes:{OBJECTID:8,Name:'Seattle City Light'}}]
    }),{status:200,headers:{'content-type':'application/json'}});
  }
  return new Response('{}',{status:404});
};

try{
  const chargers=await collectUsAfdcCharging({
    stateDir:root,latitude:47.4239,longitude:-122.2955,state:'WA',apiKey:'proof-key',fetchImpl,retrievedAt:'2026-09-30T21:45:00Z'
  });
  assert.equal(chargers.source_status,'connected');
  assert.equal(chargers.records,1);
  assert.equal(chargers.credential_mode,'configured_key');
  assert.equal(chargers.credential_persisted,false);
  const chargingRows=queryAliEvDomain({stateDir:root,domain:'charging_inventory',latitude:47.4239,longitude:-122.2955,radiusMiles:15});
  assert.equal(chargingRows[0].external_id,'afdc:9001');
  assert.equal(chargingRows[0].ports,6);
  assert.equal(chargingRows[0].dc_fast_ports,6);
  assert.equal(chargingRows[0].power_kw,250);
  assert.equal(chargingRows[0].retail_price_note,'$0.45/kWh');
  assert.match(chargingRows[0].semantics,/not operator utility cost/i);

  const incentives=await collectUsAfdcIncentives({
    stateDir:root,state:'WA',apiKey:'proof-key',fetchImpl,retrievedAt:'2026-09-30T21:45:00Z'
  });
  assert.equal(incentives.source_status,'connected');
  const incentiveRows=queryAliEvDomain({stateDir:root,domain:'incentives',state:'WA'});
  assert.equal(incentiveRows[0].title,'Proof Charging Grant');
  assert.match(incentiveRows[0].eligibility_guardrail,/not site eligibility/i);

  const all=await refreshOwnedAliEvSiteDomains({
    stateDir:root,state:'WA',latitude:47.4239,longitude:-122.2955,afdcApiKey:'proof-key',fetchImpl,retrievedAt:'2026-09-30T21:46:00Z'
  });
  assert.equal(all.base44_runtime_required,false);
  assert.equal(all.collectors.charging_inventory.source_status,'connected');
  assert.equal(all.collectors.incentives.source_status,'connected');
  assert.equal(all.collectors.traffic.source_status,'connected');
  assert.equal(all.collectors.utility_service_area.source_status,'screen_match');

  const serialized=JSON.stringify(all);
  assert.equal(serialized.includes('proof-key'),false);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.aliev.us-owned-collectors-proof.v1',
    afdc_charging_direct_to_evercraft:true,
    afdc_incentives_direct_to_evercraft:true,
    configured_api_key_not_persisted:true,
    washington_collectors_composed:true,
    charger_power_and_port_semantics_preserved:true,
    retail_price_not_operator_cost:true,
    base44_runtime_required:false
  },null,2));
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
