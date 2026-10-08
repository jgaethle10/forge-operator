#!/usr/bin/env node
/**
 * Independent, pure source-behavior evidence for the owner of the protected
 * RIVET report runtime. This does not update protected baselines or approve
 * the new freshness behavior.
 */
import {buildYardReport} from '../rivet/report-runtime.mjs';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const DOMAINS=[
 'geocoding','charging_inventory','traffic','traffic_temporal','utility_service_area',
 'utility_tariff','incentives','parcel_planning','local_ev_stock','observed_sessions',
 'freight','dwell_context','deep_market_evidence','provenance'
];
function fixture(extra={}){
 return {
  matched_address:'Synthetic RIVET review address; not a real parcel',
  evidence_state:'source_partial',
  response_profile:'synthetic_owner_review_only',
  traffic:[{aadt:3200,source:'synthetic_fixture'}],
  chargers:[{id:'synthetic_1'}],
  // Deliberately NO observed usage and NO verified tariff or incentive.
  nearby_observed_usage:[],
  incentives:[],
  source_coverage_manifest:{
   schema:'evercraft.rivet.source-coverage.v1',
   generated_at:'2026-10-07T00:00:00Z',
   domains:Object.fromEntries(DOMAINS.map(d=>[d,{state:'unverified',record_count:null}]))
  },
  ...extra,
 };
}
export function reviewRivetFreshnessDecision(){
 const baseline=buildYardReport({
  address:'synthetic',sourceSnapshot:fixture(),
  retrievedAt:'2026-10-07T00:00:00Z'
 });
 const withRefresh=buildYardReport({
  address:'synthetic',
  sourceSnapshot:fixture({session_freshness:{
   refreshed_at:'2026-10-07T00:00:00Z',
   latest_observed_at:null,
   refresh_age_minutes:null,
   freshness_state:'NO_OBSERVED_ROWS'
  }}),
  retrievedAt:'2026-10-07T00:00:00Z'
 });
 const noUsage=baseline.evidence.observed_usage.length===0 &&
  withRefresh.evidence.observed_usage.length===0;
 const changesDecision=baseline.decision.label!==withRefresh.decision.label;
 const refreshPoint=withRefresh.decision.strongest_points.some(x=>x.startsWith('Session evidence last refreshed'));
 return {
  schema:'evercraft.rivet.freshness-owner-review-witness.v1',
  mode:'synthetic_no_mutation',
  protected_source_modified:false,
  protected_test_modified:false,
  partner_or_owner_approval_observed:false,
  current_source_behavior_only:true,
  assessment_authority:false,
  customer_suitability_proved:false,
  synthetic_observed_session_rows:0,
  baseline_decision:baseline.decision.label,
  with_refresh_decision:withRefresh.decision.label,
  baseline_strongest_count:baseline.decision.strongest_points.length,
  with_refresh_strongest_count:withRefresh.decision.strongest_points.length,
  refresh_added_without_observed_usage:noUsage && refreshPoint,
  freshness_alone_changes_report_decision:noUsage && changesDecision,
  governance_status:noUsage && changesDecision
   ? 'owner_review_required_possible_evidence_rating_inflation'
   : 'owner_review_required_behavior_not_reproduced',
  next_gate:'partner_owner_decision_on_freshness_as_positive_decision_point_before_baseline_update'
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const output=process.argv[2]||'rivet-freshness-governance-review.json';
 const result=reviewRivetFreshnessDecision();
 await writeFile(output,JSON.stringify(result,null,2)+'\n');
 process.stdout.write(JSON.stringify(result)+'\n');
}
