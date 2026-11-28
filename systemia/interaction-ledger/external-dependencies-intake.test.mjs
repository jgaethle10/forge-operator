import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EvercraftPassport} from '../passport/passport.mjs';
import {EvercraftIntakeFabric} from '../intake-fabric/intake.mjs';
import {writePrivateDependencyExport} from './external-dependencies-export-writer.mjs';
import {readPrivateDependencyReview} from './external-dependencies-private.mjs';
import {buildDependencyIntakeCandidate,offerDependencyContinuation as offer} from './external-dependencies-intake.mjs';
const now=new Date('2026-11-27T18:00:00Z'),actor='adapter:crm-continuity';
function fixture(t){
 const p=fs.mkdtempSync(path.join(os.tmpdir(),'crm-intake-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));
 const root=path.join(p,'source'),parent=path.join(p,'state'),dir=path.join(parent,'kaidance-crm-dependencies');
 for(const d of [root,parent,dir])fs.mkdirSync(d,{mode:0o700});
 const args={root,outDir:path.join(parent,'kaidance-company-heartbeat'),now,enabled:true,
  intakeStateDir:path.join(parent,'intake'),passportStateDir:path.join(parent,'passport'),adapterActorRef:actor};
 const request={request_id:'r1',type:'public_records',subject_ref:'agency',scope_ref:'scope',state:'submitted',
  submitted_at:'2026-10-13T18:00:00Z',submission_evidence_ref:'sent',thread_ref:'thread',
  mission_ref:'mission-dormant',owner_ref:'owner',intent_snapshot_ref:'intent',continuation_plan_ref:'plan'};
 const reply={event_id:'reply',kind:'response',subject_ref:'agency',thread_ref:'thread',occurred_at:now.toISOString(),
  evidence_ref:'receipt',artifact_ref:'artifact'};
 const first=writePrivateDependencyExport({...args,expectedHash:null,requests:[request],receipts:[reply],coverage:'partial'});
 const candidate=readPrivateDependencyReview(args).projection.candidates[0];
 args.continuationId=candidate.continuation_id;
 const passport=new EvercraftPassport({stateDir:args.passportStateDir});
 function grant(subject,scopes,id){
  passport.issueGrant({grant_id:id,idempotency_key:id,subject_ref:subject,
   issuer_ref:'evercraft:identity-authority',product:'evercraft-intake',scopes,
   starts_at:'2026-11-01T00:00:00Z',ends_at:'2026-12-01T00:00:00Z',
   authority_state:'verified_identity_authority',authority_receipt_ref:'synthetic:'+id});
 }
 return {args,first,candidate,request,reply,grant};
}
test('real Passport grant required; absent or disabled adapter cannot offer',t=>{
 const {args}=fixture(t);
 assert.throws(()=>offer({...args,enabled:false}),/continuation_adapter_disabled/);
 assert.throws(()=>offer(args),/intake_adapter_not_authorized/);
});
test('actual Intake Fabric creates quarantined candidate and replay deduplicates',t=>{
 const {args,grant}=fixture(t);grant(actor,['intake.write.agent'],'adapter-grant');
 const one=offer(args),two=offer(args);
 assert.equal(one.state,'quarantined_candidate');assert.equal(two.state,'duplicate');
 assert.equal(one.candidate_id,two.candidate_id);assert.equal(one.mission_ref,'mission-dormant');
 assert.equal(one.admission_granted,false);assert.equal(one.execution_authorized,false);
 assert.equal(one.acknowledgment_recorded,false);
 assert.equal(readPrivateDependencyReview(args).projection.candidates.length,1);
 grant('systemia:admission',['intake.read','intake.admit'],'admission-grant');
 const intake=new EvercraftIntakeFabric({stateDir:args.intakeStateDir,passportStateDir:args.passportStateDir});
 const candidate=intake.getCandidate(one.candidate_id,{actor_ref:'systemia:admission',at:now.toISOString()});
 assert.equal(candidate.content_is_instruction,false);
 assert.throws(()=>intake.decideAdmission({idempotency_key:'admit',candidate_id:one.candidate_id,decision:'accept',
  actor_ref:'systemia:admission',mission_ref:'mission-dormant',decided_at:now.toISOString(),
  evidence_ref:'synthetic:review',reason:'test'}),/candidate_quarantined/);
});
test('another ungranted adapter cannot use the duplicate bypass',t=>{
 const {args,grant}=fixture(t);grant(actor,['intake.write.agent'],'adapter-grant');offer(args);
 assert.throws(()=>offer({...args,adapterActorRef:'adapter:other'}),/intake_adapter_not_authorized/);
});
test('already acknowledged or stale export blocks handoff',t=>{
 const {args,grant,first,request,reply}=fixture(t);grant(actor,['intake.write.agent'],'adapter-grant');
 assert.throws(()=>offer({...args,now:new Date(+now+900001)}),/private_review_not_ready/);
 writePrivateDependencyExport({...args,expectedHash:first.hash,requests:[request],receipts:[reply],coverage:'partial',
  acknowledgments:[{continuation_id:args.continuationId,review_evidence_ref:'review',reviewer_ref:'owner',reviewed_at:now.toISOString()}]});
 assert.throws(()=>offer(args),/continuation_missing_or_already_reviewed/);
});
test('candidate builder copies no arbitrary content and requires original context',t=>{
 const {candidate}=fixture(t);
 const result=buildDependencyIntakeCandidate({candidate:{...candidate,body:'UNTRUSTED BODY'},adapterActorRef:actor,receivedAt:now.toISOString()});
 assert.ok(!JSON.stringify(result).includes('UNTRUSTED BODY'));
 assert.equal(result.input.source_trust_state,'untrusted_external');
 assert.throws(()=>buildDependencyIntakeCandidate({candidate:{...candidate,mission_ref:null},adapterActorRef:actor,receivedAt:now.toISOString()}),/continuation_binding_invalid/);
});
