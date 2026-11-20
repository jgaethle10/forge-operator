#!/usr/bin/env node
// Public read-only acceptance for the Evercraft-owned historical preservation
// ledger. Never writes anonymous location data or assumes regional history is
// a complete parcel history.
const origin='https://fabric.systemiacommandcenters.com';
const receipt={
  schema:'evercraft.faie.public-land-history-live-acceptance.v1',
  observed_at:new Date().toISOString(),origin,
  state:'STARTED',passed:false
};
function check(value,reason){if(!value)throw new Error(reason)}
async function request(path){
  const ctl=new AbortController();
  const timeout=setTimeout(()=>ctl.abort(),18000);
  try{
    const response=await fetch(origin+path,{
      redirect:'error',cache:'no-store',
      headers:{accept:'application/json','cache-control':'no-store'},
      signal:ctl.signal
    });
    let body;
    try{body=await response.json()}catch{throw new Error(path+'_invalid_json_http_'+response.status)}
    if(!response.ok)throw new Error(path+'_http_'+response.status+':'+String(body?.error||'unknown'));
    return body;
  }finally{clearTimeout(timeout)}
}
try{
  receipt.stage='history_health';
  const before=await request('/api/faie/health');
  const h=before.land_history_archive;
  check(before.ok===true&&before.fabric_native===true,'owned_faie_runtime_not_ready');
  check(before.public_preview_persists_queries===false,'public_preview_privacy_failure');
  check(before.edge_state_persistence==='configured_persistent_or_operator_managed','history_owner_managed_state_root_not_configured');
  check(h?.status==='active','owned_history_archive_not_active');
  check(h.public_region_history_only===true&&h.visitor_point_queries_persisted===false,'history_privacy_boundary');
  check(Number(h.archived_records)>0,'no_official_historical_evidence_archived');
  receipt.record_count=Number(h.archived_records);
  receipt.region_count=Number(h.public_regions);
  receipt.earliest_date=h.earliest_record_date;

  receipt.stage='archived_region_index';
  const index=await request('/api/faie/history/regions');
  check(index.schema==='evercraft.faie.public-history-region-index.v1','history_region_index_schema');
  check(index.public_only===true&&index.exhaustive_history===false,'history_scope_truth');
  check(Array.isArray(index.regions)&&index.regions.length>0,'no_public_regions_in_archive');
  const selected=index.regions.find(r=>r.land_id==='region:yakima-wa')||index.regions[0];
  check(/^region:[a-z0-9][a-z0-9._-]+$/.test(selected.land_id),'unexpected_private_region_identifier');
  receipt.sample_land_id=selected.land_id;

  receipt.stage='sourced_historical_timeline';
  const timeline=await request('/api/faie/history/region?key='+encodeURIComponent(selected.land_id.slice(7)));
  check(timeline.schema==='evercraft.faie.public-land-timeline.v1','history_timeline_schema');
  check(timeline.exhaustive_history===false,'false_complete_history_claim');
  check(timeline.site_suitability_verdict===null&&timeline.decision_authority===false,'historic_site_verdict_violation');
  check(Array.isArray(timeline.records)&&timeline.records.length>0,'no_archived_source_records_in_selected_region');
  check(timeline.records.every(item=>
    item.land_id===selected.land_id&&
    typeof item.event_start==='string'&&
    typeof item.time_precision==='string'&&
    item.source_url?.startsWith('https://')&&
    /^[a-f0-9]{64}$/.test(item.payload_sha256||'')
  ),'history_source_date_scope_or_hash_invalid');
  check(!JSON.stringify(timeline).includes('private_address'),'private_address_leak');
  receipt.sample_records=timeline.records.length;
  receipt.source_families=[...new Set(timeline.records.map(x=>x.source_family))];

  receipt.stage='privacy_after';
  const after=await request('/api/faie/health');
  check(before.investigation_count===after.investigation_count,'history_read_persisted_investigation');
  check(before.comparison_count===after.comparison_count,'history_read_persisted_comparison');
  check(before.land_history_archive.archived_records===after.land_history_archive.archived_records,'public_history_get_modified_archive');
  receipt.stage='passed';
  receipt.state='OWNED_SOURCE_LINKED_LAND_HISTORY_VERIFIED';
  receipt.passed=true;
}catch(error){
  receipt.stage_failed=receipt.stage;
  receipt.state='HISTORICAL_PRESERVATION_RELEASE_HOLD';
  receipt.error=error instanceof Error?error.message:String(error);
  receipt.stage='failed';
  process.exitCode=1;
}
process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
