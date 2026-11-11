import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { compileEvProgramWorkpack, compileEvProgramQueue } from '../systemia/ev-opportunity/program-workpacks.mjs';

const catalog = JSON.parse(readFileSync(new URL('../systemia/ev-opportunity/programs.v1.json', import.meta.url))).programs;
const now = '2026-11-11T08:11:00-08:00';
const port = catalog.find(x=>x.id==='PORT-SEA-MC-0322998');
const cec = catalog.find(x=>x.id==='CEC-GFO-25-603');

test('official catalog compiles offline into two work packages',()=>{
  const q=compileEvProgramQueue(catalog,{now});
  assert.equal(q.count,2);
  assert.equal(q.external_actions,0);
  assert.deepEqual(q.programs.map(p=>p.program_id),[port.id,cec.id]);
});
test('Port stays held for licensed prime and controlling bid package',()=>{
  const p=compileEvProgramWorkpack(port,{now});
  assert.equal(p.deadline.at,'2026-12-03T14:00:00-08:00');
  assert.equal(p.deadline.state,'OPEN');
  assert.equal(p.package_state,'HELD');
  assert.ok(p.held_reasons.includes('qualified_licensed_prime_or_subcontract_path_missing'));
  assert.ok(p.research_gaps.includes('obtain_and_review_current_controlling_solicitation_and_addenda'));
  assert.equal(p.scope_limits.contract_award,false);
  assert.equal(p.scope_limits.proposal_submission,false);
  assert.equal(p.scope_limits.revenue_collected,false);
});
test('California application remains held pending station, eligibility and prior awards',()=>{
  const p=compileEvProgramWorkpack(cec,{now});
  assert.equal(p.deadline.at,'2026-12-11T23:59:00-08:00');
  assert.equal(p.package_state,'HELD');
  assert.ok(p.held_reasons.includes('identified_station_and_address_required'));
  assert.ok(p.held_reasons.includes('existing_or_planned_awarded_site_exclusion_unresolved'));
  assert.equal(p.scope_limits.grant_award,false);
  assert.equal(p.scope_limits.checkout,false);
});
test('previously awarded station not admitted as eligible',()=>{
  const p=compileEvProgramWorkpack(cec,{now,site:{
    station_id:'TEST',address:'Test Street CA',eligible_corridor_review:'independently_reviewed',
    prior_round_award_status:'awarded_round_2',owner_site_control:'documented',utility_verification:'utility_issued'
  }});
  assert.ok(p.held_reasons.includes('existing_or_planned_awarded_site_exclusion_unresolved'));
});
test('unverified claim of no previous award also stays held',()=>{
  const p=compileEvProgramWorkpack(cec,{now,site:{
    station_id:'TEST',address:'Test Street CA',eligible_corridor_review:'independently_reviewed',
    prior_round_award_status:'not_awarded_claimed',owner_site_control:'documented',utility_verification:'utility_issued'
  }});
  assert.ok(p.held_reasons.includes('existing_or_planned_awarded_site_exclusion_unresolved'));
});
test('California per-station preliminary layout evidence fields retained',()=>{
  const p=compileEvProgramWorkpack(cec,{now});
  for(const id of ['station_address_map','proposed_ports_ratings','ada_access','ingress_egress','utility_form']){
    assert.ok(p.evidence_requirements.some(r=>r.id===id && r.applicability==='required'));
  }
});
test('unrecognized source cannot be used to claim independent review',()=>{
  const p=compileEvProgramWorkpack(cec,{now,requirement_evidence:{
    proposed_ports_ratings:{state:'independently_reviewed',source_url:'https://unknown.example.com',reviewed_by:'reviewer',reviewed_at:now}
  }});
  assert.equal(p.evidence_requirements.find(r=>r.id==='proposed_ports_ratings').evidence_state,'applicant_asserted');
  assert.ok(p.research_gaps.includes('requirement:proposed_ports_ratings'));
});
test('review metadata is an internal signal, never public release',()=>{
  const p=compileEvProgramWorkpack(cec,{now,requirement_evidence:{
    station_address_map:{state:'independently_reviewed',source_url:cec.official_url,reviewed_by:'qualified reviewer',reviewed_at:now}
  }});
  assert.equal(p.evidence_requirements.find(r=>r.id==='station_address_map').evidence_state,'independently_reviewed');
  assert.equal(p.scope_limits.external_publication,false);
});
test('expired opportunities cannot be called open or submitted',()=>{
  const p=compileEvProgramWorkpack(port,{now:'2026-12-04T00:00:00-08:00'});
  assert.equal(p.deadline.state,'EXPIRED');
  assert.ok(p.held_reasons.includes('submission_deadline_expired'));
  assert.equal(p.scope_limits.outreach,false);
});
test('timezone-free deadline rejected',()=>{
  const x=structuredClone(cec);x.deadline.at='2026-12-11T23:59';
  assert.throws(()=>compileEvProgramWorkpack(x,{now}),/official_deadline/);
});
test('duplicate requirement IDs rejected',()=>{
  const x=structuredClone(cec);x.work_requirements.push({...x.work_requirements[0]});
  assert.throws(()=>compileEvProgramWorkpack(x,{now}),/duplicate_requirement_id/);
});
test('mixed historical asset boundary remains on hold',()=>{
  const x=structuredClone(port);x.asset_boundary='legacy_mix';
  const p=compileEvProgramWorkpack(x,{now});
  assert.ok(p.held_reasons.includes('historical_asset_boundary_unresolved'));
});
test('compiler does not mutate original catalog',()=>{
  const x=structuredClone(catalog);
  compileEvProgramQueue(catalog,{now});
  assert.deepEqual(catalog,x);
});
