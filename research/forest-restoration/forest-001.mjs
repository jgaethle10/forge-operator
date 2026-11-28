// FOREST-001: source-scoped baseline and explicitly hypothetical economics.
// No network, persistence, dispatch, checkout, or changes to FAIE history.
// Run: node research/forest-restoration/forest-001.mjs
// Test: node research/forest-restoration/forest-001.mjs --self-test
// Scenario: node research/forest-restoration/forest-001.mjs --scenario '<JSON>'
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

const dnr = 'https://dnr.wa.gov/sites/default/files/2025-05/rp_forest_health_assessment_treatment_report_2024.pdf';
const bber = 'https://www.bber.umt.edu/pubs/forest/capacity/CentralWashington2026.pdf';
const gis = 'https://services.arcgis.com/4x406oNViizbGo13/ArcGIS/rest/services/Completed_FH_Treatments_2017_2022_EWA/FeatureServer/0';
const landscape = (name,low,high) => ({
  name, geography_type:'DNR priority landscape', metric:'assessed_treatment_need',
  unit:'acre', low, high, as_of:'2024-10', source:dnr, locator:'Table 8',
  evidence:'parsed_report', image_verification:'blocked', rights:'metadata_only_rights_unverified'
});
export const baseline = {
  schema:'evercraft.forest-001.baseline.v1', reviewed_on:'2026-11-25',
  landscapes:[
    landscape('Tieton',38000,60500),
    landscape('Teanaway',38500,60000),
    landscape('Upper Swauk',14000,22000),
    landscape('Upper Yakima',null,null)
  ],
  historical_capacity:[
    {geography:'Yakima and Kittitas counties', value:59896},
    {geography:'Central Washington study region (WA/ID/OR)',value:214464}
  ].map(row=>({...row,metric:'estimated_unused_processing_capacity',
    unit:'MBF Scribner', observation_years:[2020,2022,2023],
    publication_month:'2026-04',source:bber,locator:'Table 11',
    evidence:'prior_issue_2562_receipt_002',reverification:'redirect_blocked',
    current_capacity:false})),
  treatment_layer:{
    url:gis, coverage_start:'2017-01-01', coverage_end:'2026-10-31',
    evidence:'layer_metadata_verified', service_parent_metadata:'older May 2026 description',
    geometry:'polygon', max_records:2000, id_field:'OBJECTID',
    fields:['OBJECTID','DATE_COMPL','ACTIVITY','PARTNER','TREATMENT','ACRES_TREATED','GIS_ACRES','GlobalID'],
    query_status:'count_query_blocked', features_ingested:0,
    note:'Use layer-specific metadata; distinguish reported acres from unioned geographic footprint; no private owner inference.'
  },
  candidate_project:{
    name:'Chelan County Forest Products Campus',
    source:'https://chelancountywa.gov/natural-resources/pages/forest-products-campus',
    state:'historical_planning_signal', existing_feasibility_study:true,
    buyer:null, unmet_need:null, open_procurement:null
  },
  unknowns:{current_eligible_treatment_acres:null, recoverable_mbf:null,
    available_mbf_per_year:null, confirmed_demand_mbf_per_year:null,
    delivered_price_usd_per_mbf:null, transport_cost_usd_per_mbf:null,
    net_incremental_jobs:null, actual_net_margin:null}
};
export function summarize(data=baseline){
  const rows=data.landscapes.filter(r=>r.low!==null&&r.high!==null);
  return {metric:'historical_assessed_treatment_need_partial_sum',
    unit:'acre', as_of:'2024-10', included:rows.map(r=>r.name),
    excluded:data.landscapes.filter(r=>r.low===null||r.high===null).map(r=>r.name),
    low:rows.reduce((s,r)=>s+r.low,0), high:rows.reduce((s,r)=>s+r.high,0),
    not_harvestable_acres:true};
}
const fields=['eligible_annual_acres','recoverable_mbf_per_acre',
  'available_mbf_per_year','confirmed_demand_mbf_per_year','delivered_price_usd_per_mbf',
  'harvest_cost_usd_per_mbf','haul_cost_usd_per_mbf','other_variable_cost_usd_per_mbf',
  'annual_fixed_cost_usd'];
export function scenario(p){
  if(!p||p.mode!=='hypothetical')throw new Error('explicit_hypothetical_mode_required');
  const missing=fields.filter(k=>p[k]===undefined||p[k]===null);
  if(missing.length)return {state:'HOLD_MISSING_INPUTS',missing,annual_volume_mbf:null,annual_net_usd:null};
  for(const k of fields)if(typeof p[k]!=='number'||!Number.isFinite(p[k])||p[k]<0)throw new Error('invalid_'+k);
  const supply=p.eligible_annual_acres*p.recoverable_mbf_per_acre;
  const volume=Math.min(supply,p.available_mbf_per_year,p.confirmed_demand_mbf_per_year);
  const revenue=volume*p.delivered_price_usd_per_mbf;
  const variable=volume*(p.harvest_cost_usd_per_mbf+p.haul_cost_usd_per_mbf+p.other_variable_cost_usd_per_mbf);
  const net=revenue-variable-p.annual_fixed_cost_usd;
  if(![supply,volume,revenue,variable,net].every(Number.isFinite))throw new Error('numeric_overflow');
  return {state:'HYPOTHETICAL_NOT_FORECAST', annual_supply_mbf:supply, annual_volume_mbf:volume,
    annual_revenue_usd:revenue,annual_variable_cost_usd:variable,annual_fixed_cost_usd:p.annual_fixed_cost_usd,
    annual_net_before_tax_and_financing_usd:net, incremental_jobs:null,
    note:'No subsidy, avoided fire loss, mill conversion yield or jobs multiplier assumed. Requires ecological/legal clearance and independent supply, buyer and cost evidence.'};
}
function selfTest(){
  assert.equal(summarize().low,90500); assert.equal(summarize().high,142500);
  assert.deepEqual(summarize().excluded,['Upper Yakima']);
  assert.equal(scenario({mode:'hypothetical'}).state,'HOLD_MISSING_INPUTS');
  const p={mode:'hypothetical',eligible_annual_acres:100,recoverable_mbf_per_acre:2,
    available_mbf_per_year:150,confirmed_demand_mbf_per_year:120,delivered_price_usd_per_mbf:400,
    harvest_cost_usd_per_mbf:160,haul_cost_usd_per_mbf:90,other_variable_cost_usd_per_mbf:50,annual_fixed_cost_usd:5000};
  assert.equal(scenario(p).annual_volume_mbf,120);
  assert.equal(scenario(p).annual_net_before_tax_and_financing_usd,7000);
  assert.equal(scenario({...p,confirmed_demand_mbf_per_year:0}).annual_net_before_tax_and_financing_usd,-5000);
  assert.throws(()=>scenario({...p,haul_cost_usd_per_mbf:-1}));
  assert.throws(()=>scenario({...p,mode:'actual'}));
  return {state:'PASS',assertions:9};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const arg=process.argv[2];
  const result=arg==='--self-test'?selfTest():arg==='--scenario'?scenario(JSON.parse(process.argv[3])):{baseline,summary:summarize()};
  console.log(JSON.stringify(result,null,2));
}
