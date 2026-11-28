// Explicit owner-private continuation handoff. Does not admit, acknowledge,
// dispatch, fetch attachments, send messages, or create a new mission.
import {createHash} from 'node:crypto';
import {EvercraftPassport} from '../passport/passport.mjs';
import {EvercraftIntakeFabric} from '../intake-fabric/intake.mjs';
import {readPrivateDependencyReview} from './external-dependencies-private.mjs';
const idPattern=/^continuation:[a-f0-9]{64}$/;
const str=v=>typeof v==='string'&&v.trim().length>0&&v.length<=1000;
const sha=v=>'sha256:'+createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function buildDependencyIntakeCandidate({candidate,adapterActorRef,receivedAt}={}){
 if(!/^adapter:[a-z0-9-]{3,72}$/.test(adapterActorRef||'')||
    !Number.isFinite(Date.parse(receivedAt)))throw Error('adapter_or_time_invalid');
 if(!candidate||!idPattern.test(candidate.continuation_id||'')||candidate.disposition!=='admission_review_required'||
    !['request_id','mission_ref','owner_ref','intent_snapshot_ref','continuation_plan_ref','artifact_ref','evidence_ref'].every(k=>str(candidate[k]))||
    (candidate.remaining_scope_ref!=null&&!str(candidate.remaining_scope_ref)))
  throw Error('continuation_binding_invalid');
 const binding={continuation_id:candidate.continuation_id,request_id:candidate.request_id,
  mission_ref:candidate.mission_ref,owner_ref:candidate.owner_ref,intent_snapshot_ref:candidate.intent_snapshot_ref,
  continuation_plan_ref:candidate.continuation_plan_ref,artifact_ref:candidate.artifact_ref,
  evidence_ref:candidate.evidence_ref,remaining_scope_ref:candidate.remaining_scope_ref??null};
 return {binding,input:{idempotency_key:'crm:'+binding.continuation_id,
  adapter_actor_ref:adapterActorRef,source_type:'agent',source_ref:'systemia:crm-external-dependencies',
  external_event_id:binding.continuation_id,source_trust_state:'untrusted_external',
  content_ref:'private:crm:'+binding.continuation_id,content_fingerprint:sha(binding),
  intent_excerpt:'Recover the original research intent from a delayed external response. Verify private artifact custody, context and mission binding before separate admission.',
  requested_capability_hints:['crm-continuity','research-evidence-review'],claimed_priority:'normal',
  // All external content requires separately authorized custody/safety review.
  adapter_risk_flags:['active_content_suspected'],attachments:[],
  received_at:new Date(receivedAt).toISOString()}};
}
export function offerDependencyContinuation({enabled=false,root,outDir,now=new Date(),continuationId,
 intakeStateDir,passportStateDir,adapterActorRef}={}){
 if(!enabled)throw Error('continuation_adapter_disabled');
 if(!idPattern.test(continuationId||'')||!intakeStateDir||!passportStateDir)throw Error('private_intake_configuration_required');
 const review=readPrivateDependencyReview({enabled,root,outDir,now});
 if(review.status!=='private_review_ready')throw Error('private_review_not_ready');
 const matches=review.projection.candidates.filter(x=>x.continuation_id===continuationId);
 if(matches.length!==1)throw Error('continuation_missing_or_already_reviewed');
 const {binding,input}=buildDependencyIntakeCandidate({candidate:matches[0],adapterActorRef,receivedAt:new Date(now).toISOString()});
 // Intake's duplicate-by-operation path precedes its own authorization check.
 // Explicit fresh Passport preflight is therefore required even on retry.
 const passport=new EvercraftPassport({stateDir:passportStateDir});
 const auth=passport.authorize({subject_ref:adapterActorRef,product:'evercraft-intake',scope:'intake.write.agent',at:input.received_at});
 if(auth.decision!=='allow')throw Error('intake_adapter_not_authorized');
 const intake=new EvercraftIntakeFabric({stateDir:intakeStateDir,passportStateDir});
 const result=intake.ingest(input),c=result.candidate;
 if(!c||c.content_fingerprint!==input.content_fingerprint||c.external_event_id!==input.external_event_id||
    c.source_ref!==input.source_ref||c.execution_authority_granted!==false||
    c.external_side_effects_authorized!==false||c.quarantine_required!==true)
  throw Error('intake_binding_conflict_review_required');
 return {schema:'evercraft.crm.continuation-intake-receipt.v1',state:result.state,
  continuation_id:binding.continuation_id,mission_ref:binding.mission_ref,
  candidate_id:c.candidate_id,intake_receipt_ref:result.receipt?.receipt_hash??null,
  original_context_binding:input.content_fingerprint,admission_granted:false,
  execution_authorized:false,acknowledgment_recorded:false};
}
