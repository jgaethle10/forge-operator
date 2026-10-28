/**
 * Authority-backed review for an otherwise ambiguous Saban retry.
 *
 * This adapter only READS an independently minted, single-use and CONSUMED
 * Passport permit. It does not issue grants, mint or consume permits,
 * dispatch work, or authorize real physical compute.
 */
import {createHash} from 'node:crypto';
import {EvercraftPassport} from '../passport/passport.mjs';

const DIGEST=/^sha256:[a-f0-9]{64}$/;
const REF=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,190}$/;

export const SABAN_RETRY_PRODUCT='saban';
export const SABAN_RETRY_SCOPE='job.retry.review';

function assertRef(v,name) {
  if (typeof v!=='string'||!REF.test(v))throw Error('saban_retry_'+name+'_invalid');
  return v;
}

/**
 * This fingerprint is constructed *before* the permit is minted, so the
 * permit binds exactly one job, its immutable work and the attempt number.
 * Evidence must be supplied from a trusted independent action review.
 */
export function fingerprintFencedRetry({jobKey,workDigest,attemptNumber,evidenceRef}={}) {
  const job=assertRef(jobKey,'job_key');
  const evidence=assertRef(evidenceRef,'evidence_ref');
  if(typeof workDigest!=='string'||!DIGEST.test(workDigest))throw Error('saban_retry_work_digest_invalid');
  if(!Number.isSafeInteger(attemptNumber)||attemptNumber<1||attemptNumber>16)
    throw Error('saban_retry_attempt_invalid');
  const body={
    schema:'evercraft.saban.retry-review-request.v1',
    job_key:job,
    work_digest:workDigest,
    attempt_number:attemptNumber,
    evidence_ref:evidence
  };
  return 'sha256:'+createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

export function makePassportRetryAuthorizer({passportStateDir}={}) {
  if(!passportStateDir)throw Error('saban_retry_passport_state_required');
  // Passport is the sole grant/permit authority. Do not accept caller-supplied
  // status objects or arbitrary review booleans as authorization.
  return ({job_key,work_digest,attempt_number,approval_ref,evidence_ref,at,authorization})=>{
    const denied={decision:'deny',authority_proven:false};
    const permitId=authorization?.permit_id;
    if(!permitId||permitId!==approval_ref||!REF.test(permitId))return denied;
    let state;
    try {
      const passport=new EvercraftPassport({stateDir:passportStateDir});
      state=passport.getActionPermitState(permitId,{at});
    } catch {return denied;}
    const expected=fingerprintFencedRetry({
      jobKey:job_key,workDigest:work_digest,
      attemptNumber:attempt_number,evidenceRef:evidence_ref
    });
    if(state?.schema!=='evercraft.passport.action-permit-state.v1' ||
       state.product!==SABAN_RETRY_PRODUCT ||
       state.scope!==SABAN_RETRY_SCOPE ||
       state.resource_ref!==job_key ||
       state.request_fingerprint!==expected ||
       state.consumed!==true || state.cancelled!==false ||
       state.expired!==false || state.grant_active!==true ||
       typeof state.consumption_receipt!=='string' ||
       !DIGEST.test(state.consumption_receipt)) return denied;
    return {
      decision:'allow',
      authority_proven:true,
      verified_receipt_ref:state.consumption_receipt
    };
  };
}
