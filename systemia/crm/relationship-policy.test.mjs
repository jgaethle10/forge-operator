import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateRelationshipRecord,preflightRelationshipIntent,preflightGovernedContact,readPrivateRelationships,projectRelationshipReview} from './relationship-policy.mjs';
import {buildCrmHeartbeat} from './heartbeat.mjs';

const now=new Date('2026-10-18T07:00:00Z');
function record(patch={}){
  return {schema:'evercraft.crm.relationship.v1',relationship_ref:'private:engagement-one',
    subject_ref:'private:contact-one',division_id:'evercraft-home',
    stage:'interested_meeting_discussion',kind:'partner',outbound_policy:'manual_review_only',
    allowed_purposes:['meeting_scheduling'],not_before:'2026-10-01T07:00:00Z',
    next_review_at:'2026-10-01T07:00:00Z',source_ref:'mail:thread-private',
    observed_at:'2026-09-17T00:53:26Z',
    timeline:[{event_ref:'event:one',type:'contact_window_acknowledged',
      evidence_ref:'mail:private:one',occurred_at:'2026-09-17T00:53:26Z'}],
    ...patch};
}
function ledger(...records){return {schema:'evercraft.crm.relationship-ledger.v1',tenant_id:'evercraft',revision:'r42',records};}
test('after September is eligible for review, never automated contact',()=>{
  const l=ledger(record());
  const result=preflightRelationshipIntent({ledger:l,subjectRef:'private:contact-one',divisionId:'evercraft-home',purpose:'meeting_scheduling',at:now});
  assert.equal(result.decision,'deny');
  assert.deepEqual(result.reasons,['relationship_human_review_required']);
  assert.equal(result.send_performed,false);
  const before=preflightRelationshipIntent({ledger:l,subjectRef:'private:contact-one',divisionId:'evercraft-home',purpose:'meeting_scheduling',at:'2026-09-29T20:00:00Z'});
  assert.ok(before.reasons.includes('relationship_contact_window_not_open'));
  const view=projectRelationshipReview(l,{now});
  assert.equal(view.signals.length,1);
  assert.equal(buildCrmHeartbeat(view,{now}).snapshot.counts.admitted,0);
  const publicView=JSON.stringify(buildCrmHeartbeat(view,{now}));
  for(const privateString of ['private:contact-one','private:engagement-one','mail:private:one'])assert.equal(publicView.includes(privateString),false);
});
test('existing operational relationship never becomes prospect blast',()=>{
  const l=ledger(record({division_id:'rivet',stage:'active_account_work',
    kind:'customer',outbound_policy:'manual_review_only',
    allowed_purposes:['contract_delivery','billing_reconciliation']}));
  const b=preflightRelationshipIntent({ledger:l,subjectRef:'private:contact-one',divisionId:'rivet',purpose:'marketing_upsell',at:now});
  assert.equal(b.decision,'deny');
  assert.ok(b.reasons.includes('relationship_human_review_required'));
  assert.ok(b.reasons.includes('relationship_purpose_not_approved'));
  const other=preflightRelationshipIntent({ledger:l,subjectRef:'private:contact-one',divisionId:'evercraft-home',purpose:'meeting_scheduling',at:now});
  assert.ok(other.reasons.includes('relationship_missing'));
});
test('specific approved purpose still requires Passport/Interaction Ledger checks',()=>{
  const l=ledger(record({outbound_policy:'preflight_eligible',not_before:'2026-10-01T00:00:00Z'}));
  const pre=preflightRelationshipIntent({ledger:l,subjectRef:'private:contact-one',divisionId:'evercraft-home',purpose:'meeting_scheduling',at:now});
  assert.equal(pre.decision,'allow_to_existing_preflight');
  const without=preflightGovernedContact({ledger:l,input:{subject_ref:'private:contact-one',division_id:'evercraft-home',purpose:'meeting_scheduling'},now});
  assert.equal(without.decision,'deny');assert.ok(without.reasons.includes('interaction_ledger_unavailable'));
  let calls=0;
  const withLedger=preflightGovernedContact({ledger:l,input:{subject_ref:'private:contact-one',division_id:'evercraft-home',purpose:'meeting_scheduling'},now,
    interactionLedger:{preflightContact(input){calls++;assert.equal(input.at,now.toISOString());return {decision:'deny',reasons:['passport_contact_scope_missing']};}}});
  assert.equal(withLedger.decision,'deny');assert.equal(calls,1);
  assert.equal(withLedger.send_performed,false);
});
test('pause, ambiguity, and no-contact requests all fail closed',()=>{
  const p=ledger(record({outbound_policy:'paused'}));
  assert.ok(preflightRelationshipIntent({ledger:p,subjectRef:'private:contact-one',divisionId:'evercraft-home',purpose:'meeting_scheduling',at:now}).reasons.includes('relationship_contact_paused'));
  const dup=ledger(record(),record({relationship_ref:'private:engagement-two'}));
  assert.ok(preflightRelationshipIntent({ledger:dup,subjectRef:'private:contact-one',divisionId:'evercraft-home',purpose:'meeting_scheduling',at:now}).reasons.includes('relationship_ambiguous'));
  const opt=ledger(record({outbound_policy:'preflight_eligible',timeline:[{event_ref:'event:2',type:'no_contact_requested',evidence_ref:'mail:private:2',occurred_at:'2026-10-01T12:00:00Z'}]}));
  assert.ok(preflightRelationshipIntent({ledger:opt,subjectRef:'private:contact-one',divisionId:'evercraft-home',purpose:'meeting_scheduling',at:now}).reasons.includes('relationship_optout_requires_review'));
});
test('private record loader needs protected file and rejects malformed timeline',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-relationship-'));
  const file=path.join(root,'relationships.json');
  fs.chmodSync(root,0o700);
  try{
    fs.writeFileSync(file,JSON.stringify(ledger(record())),{mode:0o600});
    const loaded=readPrivateRelationships(file,{now});
    assert.equal(loaded.records.length,1);
    fs.chmodSync(file,0o644);
    assert.throws(()=>readPrivateRelationships(file,{now}),/unsafe/);
    const invalid=record({timeline:[{event_ref:'event:a',type:'relationship_changed',occurred_at:'2026-01-01T00:00:00Z'}]});
    assert.throws(()=>validateRelationshipRecord(invalid,{now}),/evidence_ref_invalid/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('completed review disappears only with dated supporting evidence',()=>{
 const completed=record({next_action_state:'completed',
 next_action_decided_at:'2026-10-19T10:00:00Z',next_action_evidence_ref:'internal:review-resolution'});
 const recordSet=ledger(completed);
 const signal=projectRelationshipReview(recordSet,{now:new Date('2026-10-21T20:00:00Z')});
 assert.equal(signal.signals.length,0);
 assert.throws(()=>validateRelationshipRecord(record({next_action_state:'completed'}),{now:new Date('2026-10-21T20:00:00Z')}),/next_action_evidence_ref_invalid/);
 assert.throws(()=>validateRelationshipRecord(record({next_action_state:'completed',next_action_evidence_ref:'internal:resolved'}),{now:new Date('2026-10-21T20:00:00Z')}),/next_action_decided_at_invalid/);
});
