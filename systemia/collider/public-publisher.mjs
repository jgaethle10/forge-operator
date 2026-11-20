// Legacy unsigned KAIDANCE public writer is retired and intentionally fail-closed.
// Keep the useful private field-readiness verifier; use the independently signed
// systemia/leiland/owned-pulse-publisher.mjs for ALL public file publication.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {projectPublicKaidancePulse} from './public-projection.mjs';

function instant(value,label){
 if(typeof value!=='string')throw Error(label+'_missing');
 const parsed=Date.parse(value);
 if(!Number.isFinite(parsed))throw Error(label+'_invalid');
 return parsed;
}
export function verifyPrivatePulseForPublication(pulse,{now=new Date()}={}){
 if(!pulse||pulse.schema!=='evercraft.kaidance.pulse.v1')throw Error('safe_pulse_required');
 if(pulse.resident!==true||pulse.state!=='healthy')throw Error('collider_not_resident_and_healthy');
 if(pulse.coverage_receipt_valid!==true)throw Error('coverage_receipt_unverified');
 if(pulse.field_attestation?.state!=='verified'||!pulse.field_attestation?.receipt)throw Error('field_attestation_not_verified');
 if(!Number.isSafeInteger(pulse.cycle_number)||pulse.cycle_number<1)throw Error('no_completed_cycle');
 const nowMs=now.getTime();
 const observed=instant(pulse.observed_at,'observation_time');
 const completed=instant(pulse.last_completed_cycle,'completed_cycle_time');
 const heartbeat=Number(pulse.heartbeat_target_seconds);
 if(!Number.isSafeInteger(heartbeat)||heartbeat!==300)throw Error('heartbeat_contract_unexpected');
 if(observed>nowMs+60_000||observed<nowMs-120_000)throw Error('observation_stale');
 if(completed>nowMs+60_000||completed<nowMs-(heartbeat*1000+90_000))throw Error('cycle_stale');
 if(completed>observed+60_000)throw Error('cycle_after_observation');
 return projectPublicKaidancePulse(pulse,{now});
}
function retired(){throw Error('legacy_unsigned_publication_disabled_use_signed_owned_pulse_publisher')}
export function validatePublicApproval(){return retired()}
export async function publishApprovedKaidancePulse(){return retired()}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 console.error('KAIDANCE_PUBLICATION_HELD: legacy unsigned publisher disabled. Use the path-bound Ed25519-signed systemia/leiland/owned-pulse-publisher.mjs.');
 process.exitCode=2;
}
