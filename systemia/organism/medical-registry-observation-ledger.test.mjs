#!/usr/bin/env node
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
 observationFromRegistry,compareRegistryObservations,updateRegistryObservationLedger,
 renderRegistryHistoryHTML,renderRegistryHistoryMarkdown,writeRegistryObservationLedger
} from './medical-registry-observation-ledger.mjs';

const t1=new Date('2026-11-16T18:00:00Z'),t2=new Date('2026-11-16T21:00:00Z');
const raw=(id='NCT12345678',primary='Primary outcome time score')=>({
 nct_id:id,metadata_identity:'NCT_identifier_matches_registry_record',
 protocol_outcomes_status:'observed_current_registry',
 protocol_primary_outcomes:[{type:'PRIMARY',measure:primary,time_frame:'12 weeks',description:'Pre-specified endpoint'}],
 protocol_secondary_outcomes:[],overall_status:'COMPLETED',registry_results_posted:false,
 last_update_posted:'2026-11-15'
});
const registry=(record)=>({
 source_status:'source_bound',receipt_hash:'sha256:registry-fixture',
 checks:[{nct_id:record.nct_id,check_status:'registry_identifier_confirmed',record}]
});
test('first Evercraft capture is NOT historical preregistration',()=>{
 const r=updateRegistryObservationLedger({registry:registry(raw()),now:t1});
 assert.equal(r.report.status,'observations_recorded_unreviewed');
 assert.equal(r.report.counts.first_captures,1);
 assert.equal(r.report.counts.observed_deltas,0);
 assert.equal(r.state.records[0].first_observed_at,t1.toISOString());
 assert.equal(r.report.events[0].historical_preregistration_verified,false);
 assert.equal(r.report.counts.independently_verified_amendments,0);
 assert.equal(r.report.counts.verified_outcome_switches,0);
});
test('unchanged current response is not called an observed change',()=>{
 const initial=updateRegistryObservationLedger({registry:registry(raw()),now:t1});
 const next=updateRegistryObservationLedger({registry:registry(raw()),previous:initial.state,now:t2});
 assert.equal(next.report.counts.first_captures,0);
 assert.equal(next.report.counts.unchanged_observations,1);
 assert.equal(next.report.counts.observed_deltas,0);
 assert.equal(next.state.records[0].first_observed_at,t1.toISOString());
 assert.equal(next.state.records[0].observation_count,2);
});
test('actual changed primary outcome text is logged with both source snapshots',()=>{
 const initial=updateRegistryObservationLedger({registry:registry(raw()),now:t1});
 const revised=raw('NCT12345678','<strong>Different outcome measure</strong>');
 const next=updateRegistryObservationLedger({
  registry:registry(revised),previous:initial.state,now:t2
 });
 assert.equal(next.report.counts.observed_deltas,1);
 assert.equal(next.state.records[0].last_snapshot.primary_outcomes[0].measure,'<strong>Different outcome measure</strong>');
 const change=next.state.records[0].observed_changes[0];
 assert.deepEqual(change.differences.map(x=>x.field),['primary_outcomes']);
 assert.equal(change.prior_evercraft_observed_at,t1.toISOString());
 assert.equal(change.verified_registry_amendment,false);
 assert.equal(next.report.counts.verified_outcome_switches,0);
 const html=renderRegistryHistoryHTML(next.report);
 assert.doesNotMatch(html,/<strong>Different outcome measure<\/strong>/);
 assert.match(renderRegistryHistoryMarkdown(next.report),/historical versions/);
});
test('source outages, absent IDs and missing outcomes do not remove or change prior evidence',()=>{
 const initial=updateRegistryObservationLedger({registry:registry(raw()),now:t1});
 const error=updateRegistryObservationLedger({registry:null,previous:initial.state,now:t2});
 assert.equal(error.report.status,'source_hold_preserving_history');
 assert.equal(error.state.records.length,1);
 assert.equal(error.state.records[0].last_snapshot.snapshot_digest,initial.state.records[0].last_snapshot.snapshot_digest);
 const disappeared=updateRegistryObservationLedger({
  registry:{source_status:'source_bound',receipt_hash:'sha256:new',checks:[]},
  previous:initial.state,now:t2
 });
 assert.equal(disappeared.report.counts.observed_deltas,0);
 assert.equal(disappeared.report.counts.ledger_records,1);
 const missing={...raw(),protocol_outcomes_status:'module_unavailable'};
 const held=updateRegistryObservationLedger({registry:registry(missing),previous:initial.state,now:t2});
 assert.equal(held.report.counts.held_observations,1);
 assert.equal(held.state.records[0].last_snapshot.snapshot_digest,initial.state.records[0].last_snapshot.snapshot_digest);
});
test('duplicate identifiers do not duplicate observations; capacity is conservative',()=>{
 const a=registry(raw());
 a.checks.push({...a.checks[0]});
 const run=updateRegistryObservationLedger({registry:a,now:t1});
 assert.equal(run.report.counts.first_captures,1);
 const other=registry(raw('NCT87654321'));
 const capped=updateRegistryObservationLedger({registry:other,previous:run.state,now:t2,maxRecords:1});
 assert.equal(capped.report.counts.capacity_holds,1);
 assert.equal(capped.report.counts.ledger_records,1);
});
test('invalid existing state stops writes and never invents a fresh first seen',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-history-corrupt-'));
 try{
  const original='{this was persisted but invalid';
  fs.writeFileSync(path.join(dir,'state.json'),original);
  const r=writeRegistryObservationLedger({registry:registry(raw()),now:t1,outDir:dir});
  assert.equal(r.status,'invalid_prior_ledger_hold');
  assert.equal(r.counts.first_captures,0);
  assert.equal(fs.readFileSync(path.join(dir,'state.json'),'utf8'),original);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('independent runs preserve first capture and archive a bounded timeline',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-history-valid-'));
 try{
  const a=writeRegistryObservationLedger({registry:registry(raw()),now:t1,outDir:dir});
  const b=writeRegistryObservationLedger({registry:registry(raw('NCT12345678','New endpoint')),now:t2,outDir:dir});
  assert.equal(a.counts.first_captures,1);
  assert.equal(b.counts.observed_deltas,1);
  const state=JSON.parse(fs.readFileSync(path.join(dir,'state.json'),'utf8'));
  assert.equal(state.records[0].first_observed_at,t1.toISOString());
  assert.equal(state.records[0].observed_changes.length,1);
  for(const file of ['latest.json','review.md','index.html','state.json'])
   assert.ok(fs.statSync(path.join(dir,file)).size>180,file);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
