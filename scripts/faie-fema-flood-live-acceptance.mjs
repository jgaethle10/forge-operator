#!/usr/bin/env node
// Public-source FEMA NFHL point acceptance; fixed public Yakima sample only.
// Never infer flood safety or map a private insurer's claims.
const origin='https://fabric.systemiacommandcenters.com';
const receipt={
  schema:'evercraft.faie.fema-flood-live-acceptance.v1',
  observed_at:new Date().toISOString(),
  origin,sample_point:'public Yakima sample 46.6021,-120.5059',
  stage:'started',state:'FEMA_MAP_GATE_STARTED',passed:false
};
function check(value,name){if(!value)throw new Error(name);}
async function json(path,options={}){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),48000);
  try{
    const response=await fetch(origin+path,{
      ...options,cache:'no-store',redirect:'error',
      headers:{accept:'application/json','cache-control':'no-store',...(options.headers||{})},
      signal:ctl.signal
    });
    const txt=await response.text();
    let data;try{data=JSON.parse(txt);}catch{throw new Error(path+'_non_json_http_'+response.status);}
    if(!response.ok)throw new Error(path+'_http_'+response.status+':'+String(data.error||'unknown').slice(0,120));
    return data;
  }finally{clearTimeout(timer);}
}
try{
  receipt.stage='preflight';
  const before=await json('/api/faie/health');
  check(before.ok===true&&before.fabric_native===true,'owned_faie_runtime_not_healthy');
  check(before.public_preview_persists_queries===false,'public_queries_not_ephemeral');

  receipt.stage='actual_fema_hazard_point';
  const map=await json('/api/faie/flood/preview',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({latitude:46.6021,longitude:-120.5059})
  });
  check(map.schema==='evercraft.faie.fema-flood-point.v1','wrong_fema_schema');
  check(map.source_family==='fema-effective-nfhl'&&map.evidence_state==='REPORTED','map_source_not_authorized');
  check(map.status==='mapped_hazard_polygon_at_point'||
        map.status==='no_hazard_polygon_returned_with_panel_context','no_fema_hazard_or_panel_coverage_confirmed');
  check(Array.isArray(map.hazard_polygons)&&Array.isArray(map.firm_panels),'mapped_responses_invalid');
  check(map.hazard_polygons.length>0||map.firm_panels.length>0,'official_fema_map_has_no_point_context');
  check(map.source_urls?.some(url=>url==='https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28'),'source_url_not_official');
  check(map.request_persisted===false&&map.decision_authority===false&&map.publication_authority===false,'privacy_or_authority_failed');
  check(map.insurance_eligibility_decision===null&&map.insurance_premium_estimate===null&&map.site_suitability_verdict===null,'flood_map_fabricated_underwriting');
  check(map.limitations?.some(line=>line.includes('NOT evidence')),'missing_no_map_means_safe_warning');
  receipt.flood_zone_records=map.hazard_polygons.length;
  receipt.firm_panel_records=map.firm_panels.length;
  receipt.reported_zones=map.hazard_polygons.map(x=>x.flood_zone);
  receipt.firm_effective_dates=map.firm_panels.map(x=>x.effective_date);

  receipt.stage='privacy_after';
  const after=await json('/api/faie/health');
  check(after.investigation_count===before.investigation_count,'lookup_written_to_investigation_archive');
  check(after.comparison_count===before.comparison_count,'lookup_written_to_comparison_archive');

  receipt.state='OFFICIAL_FEMA_NFHL_POINT_VERIFIED';
  receipt.passed=true;
  receipt.stage='passed';
}catch(error){
  receipt.failed_stage=receipt.stage;
  receipt.stage='failed';
  receipt.state='FEMA_FLOOD_RELEASE_HOLD';
  receipt.error=error instanceof Error?error.message:String(error);
  process.exitCode=1;
}
process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
