#!/usr/bin/env node
// Release canary on public sample coordinates: real NWS and USDA source reads,
// no customer or AgNormal IP and no rights, suitability or crop-yield assertion.
const origin='https://fabric.systemiacommandcenters.com';
const receipt={
  schema:'evercraft.faie.site-scan-live-acceptance.v1',
  observed_at:new Date().toISOString(),
  origin,
  location:'public-sample-yakima-point',
  state:'STARTED',
  passed:false
};
function check(value,name){if(!value)throw new Error(name);}
async function request(path,options={}){
  const ctl=new AbortController();
  const timer=setTimeout(()=>ctl.abort(),46000);
  try{
    const res=await fetch(origin+path,{
      ...options,cache:'no-store',redirect:'error',
      headers:{'accept':'application/json','cache-control':'no-store',...(options.headers||{})},
      signal:ctl.signal
    });
    const text=await res.text();
    let body;
    try{body=JSON.parse(text);}catch{throw new Error(path+'_invalid_json_http_'+res.status);}
    if(!res.ok)throw new Error(path+'_http_'+res.status+':'+String(body?.error||'unknown').slice(0,90));
    return body;
  }finally{clearTimeout(timer);}
}
try{
  receipt.stage='health_before';
  const before=await request('/api/faie/health');
  check(before.ok===true&&before.fabric_native===true,'owned_edge_not_healthy');
  check(before.public_preview_persists_queries===false,'public_archive_unsafe');

  receipt.stage='site_point_scan';
  const data=await request('/api/faie/site/scan',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({latitude:46.6021,longitude:-120.5059})
  });
  check(data.schema==='evercraft.faie.site-scan.v1','site_scan_schema_invalid');
  check(data.coordinates?.latitude===46.6021&&data.coordinates?.longitude===-120.5059,'site_point_mismatch');
  check(data.sources_checked===2&&data.sources_with_usable_evidence===2,'two_official_sources_not_returning_useful_data');
  check(data.soil?.evidence_state==='REPORTED'&&data.soil?.mapunits?.some(row=>row.name),'actual_usda_mapped_soils_missing');
  check(data.soil?.provenance_urls?.some(url=>url.includes('sdmdataaccess.nrcs.usda.gov')),'usda_provenance_missing');
  check(data.weather?.status==='forecast_available'&&data.weather?.evidence_state==='MODELED','nws_forecast_missing_or_incorrect_evidence_state');
  check(data.weather?.forecast_freshness==='current'&&data.weather?.forecast_issued_at,'nws_forecast_not_fresh');
  check(data.weather?.periods?.length>0,'nws_forecast_periods_missing');
  check(data.weather?.provenance_urls?.some(url=>url.startsWith('https://api.weather.gov/gridpoints/')),'nws_forecast_link_missing');
  check(data.privacy?.public_lookup_persisted===false&&data.privacy?.upstream_receives_site_coordinates===true,'site_scan_privacy_boundary');
  check(data.site_suitability_verdict===null&&data.investment_recommendation===null&&data.decision_authority===false,'scan_makes_unauthorized_decision');
  check(data.next_checks?.some(text=>/water rights/i.test(text)),'water_rights_missing_from_proof');
  check(data.next_checks?.some(text=>/soil assessment/i.test(text)),'field_soil_verification_missing');
  receipt.usda_mapunit=data.soil.mapunits[0].name;
  receipt.usda_mapunit_count=data.soil.mapunit_count;
  receipt.nws_forecast_office=data.weather.forecast_office;
  receipt.nws_issued_at=data.weather.forecast_issued_at;
  receipt.nws_forecast_periods=data.weather.periods.length;
  receipt.weather_screening_triggers=data.weather.screening_flags?.map(f=>f.trigger)||[];

  receipt.stage='privacy_after';
  const after=await request('/api/faie/health');
  check(before.investigation_count===after.investigation_count,'site_scan_persisted_investigation');
  check(before.comparison_count===after.comparison_count,'site_scan_persisted_comparison');
  receipt.state='OFFICIAL_TWO_SOURCE_SITE_SCAN_VERIFIED';
  receipt.passed=true;
  receipt.stage='passed';
}catch(error){
  receipt.stage_failed=receipt.stage;
  receipt.stage='failed';
  receipt.state='SITE_SCAN_RELEASE_HOLD';
  receipt.error=error instanceof Error?error.message:String(error);
  process.exitCode=1;
}
process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
