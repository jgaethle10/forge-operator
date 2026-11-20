#!/usr/bin/env node
// Independent public-owned-Fabric acceptance. Historical NFIP claims are
// Washington statewide context, NEVER claims for the Yakima sample point.
const origin='https://fabric.systemiacommandcenters.com';
const receipt={
  schema:'evercraft.faie.nfip-wa-live-acceptance.v1',
  origin,scope:'Washington statewide, loss years 2023-2024',
  observed_at:new Date().toISOString(),
  stage:'started',state:'NFIP_AREA_HISTORY_GATE_STARTED',passed:false
};
const must=(condition,message)=>{if(!condition)throw Error(message)};
async function getJson(url,timeout=105000){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeout);
  try{
    const response=await fetch(origin+url,{
      method:'GET',cache:'no-store',redirect:'error',signal:ctl.signal,
      headers:{accept:'application/json','cache-control':'no-store'}
    });
    const raw=await response.text();
    let data;try{data=JSON.parse(raw)}catch{throw Error(url+'_non_json_http_'+response.status)}
    if(!response.ok)throw Error(url+'_http_'+response.status);
    return data;
  }finally{clearTimeout(timer)}
}
try{
  receipt.stage='health_before';
  const before=await getJson('/api/faie/health',15000);
  must(before.ok===true&&before.fabric_native===true,'not_owned_fabric_runtime');
  must(before.public_preview_persists_queries===false,'public_location_privacy_unverified');

  receipt.stage='public_panel';
  const html=await fetch(origin+'/faie/',{redirect:'error',cache:'no-store'});
  must(html.ok,'faie_public_page_unavailable');
  const page=await html.text();
  must(page.includes('id="nfipHistoryPanel"')&&page.includes('Washington statewide'),
    'nfip_area_panel_not_live');
  must(page.includes('not about the selected coordinates')||
       page.includes('not about the selected coordinates, parcel'),
    'missing_independent_area_scope');

  receipt.stage='actual_statewide_nfip_records';
  const result=await getJson('/api/faie/nfip/wa-history',105000);
  must(result.schema==='evercraft.faie.nfip-state-loss-history.v1','nfip_schema_mismatch');
  must(result.source_family==='fema-nfip-redacted-claims-v3','nfip_source_family_not_verified');
  must(result.evidence_state==='REPORTED','nfip_evidence_state_mismatch');
  must(result.status==='area_aggregate_available','nfip_publicable_area_aggregate_missing');
  must(result.geography?.level==='state'&&result.geography?.state==='WA','nfip_wrong_geography');
  must(result.loss_year_range?.first===2023&&result.loss_year_range?.last===2024,'nfip_wrong_loss_years');
  must(Number.isInteger(result.claim_transactions)&&result.claim_transactions>=11,
    'no_publishable_official_claim_records');
  must(Number.isFinite(result.known_payment_components_usd)&&result.known_payment_components_usd>=0,
    'nfip_known_recorded_payment_subtotal_invalid');
  must(result.payment_coverage&&Number.isInteger(result.payment_coverage.records_with_missing_components),
    'nfip_missing_payment_coverage');
  if(result.payment_completeness==='complete'){
    must(result.payment_coverage.records_with_missing_components===0&&
      Number.isFinite(result.total_paid_usd)&&
      result.total_paid_usd===result.known_payment_components_usd,
      'nfip_complete_payment_total_unverified');
  }else if(result.payment_completeness==='partial'){
    must(result.payment_coverage.records_with_missing_components>0&&result.total_paid_usd===null,
      'nfip_partial_payments_marked_as_complete');
  }else throw Error('nfip_payment_completeness_unknown');
  must(result.source_urls?.includes('https://www.fema.gov/api/open/v3/NfipClaims'),
    'nfip_source_not_official');
  must(result.request_persisted===false&&result.decision_authority===false&&result.publication_authority===false,
    'nfip_privacy_or_decision_authority_failed');
  must(result.parcel_claim_history===null&&result.insurance_eligibility_decision===null&&result.site_suitability_verdict===null,
    'nfip_private_claims_or_insurance_verdict_inferred');

  receipt.stage='reject_property_search';
  const refuse=await fetch(origin+'/api/faie/nfip/wa-history?address=private',{
    cache:'no-store',redirect:'error'
  });
  must(refuse.status===400,'nfip_property_lookup_not_denied');

  receipt.stage='health_after';
  const after=await getJson('/api/faie/health',15000);
  must(after.investigation_count===before.investigation_count,'nfip_public_lookup_persisted_investigation');
  must(after.comparison_count===before.comparison_count,'nfip_public_lookup_persisted_comparison');
  receipt.claim_transactions=result.claim_transactions;
  receipt.total_paid_usd=result.total_paid_usd;
  receipt.known_payment_components_usd=result.known_payment_components_usd;
  receipt.payment_completeness=result.payment_completeness;
  receipt.records_with_missing_components=result.payment_coverage.records_with_missing_components;
  receipt.state='OFFICIAL_NFIP_WA_AREA_HISTORY_VERIFIED';
  receipt.stage='passed';receipt.passed=true;
}catch(error){
  receipt.failed_stage=receipt.stage;
  receipt.stage='failed';receipt.state='NFIP_WA_AREA_HISTORY_RELEASE_HOLD';
  receipt.error=error instanceof Error?error.message:String(error);
  process.exitCode=1;
}
process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
