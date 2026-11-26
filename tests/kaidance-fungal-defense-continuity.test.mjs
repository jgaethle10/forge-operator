// FUNGAL-DEFENSE-001 source-to-Kaidance continuity integration proof.
// Synthetic authorized-source fixtures only. Not a private registry export,
// a live Systemia admission or an actual research execution receipt.
import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileResearchExport} from '../systemia/organism/kaidance-rd-continuity.mjs';

const missionId='FUNGAL-DEFENSE-001';
const now=new Date('2026-11-25T23:30:00Z');
const seed={
 schema:'evercraft.systemia.rd-continuity-export.v1',
 scope:'all_rd',coverage_complete:true,
 exported_at:now.toISOString(),
 priority_mission_ids:[missionId],
 missions:[]
};
const sourceCandidate={
 mission_id:missionId,admission_state:'proposed',
 visibility:'internal_only',disposition:'active',
 owner:'UNVERIFIED_PRIVATE_OWNER',
 receipt_sla_seconds:86400,
 next_action:{description:'Privately reconcile authoritative registry and reviewed source packet',
  due_at:'2026-11-26T18:00:00Z'},
 last_work_receipt:null
};
const admitted={...sourceCandidate,admission_state:'admitted'};

test('source packet alone cannot admit Fungal Defense into Systemia',()=>{
 const absent=reconcileResearchExport(seed,now);
 assert.equal(absent.status,'no_admitted_rows_unverified');
 assert.equal(absent.coverage_verified,false);
 assert.equal(absent.verified_research_artifacts,0);
 const proposed=reconcileResearchExport({...seed,missions:[sourceCandidate]},now);
 assert.equal(proposed.status,'no_admitted_rows_unverified');
 assert.equal(proposed.execution_authorized,false);
 assert.equal(proposed.publication_authorized,false);
 assert.equal(proposed.missions,null);
});

test('admitted-but-unexecuted Fungal Defense remains attention/hold, not false progress',()=>{
 const result=reconcileResearchExport({...seed,missions:[admitted]},now);
 assert.equal(result.status,'review_required');
 assert.equal(result.counts.reported_admitted,1);
 assert.equal(result.counts.attention,1);
 assert.equal(result.verified_research_artifacts,0);
 assert.equal(result.worker_launches,0);
 assert.equal(result.publication_authorized,false);
 assert.equal(result.execution_authorized,false);
 assert.ok(result.missions[0].problems.includes('work_receipt_missing_or_invalid'));
 assert.ok(result.missions[0].problems.includes('goal_receipt_readback_unverified'));
 assert.equal(result.missions[0].priority,true);
 assert.doesNotMatch(JSON.stringify(result),/FUNGAL-DEFENSE-001|UNVERIFIED_PRIVATE_OWNER/);
});

test('five-minute reconciliation does not invent experiment or code execution receipts',()=>{
 const next=new Date(+now+300000);
 const result=reconcileResearchExport({...seed,exported_at:next.toISOString(),missions:[admitted]},next);
 assert.equal(result.status,'review_required');
 assert.equal(result.verified_research_artifacts,0);
 assert.equal(result.worker_launches,0);
 assert.ok(result.missions[0].problems.includes('work_receipt_missing_or_invalid'));
});

test('reported source receipt without matching durable goal checkpoint is not work proof',()=>{
 const report={...admitted,last_work_receipt:{
  ref:'source:github:review-2026-11-15',observed_at:'2026-11-25T23:00:00Z'
 }};
 const result=reconcileResearchExport({...seed,missions:[report]},now);
 assert.equal(result.status,'review_required');
 assert.equal(result.counts.goal_checkpoints_matched,0);
 assert.equal(result.verified_research_artifacts,0);
 assert.ok(result.missions[0].problems.includes('goal_receipt_readback_unverified'));
});

test('paused Fungal Defense mission respects owner decision and does not dispatch',()=>{
 const paused={...admitted,disposition:'paused',disposition_reason:'await expert medical review'};
 const result=reconcileResearchExport({...seed,missions:[paused]},now);
 assert.equal(result.status,'reported_receipts_reconciled');
 assert.equal(result.missions[0].disposition,'paused');
 assert.equal(result.counts.attention,0);
 assert.equal(result.verified_research_artifacts,0);
 assert.equal(result.execution_authorized,false);
});

test('duplicate Fungal Defense records fail closed instead of starting parallel tracks',()=>{
 const result=reconcileResearchExport({...seed,missions:[admitted,admitted]},now);
 assert.equal(result.status,'invalid_or_duplicate_mission');
 assert.equal(result.missions,null);
 assert.equal(result.worker_launches,0);
});
