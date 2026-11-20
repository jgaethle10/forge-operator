// Explicit, narrow public export from the *existing* privacy-safe KAIDANCE pulse.
// Never accept raw runtime state, mission snapshots, evidence refs, or node topology.
import {assertPulsePrivacy} from './pulse.mjs';

export const PUBLIC_SCHEMA='evercraft.kaidance.public-pulse.v1';
const ALLOWED_STATES=new Set(['healthy','degraded','starting']);
function safeTime(input,field,now){
  if(typeof input!=='string')throw Error(field+'_missing');
  const parsed=Date.parse(input);
  if(!Number.isFinite(parsed)||parsed>now.getTime()+60_000)throw Error(field+'_invalid');
  return new Date(parsed).toISOString();
}
function safeCount(value,field){
  if(!Number.isSafeInteger(value)||value<0||value>1_000_000_000)throw Error(field+'_invalid');
  return value;
}
export function projectPublicKaidancePulse(pulse,{now=new Date()}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error('clock_invalid');
 if(!pulse||pulse.schema!=='evercraft.kaidance.pulse.v1')throw Error('approved_safe_pulse_required');
 // The existing boundary must also pass, but is *not* treated as authorization to publish.
 assertPulsePrivacy(pulse);
 if(!ALLOWED_STATES.has(pulse.state))throw Error('pulse_state_invalid');
 const observed=safeTime(pulse.observed_at,'observed_at',now);
 const last=pulse.last_completed_cycle===null?null:safeTime(pulse.last_completed_cycle,'last_cycle',now);
 const cycle=safeCount(pulse.cycle_number,'cycle_number');
 if(cycle>0&&!last)throw Error('missing_last_cycle');
 const seconds=safeCount(pulse.heartbeat_target_seconds,'heartbeat_target_seconds');
 if(seconds<60||seconds>3600)throw Error('heartbeat_target_invalid');
 if(typeof pulse.coverage_receipt_valid!=='boolean')throw Error('coverage_receipt_state_invalid');
 return {
   schema:PUBLIC_SCHEMA,
   state:pulse.state,
   cycle_number:cycle,
   last_completed_cycle:last,
   heartbeat_target_seconds:seconds,
   admitted_count:safeCount(pulse.admitted_count,'admitted_count'),
   held_count:safeCount(pulse.held_count,'held_count'),
   coverage_receipt_valid:pulse.coverage_receipt_valid,
   field_attestation_verified:pulse.field_attestation?.state==='verified',
   observed_at:observed,
   published_at:now.toISOString()
 };
}
// Deliberately library-only. The signed Leiland owned-pulse-publisher is the
// sole authorized writer for a publicly exposed KAIDANCE pulse.
