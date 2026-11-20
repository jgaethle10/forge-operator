#!/usr/bin/env node
// External, source-grounded and read-only FAIE soil acceptance on the owned edge.
// Fixed public test point near Yakima, WA. No customer location or private IP is involved.
const origin = 'https://fabric.systemiacommandcenters.com';
const receipt = {
  schema:'evercraft.faie.usda-soil-live-acceptance.v1',
  observed_at:new Date().toISOString(),
  origin,
  source:'USDA NRCS Soil Data Access / SSURGO',
  public_sample_only:true,
  passed:false,
  stage:'start'
};

async function req(path, init={}) {
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),22000);
  try{
    const response=await fetch(origin+path,{
      ...init,
      redirect:'error',
      cache:'no-store',
      signal:controller.signal
    });
    let parsed;
    try { parsed=await response.json(); }
    catch {throw new Error(path+'_non_json_http_'+response.status);}
    if(!response.ok)throw new Error(path+'_http_'+response.status+':'+String(parsed.error||'unknown_error'));
    return parsed;
  }finally{clearTimeout(timeout);}
}
function assert(condition,name){if(!condition)throw new Error(name);}
try {
  receipt.stage='health_before';
  const before=await req('/api/faie/health');
  assert(before.ok===true && before.fabric_native===true,'faie_runtime_not_healthy');
  assert(before.public_preview_persists_queries===false,'ephemeral_preview_not_enforced');

  receipt.stage='usda_soil_read';
  const data=await req('/api/faie/soil/preview',{
    method:'POST',
    headers:{'content-type':'application/json','accept':'application/json'},
    body:JSON.stringify({latitude:46.6021,longitude:-120.5059})
  });
  assert(data.schema==='evercraft.faie.public-soil-preview.v1','soil_schema_invalid');
  assert(data.evidence_state==='REPORTED','soil_state_not_reported');
  assert(data.request_persisted===false,'soil_lookup_not_ephemeral');
  assert(data.site_suitability_verdict===null && data.decision_authority===false,'soil_unauthorized_site_verdict');
  assert(data.field_verification_required===true && data.soil_testing_performed===false,'soil_field_test_claim');
  assert(data.source==='USDA NRCS Soil Data Access / SSURGO','soil_source_mismatch');
  assert(data.coordinates?.latitude===46.6021 && data.coordinates?.longitude===-120.5059,'soil_wrong_coordinates');
  assert(data.status==='mapped_soil_available'&&data.mapunit_count>0&&data.mapunits?.some(x=>x.name),'soil_official_mapunits_missing');
  assert(Array.isArray(data.provenance_urls)&&data.provenance_urls.some(url=>url.includes('sdmdataaccess.nrcs.usda.gov')),'soil_source_links_missing');
  receipt.mapunit_count=data.mapunit_count;
  receipt.survey_update_available=Boolean(data.source_updated_at);
  receipt.first_mapunit=data.mapunits[0].name;

  receipt.stage='privacy_after';
  const after=await req('/api/faie/health');
  assert(before.investigation_count===after.investigation_count,'soil_preview_persisted_investigation');
  assert(before.comparison_count===after.comparison_count,'soil_preview_persisted_comparison');
  assert(before.observation_count<=after.observation_count,'observation_state_inconsistent');
  receipt.stage='passed';
  receipt.passed=true;
  receipt.state='SOIL_LIVE_SOURCE_VERIFIED';
}catch(error){
  receipt.stage_failed=receipt.stage;
  receipt.state='SOIL_LIVE_SOURCE_HOLD';
  receipt.error=error instanceof Error?error.message:String(error);
  receipt.stage='failed';
  process.exitCode=1;
}
process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
