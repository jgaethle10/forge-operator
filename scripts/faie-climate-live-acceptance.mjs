#!/usr/bin/env node
// Real, public-data-only NOAA NCEI station canary. No customer point, proprietary
// AgNormal data, private historical source or write-authorized operation.
const origin='https://fabric.systemiacommandcenters.com';
const receipt={
  schema:'evercraft.faie.ncei-historical-live-acceptance.v1',
  observed_at:new Date().toISOString(),
  origin,station_id:'USW00024243',sample_point:'public Yakima example',
  state:'STARTED',passed:false
};
function assert(value,label){if(!value)throw new Error(label)}
async function json(path,options={}){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),49000);
  try{
    const response=await fetch(origin+path,{
      ...options,redirect:'error',cache:'no-store',
      headers:{accept:'application/json','cache-control':'no-store',...(options.headers||{})},
      signal:controller.signal
    });
    const text=await response.text();
    let body;try{body=JSON.parse(text)}catch{throw new Error(path+'_not_json_http_'+response.status)}
    if(!response.ok)throw new Error(path+'_http_'+response.status+':'+String(body.error||'unknown').slice(0,90));
    return body;
  }finally{clearTimeout(timeout)}
}
try{
  receipt.stage='health_before';
  const before=await json('/api/faie/health');
  assert(before.ok===true&&before.fabric_native===true,'owned_health_not_ready');
  assert(before.public_preview_persists_queries===false,'public_history_archive_not_private');

  receipt.stage='official_station_history';
  const climate=await json('/api/faie/climate/history',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({latitude:46.6021,longitude:-120.5059})
  });
  assert(climate.schema==='evercraft.faie.ncei-station-history.v1','schema_mismatch');
  assert(climate.status==='historical_station_context_available','observations_insufficient');
  assert(climate.evidence_state==='OBSERVED','historical_observations_not_observed');
  assert(climate.station?.id==='USW00024243','wrong_station');
  assert(climate.station?.distance_km>0&&climate.station.distance_km<10,'distance_not_grounded');
  assert(climate.expected_days===731&&climate.sample_years?.join(',')==='2023,2024','year_scope_changed');
  assert(climate.metrics?.hot_days_ge_95f?.observed_days>=510,'max_temperature_coverage_insufficient');
  assert(climate.metrics?.freeze_nights_le_32f?.observed_days>=510,'minimum_temperature_coverage_insufficient');
  assert(climate.metrics?.wet_days_ge_0_01in?.observed_days>=510,'precipitation_coverage_insufficient');
  assert(climate.request_persisted===false&&climate.site_suitability_verdict===null&&climate.decision_authority===false,'site_decision_or_privacy_invariant_broken');
  assert(climate.limitations?.some(s=>s.includes('NOT 30-year climate normals')),'climate_normals_false_claim');
  assert(climate.provenance_urls?.some(url=>url.includes('ncei.noaa.gov/access/services/data/v1?')),'official_data_receipt_missing');
  receipt.station_distance_km=climate.station.distance_km;
  receipt.received_calendar_dates=climate.received_calendar_dates;
  receipt.hot_days=climate.metrics.hot_days_ge_95f.threshold_days;
  receipt.freeze_nights=climate.metrics.freeze_nights_le_32f.threshold_days;
  receipt.wet_days=climate.metrics.wet_days_ge_0_01in.threshold_days;
  receipt.temperature_days_measured=climate.metrics.hot_days_ge_95f.observed_days;
  receipt.precip_days_measured=climate.metrics.wet_days_ge_0_01in.observed_days;
  
  receipt.stage='privacy_after';
  const after=await json('/api/faie/health');
  assert(after.investigation_count===before.investigation_count,'archive_investigation_count_changed');
  assert(after.comparison_count===before.comparison_count,'archive_comparison_count_changed');
  receipt.stage='passed';
  receipt.state='OFFICIAL_NOAA_STATION_HISTORY_VERIFIED';
  receipt.passed=true;
}catch(error){
  receipt.stage_failed=receipt.stage;
  receipt.stage='failed';receipt.state='NOAA_HISTORY_RELEASE_HOLD';
  receipt.error=error instanceof Error?error.message:String(error);
  process.exitCode=1;
}
process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
