// Public KAIDANCE contract: validated, small and unrelated to private mission contents.
export const PUBLIC_PULSE_SCHEMA = 'evercraft.kaidance.public-pulse.v1';
export const TARGET_GRACE_SECONDS = 90;
const MAX_FUTURE_SKEW_MS = 60_000;
const MAX_PUBLISH_AGE_MS = 420_000;
function time(value){const d=Date.parse(value);return typeof value==='string'&&Number.isFinite(d)?d:NaN}
function count(value){return Number.isSafeInteger(value)&&value>=0&&value<=1_000_000_000}
export function assessPublicPulse(pulse,now=Date.now()){
  if(!pulse || typeof pulse!=='object' || Array.isArray(pulse) || pulse.schema!==PUBLIC_PULSE_SCHEMA)return {ok:false,reason:'missing_or_invalid_schema'};
  const at=time(pulse.observed_at), published=time(pulse.published_at);
  if(!Number.isFinite(at)||!Number.isFinite(published))return {ok:false,reason:'invalid_timestamp'};
  if(at>now+MAX_FUTURE_SKEW_MS||published>now+MAX_FUTURE_SKEW_MS||published<at-60_000)return {ok:false,reason:'clock_or_publication_invalid'};
  if(!['healthy','degraded','starting'].includes(pulse.state))return {ok:false,reason:'invalid_state'};
  if(!count(pulse.cycle_number)||!count(pulse.admitted_count)||!count(pulse.held_count))return {ok:false,reason:'invalid_counts'};
  if(!Number.isSafeInteger(pulse.heartbeat_target_seconds)||pulse.heartbeat_target_seconds<60||pulse.heartbeat_target_seconds>3600)return {ok:false,reason:'invalid_heartbeat_target'};
  if(typeof pulse.coverage_receipt_valid!=='boolean'||typeof pulse.field_attestation_verified!=='boolean')return {ok:false,reason:'invalid_verification'};
  const last=pulse.last_completed_cycle===null?null:time(pulse.last_completed_cycle);
  if(last!==null&&(!Number.isFinite(last)||last>at+MAX_FUTURE_SKEW_MS))return {ok:false,reason:'invalid_cycle_timestamp'};
  if(pulse.cycle_number>0&&last===null)return {ok:false,reason:'cycle_missing_timestamp'};
  const age=last===null?null:Math.max(0,Math.floor((now-last)/1000));
  const sourceFresh=now-published<=MAX_PUBLISH_AGE_MS&&now-at<=MAX_PUBLISH_AGE_MS;
  const cycleFresh=age!==null&&age<=pulse.heartbeat_target_seconds+TARGET_GRACE_SECONDS;
  const fresh=sourceFresh&&cycleFresh&&pulse.state==='healthy'&&pulse.coverage_receipt_valid;
  const verified=fresh&&pulse.field_attestation_verified;
  return {ok:true,cycle_number:pulse.cycle_number,admitted_count:pulse.admitted_count,held_count:pulse.held_count,
    state:pulse.state,coverage_receipt_valid:pulse.coverage_receipt_valid,
    heartbeat_target_seconds:pulse.heartbeat_target_seconds,last_completed_cycle:last,
    observed_at:at,published_at:published,age_seconds:age,sourceFresh,cycleFresh,fresh,verified,
    field_attestation_verified:pulse.field_attestation_verified};
}
export function durationText(seconds){
  if(!Number.isFinite(seconds))return 'UNKNOWN';
  const total=Math.max(0,Math.floor(seconds));
  return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');
}
