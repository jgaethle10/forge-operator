// Leiland is a read-only spectator of KAIDANCE's existing public pulse projection.
// Never receive private KAIDANCE health, Raven inference, mission payloads or tokens.
import {assessPublicPulse} from '../kaidance/pulse-source.mjs';

const SAFE_STATES=new Set(['not_connected','stale','unverified','source_attested']);

export function projectLeilandPulse(publicPulse,now=Date.now()){
  const assessed=assessPublicPulse(publicPulse,now);
  if(!assessed.ok){
    return Object.freeze({state:'not_connected',cycle_number:null,admitted_count:null,held_count:null,observed_at:null,last_completed_cycle:null,field_attestation_verified:false});
  }
  let state='unverified';
  if(!assessed.sourceFresh||!assessed.cycleFresh) state='stale';
  else if(assessed.verified) state='source_attested';
  if(!SAFE_STATES.has(state))throw Error('invalid_leiland_projection_state');
  // Exhaustive allowlist: never pass through unknown upstream object properties.
  return Object.freeze({
    state,
    cycle_number:assessed.cycle_number,
    admitted_count:assessed.admitted_count,
    held_count:assessed.held_count,
    observed_at:new Date(assessed.observed_at).toISOString(),
    last_completed_cycle:assessed.last_completed_cycle===null?null:new Date(assessed.last_completed_cycle).toISOString(),
    field_attestation_verified:assessed.field_attestation_verified===true,
  });
}
