// Inert research metadata only; no registry, timer, execution, or publishing.
import {createHash} from 'node:crypto';
import {EvercraftIntakeFabric} from '../intake-fabric/intake.mjs';
import {EvercraftPassport} from '../passport/passport.mjs';
import {assessRecovery} from './screen.mjs';
const hash=s=>'sha256:'+createHash('sha256').update(s).digest('hex');
const HEX=/^sha256:[a-f0-9]{64}$/;
const ACTOR=/^adapter:[a-z0-9][a-z0-9-]{2,71}$/;
export function buildRecoveryCandidate({record,sourceDigest,revision,dossierKey,adapterActorRef,at}={}){
 if(!HEX.test(sourceDigest||'')||!Number.isSafeInteger(revision)||revision<1||
    typeof dossierKey!=='string'||!/^dossier:[a-z0-9-]{1,80}$/.test(dossierKey)||
    !ACTOR.test(adapterActorRef||'')||!Number.isFinite(Date.parse(at||'')))
   throw Error('recovery_source_binding_invalid');
 const result=assessRecovery(record);
 if(!/^[a-z0-9-]{1,80}$/.test(result.id)||result.sourceCount<1)
   throw Error('recovery_record_evidence_required');
 // The digest is a caller-supplied custody reference, NOT verified evidence.
 // Bind exact serialized record and dossier reference; no caller prose enters intake.
 const recordDigest=hash(JSON.stringify(record));
 const fingerprint=hash(JSON.stringify([result.id,revision,dossierKey,sourceDigest,recordDigest]));
 const key='circular-recovery:'+result.id+':'+revision;
 return {idempotency_key:key,external_event_id:key,adapter_actor_ref:adapterActorRef,
  source_type:'agent',source_ref:'systemia:circular-recovery',
  source_trust_state:'untrusted_external',content_ref:'private:circular-recovery:'+fingerprint.slice(7),
  content_fingerprint:fingerprint,received_at:new Date(at).toISOString(),
  intent_excerpt:'Circular recovery evidence review; no execution or commercial authorization.',
  requested_capability_hints:['towi-research','circular-recovery-research'],claimed_priority:'normal',attachments:[]};
}
export function stageRecoveryResearch({intakeStateDir,passportStateDir,...input}={}){
 if(!intakeStateDir||!passportStateDir)throw Error('owner_state_required');
 const candidate=buildRecoveryCandidate(input);
 const passport=new EvercraftPassport({stateDir:passportStateDir});
 // Intake resolves idempotency duplicates before its own authorization check.
 if(passport.authorize({subject_ref:candidate.adapter_actor_ref,product:'evercraft-intake',
  scope:'intake.write.agent',at:candidate.received_at}).decision!=='allow')
   throw Error('recovery_intake_adapter_not_authorized');
 const intake=new EvercraftIntakeFabric({stateDir:intakeStateDir,passportStateDir});
 const result=intake.ingest(candidate);
 const saved=result.candidate;
 if(saved?.content_fingerprint!==candidate.content_fingerprint||
    saved?.idempotency_key!==candidate.idempotency_key||saved?.source_ref!==candidate.source_ref||
    saved?.adapter_actor_ref!==candidate.adapter_actor_ref||
    saved?.execution_authority_granted!==false||saved?.external_side_effects_authorized!==false||
    !HEX.test(result.receipt?.receipt_hash||''))throw Error('recovery_intake_binding_conflict');
 return {schema:'evercraft.circular-recovery.intake-receipt.v0',state:result.state,
  candidateId:saved.candidate_id,receiptHash:result.receipt.receipt_hash,
  dossierVerified:false,sourceCustodyVerified:false,admissionGranted:false,executionGranted:false,
  heartbeatConnected:false};
}
