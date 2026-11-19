/**
 * Read-only, independently stored Passport permit admission for a *single*
 * bounded signed-MicroSeed canary execution. This module never mints grants,
 * consumes permits, or authorizes live/remote production workers.
 */
import {createHash} from 'node:crypto';
import {EvercraftPassport} from '../passport/passport.mjs';

const REF=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,190}$/;
const DIGEST=/^sha256:[a-f0-9]{64}$/;
const NONCE=/^[a-zA-Z0-9._:-]{16,256}$/;
export const FENCED_EXEC_PRODUCT='saban';
export const FENCED_EXEC_SCOPE='job.execute.readonly';

function ref(s) {
  if(typeof s!=='string'||!REF.test(s)) throw Error('fenced_execution_reference_invalid');
  return s;
}
export function fingerprintFencedMicroSeedExecution({
  jobKey,workDigest,attemptNumber=1,nodePin
}={}) {
  const key=ref(jobKey);
  if(!DIGEST.test(String(workDigest||'')))throw Error('fenced_execution_work_digest_invalid');
  if(attemptNumber!==1)throw Error('fenced_execution_single_attempt_only');
  if(!nodePin||!REF.test(String(nodePin.node_id||''))||
     !REF.test(String(nodePin.lease_id||''))||
     !DIGEST.test(String(nodePin.device_fingerprint||''))||
     !NONCE.test(String(nodePin.nonce||'')))throw Error('fenced_execution_device_pin_invalid');
  const body={
    schema:'evercraft.saban.fenced-microseed-execution-permit.v1',
    job_key:key,work_digest:workDigest,attempt_number:1,
    node_id:nodePin.node_id,
    device_fingerprint:nodePin.device_fingerprint,
    lease_id:nodePin.lease_id,
    execution_nonce:nodePin.nonce,
    side_effect_profile:'signed_localhost_content_hash_only'
  };
  return 'sha256:'+createHash('sha256').update(JSON.stringify(body)).digest('hex');
}
export function verifyFencedMicroSeedExecutionPermit({
  passportStateDir,permitId,jobKey,workDigest,nodePin,now=new Date()
}={}) {
  const denied=reason=>({
    decision:'deny',reason,passport_permit_verified:false,
    execution_authorized:false,production_execution_authorized:false
  });
  if(typeof passportStateDir!=='string'||!passportStateDir.trim()||
     !REF.test(String(permitId||'')))return denied('trusted_passport_or_permit_required');
  let expected;
  try {
    expected=fingerprintFencedMicroSeedExecution({jobKey,workDigest,nodePin});
    const passport=new EvercraftPassport({stateDir:passportStateDir});
    const state=passport.getActionPermitState(permitId,{at:now.toISOString()});
    if(state?.schema!=='evercraft.passport.action-permit-state.v1'||
       state.product!==FENCED_EXEC_PRODUCT||
       state.scope!==FENCED_EXEC_SCOPE||
       state.resource_ref!==jobKey||
       state.request_fingerprint!==expected||
       state.consumed!==true||state.cancelled!==false||
       state.expired!==false||state.grant_active!==true||
       !DIGEST.test(String(state.consumption_receipt||''))) {
      return denied('permit_binding_or_lifecycle_invalid');
    }
    return {
      schema:'evercraft.saban.fenced-execution-admission.v1',
      decision:'allow',passport_permit_verified:true,
      consumption_receipt_hash:state.consumption_receipt,
      job_key:jobKey,permit_id:permitId,
      request_fingerprint:expected,
      execution_authorized:true,
      production_execution_authorized:false,
      physical_field_device_verified:false,
      yard_authorized:false,
      systemia_durable_mission_verified:false,
      customer_delivery_verified:false
    };
  } catch {return denied('passport_integrity_or_authority_unavailable');}
}
