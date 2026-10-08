#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const registry=JSON.parse(readFileSync(new URL('./session-source-registry.json',import.meta.url),'utf8'));
const policies=registry.admission_policy;
const sources=registry.new_source_admission_queue||[];
const checks=[];

function check(name,predicate){
  const pass=Boolean(predicate);
  checks.push({name,pass});
  console.log((pass?'PASS ':'FAIL ')+name);
}
check('canonical_observed_usage_store_unchanged',registry.canonical_entity==='EVObservedUsageAggregate');
check('five_state_observation_baseline_is_dated_not_live',registry.live_coverage_baseline?.as_of!=='2026-10-08');
check('source_rights_required',policies.observed_session_requirements.some(s=>/commercial-use rights/.test(s)));
check('observed_sessions_distinct_from_inventory',policies.observed_session_requirements.some(s=>/Station inventory/.test(s)));
check('observation_distinct_from_retrieval',policies.observed_session_requirements.some(s=>/Source scan timestamp/.test(s)));
check('publisher_lag_lookback_three_months',policies.freshness_lookback?.individual_sessions?.months_relative_to_current?.join(',')==='0,-1,-2');
check('nyc_incremental_budgets_bounded',policies.freshness_lookback?.individual_sessions?.max_pages_per_month_per_cycle?.every(x=>x>=1&&x<=8));
check('nyc_partial_observation_label_preserved',/partial/.test(policies.freshness_lookback?.monthly_observed_aggregates?.current_month||''));
check('no_unproven_scheduler_claim',/not_yet_verified/.test(policies.freshness_lookback?.current_production_execution_status||''));
const charlotte=sources.find(s=>s.source_id==='us-nc-charlotte-municipal-ev-charging-sites-2026');
const barnet=sources.find(s=>s.source_id==='gb-london-barnet-charging-transactions');
const penn=sources.find(s=>s.source_id==='us-pa-penndot-nevi-operations-access');
check('charlotte_schema_verified',charlotte?.source_fields_verified?.includes('Ports_at_Location'));
check('charlotte_license_attributed',charlotte?.license==='CC-BY-4.0');
check('charlotte_inventory_not_observed_sessions',charlotte?.allowed_for_rivet_session_count===false&&charlotte?.allowed_evidence_class==='charger_inventory_only');
check('barnet_license_unresolved',barnet?.license==='not_set_for_dataset');
check('barnet_commercial_ingest_blocked',barnet?.allowed_for_rivet_session_count===false&&/^HELD_/.test(barnet?.commercial_ingest_state||''));
check('penndot_operations_not_sessions',penn?.allowed_for_rivet_session_count===false&&penn?.allowed_evidence_class==='operational_status_candidate');
check('candidate_keys_unique',sources.length===new Set(sources.map(s=>s.source_id)).size);
check('all_held_sources_fail_closed',sources.every(s=>s.allowed_for_rivet_session_count===false));
if(checks.some(c=>!c.pass)){
 console.error('RIVET_SESSION_SOURCE_ADMISSION_PROOF_FAIL',checks.filter(c=>!c.pass).map(c=>c.name));
 process.exit(1);
}
console.log('RIVET_SESSION_SOURCE_ADMISSION_PROOF_PASS',checks.length+'/'+checks.length);
