#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file=new URL('./nyc-plugnyc-2026-09-production-reconciliation.json',import.meta.url);
const r=JSON.parse(readFileSync(file,'utf8'));
const checks=[];
function requireTrue(name,ok){checks.push(name);assert.ok(ok,name);console.log('PASS',name)}
const p=r.production_records,w=r.observed_window,e=r.edits,v=r.live_readback,gate=r.activation_gates;
requireTrue('observed_september_coverage_is_partial',w.coverage_state==='partial_publisher_lag_or_current_month'&&w.calendar_month_complete===false);
requireTrue('published_window_is_eight_days',w.days===8&&w.end_exclusive==='2026-09-09T00:00:00.000Z'&&w.start_inclusive==='2026-09-01T00:00:00.000Z');
requireTrue('observed_source_rows_reconcile',p.valid_observed_sessions+p.excluded_invalid_or_aborted_source_rows===p.source_rows);
requireTrue('observed_source_values_are_specific',p.valid_observed_sessions===954&&p.energy_kwh===20531.092);
requireTrue('all_46_station_keys_retained',p.record_count===46&&p.distinct_station_ids===46);
requireTrue('facility_group_count_not_equated_to_ports',p.facility_label_count===10&&p.facility_label_count<p.distinct_station_ids);
requireTrue('all_stations_have_facility_anchors',p.geolocated_records===46&&e.exact_facility_geo_join_records+e.previous_geo_rows_preserved===46);
requireTrue('source_activity_not_inflated',e.inserted_new_session_aggregates===0&&e.existing_rows_repaired===46);
requireTrue('source_observation_watermark_retained',e.derived_metrics_publisher_watermark==='2026-09-08T00:00:00.000Z');
requireTrue('spatial_precision_cannot_be_upgraded_to_charger_gps',e.spatial_precision==='facility_anchor_not_exact_physical_charger');
requireTrue('production_audit_complete',v.rows_verified===46&&v.missing_required_fields===0&&v.counts_unchanged_after_repair);
requireTrue('no_hourly_cron_proof_invented',gate.base44_hourly_cron_fired_and_receipt_verified===false);
requireTrue('no_new_customer_report_claimed',gate.new_partner_facing_rivet_report_generated_from_repaired_rows_verified===false);
requireTrue('nonoverlap_rule_present',r.non_overlap_policy.some(x=>x.includes('never add 954')));
console.log('RIVET_NYC_PRODUCTION_RECONCILIATION_PROOF_PASS',checks.length+'/'+checks.length);
