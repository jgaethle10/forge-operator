/**
 * Privileged, READ-ONLY provider observation intake, not reconciliation finality.
 * An owned host must supply an audited provider adapter, managed Ed25519 signer,
 * scoped trusted observer keys, and credentialed READ credentials.
 *
 * The library can authenticate an observer's claim and bind a returned record
 * to an interrupted attempt. It CANNOT prove the adapter really used GET, that
 * credentials were provisioned, or that the upstream provider offers finality.
 */
import {createHash,createPrivateKey,createPublicKey,sign} from 'node:crypto';
import {readGoalState,mutateGoalState} from './goal-store.mjs';
import {providerObservationMessage,recordProviderRecoveryObservation} from './goal-provider-observation.mjs';

const MAX_EVIDENCE_BYTES=65536;
const clean=x=>String(x??'').trim();
const exact=(obj,keys)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&
 Object.keys(obj).sort().join(',')===[...keys].sort().join(',');
function canonical(value,depth=0){
 if(depth>12)throw Error('provider evidence exceeds maximum depth');
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'&&Number.isFinite(value))return value;
 if(Array.isArray(value))return value.map(v=>canonical(v,depth+1));
 if(typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype){
  throw Error('provider evidence must be plain JSON');
 }
 const keys=Object.keys(value).sort();
 if(keys.some(k=>k==='__proto__'||k==='constructor'||k==='prototype'))
  throw Error('provider evidence contains prohibited key');
 return Object.fromEntries(keys.map(k=>[k,canonical(value[k],depth+1)]));
}
function evidenceHash(record){
 const data=Buffer.from(JSON.stringify(canonical(record)),'utf8');
 if(data.length>MAX_EVIDENCE_BYTES)throw Error('provider evidence exceeds size limit');
 return 'sha256:'+createHash('sha256').update(data).digest('hex');
}
function assertQuarantined(state,workKey,attempt,providerKey){
 const task=state?.tasks?.find(t=>t.work_key===workKey);
 if(!task||task.status!=='blocked'||!task.recovery_hold||
    task.recovery_hold.schema!=='evercraft.systemia.interrupted-attempt-hold.v1')
  throw Error('matching interrupted recovery hold required');
 if(!Number.isSafeInteger(attempt)||attempt<1||task.attempt!==attempt||
    task.recovery_hold.attempt!==attempt||!clean(task.attempt_key)||
    task.recovery_hold.attempt_key!==task.attempt_key)
  throw Error('recovery refetch attempt mismatch');
 if(!providerKey||task.provider_key!==providerKey||
    task.attempt_provider_key!==providerKey)
  throw Error('provider refetch identity mismatch');
 if(task.recovery_hold.reconciliation)throw Error('recovery observation already recorded');
 return task;
}
function assertSigner({trustedObservers,keyId,providerKey,privateKey}){
 if(!keyId||!Object.hasOwn(trustedObservers,keyId))
  throw Error('trusted provider observer missing');
 const trust=trustedObservers[keyId];
 if(!trust||trust.provider_key!==providerKey||!clean(trust.public_key_pem))
  throw Error('provider observer trust scope mismatch');
 // Managed runtimes may provide an existing KeyObject rather than PEM.
 const key=privateKey?.type==='private'?privateKey:createPrivateKey(privateKey);
 if(key.asymmetricKeyType!=='ed25519')throw Error('managed observer signer must be Ed25519');
 const pub=createPublicKey(key).export({format:'der',type:'spki'});
 const pinned=createPublicKey(trust.public_key_pem);
 if(pinned.asymmetricKeyType!=='ed25519'||!pub.equals(pinned.export({format:'der',type:'spki'})))
  throw Error('managed observer signer does not match trusted key');
 return key;
}

/**
 * No provider calls occur inside the CAS lock.
 * The signed lookup is persisted only if the exact held attempt is still live.
 */
export async function refetchAndStoreProviderObservation({
 filePath,workKey,expectedAttempt,adapter,trustedObservers={},
 observerKeyId,observerPrivateKey,now=()=>new Date(),ttlMs=300000,
}={}){
 if(!clean(filePath)||!clean(workKey))throw Error('filePath and workKey required');
 const providerKey=clean(adapter?.provider_key);
 if(!adapter||adapter.read_only!==true||typeof adapter.refetchAttempt!=='function')
  throw Error('audited read-only provider refetch adapter required');
 if(!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(providerKey))
  throw Error('valid provider identity required');
 if(!Number.isSafeInteger(ttlMs)||ttlMs<1000||ttlMs>600000)
  throw Error('provider observation validity must be between 1s and 10m');
 const keyId=clean(observerKeyId);
 // Fail BEFORE provider lookup for missing or wrong-key signer.
 const privateKey=assertSigner({
  trustedObservers,keyId,providerKey,privateKey:observerPrivateKey,
 });
 const original=await readGoalState(filePath);
 const workName=clean(workKey);
 const task=assertQuarantined(original,workName,expectedAttempt,providerKey);
 const request=Object.freeze({
  mission_key:original.mission_key,goal_key:original.goal_key,
  work_key:workName,attempt:expectedAttempt,
  attempt_key:task.attempt_key,provider_key:providerKey,
 });
 // An exception/timeout from the adapter is NOT evidence that the operation
 // failed. Leave the original hold untouched for later manual reconciliation.
 let response;
 try {
  response=await adapter.refetchAttempt(request);
 } catch {
  // Provider error bodies may contain bearer tokens, request headers or PII.
  // A failed lookup is UNKNOWN, not proof that an upstream action did not run.
  throw Error('provider refetch unavailable: outcome unknown; hold unchanged');
 }
 const responseKeys=['provider_key','attempt_key','lookup_mode',
  'outcome','upstream_receipt_ref','upstream_evidence'];
 if(!exact(response,responseKeys)||response.provider_key!==providerKey||
    response.attempt_key!==task.attempt_key||
    response.lookup_mode!=='authenticated_read_only_refetch'||
    !['completed','not_found','unknown'].includes(response.outcome)||
    !/^[A-Za-z0-9._:/-]{8,180}$/.test(response.upstream_receipt_ref))
  throw Error('upstream refetch response does not match attempt or scope');
 if(!response.upstream_evidence||typeof response.upstream_evidence!=='object'||
    Array.isArray(response.upstream_evidence))
  throw Error('bounded provider evidence required');
 // A positive completion must have a correlated upstream record, not merely
 // an adapter-reported string. This is still only observer-attested evidence.
 if(response.outcome==='completed'&&(
    response.upstream_evidence.attempt_key!==task.attempt_key||
    !/^[A-Za-z0-9._:/-]{8,180}$/.test(response.upstream_evidence.provider_record_ref)||
    response.upstream_evidence.record_state!=='completed'))
  throw Error('provider completion lacks matching upstream record');
 const digest=evidenceHash({
  provider_key:providerKey,attempt_key:task.attempt_key,
  lookup_mode:response.lookup_mode,outcome:response.outcome,
  upstream_receipt_ref:response.upstream_receipt_ref,
  upstream_evidence:response.upstream_evidence,
 });
 const observedAt=now();
 const seen=observedAt instanceof Date?observedAt:new Date(observedAt);
 if(!Number.isFinite(seen.getTime()))throw Error('valid observation time required');
 const claims={
  schema:'evercraft.systemia.provider-observation-claims.v1',
  scope:'systemia.goal.recovery.observe',
  mission_key:original.mission_key,goal_key:original.goal_key,
  work_key:workName,attempt:expectedAttempt,attempt_key:task.attempt_key,
  provider_key:providerKey,outcome:response.outcome,
  source_method:'authenticated_provider_refetch',
  upstream_receipt_ref:response.upstream_receipt_ref,
  upstream_response_sha256:digest,
  observed_at:seen.toISOString(),expires_at:new Date(seen.getTime()+ttlMs).toISOString(),
 };
 const signature=sign(null,providerObservationMessage(claims),privateKey).toString('base64');
 const envelope={
  schema:'evercraft.systemia.provider-observation-envelope.v1',
  key_id:keyId,claims,signature_base64:signature,
 };
 const mutation=await mutateGoalState(filePath,state=>recordProviderRecoveryObservation({
  state,workKey:workName,expectedAttempt,observation:envelope,
  trustedObservers,now:seen,
 }));
 return {
  schema:'evercraft.systemia.provider-refetch-collection-receipt.v1',
  mission_key:mutation.state.mission_key,goal_key:mutation.state.goal_key,
  work_key:workName,attempt:expectedAttempt,attempt_key:task.attempt_key,
  provider_key:providerKey,observer_key_id:keyId,
  upstream_receipt_ref:claims.upstream_receipt_ref,
  upstream_response_sha256:digest,
  attested_outcome:claims.outcome,observed_at:claims.observed_at,
  storage_revision:mutation.receipt.revision,
  signed_observation_persisted:true,
  independently_verified_provider_finality:false,
  external_effect_verified:false,dispatch_authorized:false,retry_authorized:false,
 };
}
