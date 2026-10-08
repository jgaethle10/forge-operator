/**
 * Signed observation of an interrupted attempt, never execution or replay authority.
 * The owner runtime must independently fetch provider status and sign a bounded
 * attestation. This verifier cannot prove a provider was really contacted: it
 * authenticates who attested, and retains the quarantined state for disposition.
 */
import {createPublicKey,verify} from 'node:crypto';
import {refreshGoal} from './goal-runtime.mjs';

const CLAIMS='evercraft.systemia.provider-observation-claims.v1';
const ENVELOPE='evercraft.systemia.provider-observation-envelope.v1';
const SCOPE='systemia.goal.recovery.observe';
const METHOD='authenticated_provider_refetch';
const MAX_TTL_MS=10*60*1000;
const CLOCK_SKEW_MS=5*60*1000;
const KEYS=[
 'schema','scope','mission_key','goal_key','work_key','attempt','attempt_key',
 'provider_key','outcome','source_method','upstream_receipt_ref',
 'upstream_response_sha256','observed_at','expires_at',
];
const exact=(obj,keys)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&
 Object.keys(obj).sort().join(',')===[...keys].sort().join(',');
const clean=x=>String(x??'').trim();
const nowMs=now=>now instanceof Date?now.getTime():new Date(now).getTime();

export function providerObservationMessage(claims){
 if(!exact(claims,KEYS))throw Error('provider observation claims shape invalid');
 return Buffer.from('evercraft.systemia.provider-observation.v1\n'+JSON.stringify(
   Object.fromEntries(KEYS.map(key=>[key,claims[key]]))
 ),'utf8');
}

export function verifyProviderRecoveryObservation({
 state,workKey,expectedAttempt,observation,trustedObservers={},now=new Date()
}={}){
 if(!state||state.schema!=='evercraft.goal.state.v1')throw Error('goal state required');
 const task=state.tasks?.find(t=>t.work_key===clean(workKey));
 if(!task)throw Error('unknown work key');
 const hold=task.recovery_hold;
 if(task.status!=='blocked'||!hold||hold.schema!=='evercraft.systemia.interrupted-attempt-hold.v1'){
  throw Error('interrupted recovery hold required');
 }
 if(!Number.isSafeInteger(expectedAttempt)||expectedAttempt<1||
    task.attempt!==expectedAttempt||hold.attempt!==expectedAttempt){
  throw Error('recovery attempt mismatch');
 }
 if(hold.reconciliation)throw Error('recovery observation already recorded');
 if(!exact(observation,['schema','key_id','claims','signature_base64'])||
  observation.schema!==ENVELOPE)throw Error('signed provider observation required');
 const claims=observation.claims;
 const message=providerObservationMessage(claims);
 if(claims.schema!==CLAIMS||claims.scope!==SCOPE||
    claims.mission_key!==state.mission_key||claims.goal_key!==state.goal_key||
    claims.work_key!==task.work_key||claims.attempt!==expectedAttempt||
    claims.attempt_key!==hold.attempt_key||claims.source_method!==METHOD){
  throw Error('provider observation attempt or scope mismatch');
 }
 // The task's chosen provider must be pinned before execution. Do not let
 // a provider signer invent or substitute a provider after the attempt crashed.
 if(!task.attempt_provider_key||task.attempt_provider_key!==task.provider_key||
    claims.provider_key!==task.attempt_provider_key){
  throw Error('provider observation does not match execution provider');
 }
 if(!['completed','not_found','unknown'].includes(claims.outcome)||
   !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(claims.provider_key)||
   !/^sha256:[0-9a-f]{64}$/.test(claims.upstream_response_sha256)||
   !/^[a-zA-Z0-9._:/-]{8,180}$/.test(claims.upstream_receipt_ref)){
  throw Error('provider observation evidence shape invalid');
 }
 const clock=nowMs(now),seen=Date.parse(claims.observed_at),
       expires=Date.parse(claims.expires_at),held=Date.parse(hold.held_at);
 if(!Number.isFinite(clock)||!Number.isFinite(seen)||!Number.isFinite(expires)||
   !Number.isFinite(held)||expires<=seen||expires-seen>MAX_TTL_MS||
   seen<held||seen>clock+CLOCK_SKEW_MS||clock>=expires){
  throw Error('provider observation expired or outside hold window');
 }
 const keyId=clean(observation.key_id);
 if(!keyId||!Object.hasOwn(trustedObservers,keyId))throw Error('trusted provider observer missing');
 const anchor=trustedObservers[keyId];
 if(!anchor||anchor.provider_key!==claims.provider_key||!clean(anchor.public_key_pem)){
  throw Error('provider observer trust scope mismatch');
 }
 const key=createPublicKey(anchor.public_key_pem);
 if(key.asymmetricKeyType!=='ed25519')throw Error('observer signing key must use Ed25519');
 const signature=clean(observation.signature_base64);
 if(!/^[a-zA-Z0-9+/]{86}==$/.test(signature))throw Error('provider observer signature encoding invalid');
 const bytes=Buffer.from(signature,'base64');
 if(bytes.length!==64||!verify(null,message,key,bytes))throw Error('provider observation signature not verified');
 return {
  schema:'evercraft.systemia.verified-provider-observation.v1',
  signer_key_id:keyId,provider_key:claims.provider_key,
  attested_outcome:claims.outcome,observed_at:claims.observed_at,
  upstream_receipt_ref:claims.upstream_receipt_ref,
  upstream_response_sha256:claims.upstream_response_sha256,
  observer_signature_verified:true,
  external_effect_verified_by_systemia:false,
  retry_authorized:false,dispatch_authorized:false,
 };
}

export function recordProviderRecoveryObservation({
 state,workKey,expectedAttempt,observation,trustedObservers={},now=new Date()
}={}){
 const verified=verifyProviderRecoveryObservation({
  state,workKey,expectedAttempt,observation,trustedObservers,now,
 });
 const next=structuredClone(state);
 const task=next.tasks.find(t=>t.work_key===clean(workKey));
 // A signed attestation proves observer identity/claim integrity, not that
 // Systemia has independently replayed the provider lookup or can resume.
 task.recovery_hold.reconciliation=verified;
 task.recovery_hold.effect_state='unknown';
 task.recovery_hold.producer_outcome_verified=false;
 task.recovery_hold.auto_replay_allowed=false;
 task.recovery_hold.require_authoritative_reconciliation=true;
 task.last_result='signed_provider_observation_pending_disposition';
 task.blockers=[...new Set([...(task.blockers||[]),
   'interrupted_attempt_requires_operator_disposition'])];
 const timestamp=now instanceof Date?now.toISOString():new Date(now).toISOString();
 task.updated_at=timestamp;
 next.revision+=1;
 next.updated_at=timestamp;
 return refreshGoal(next,now);
}
