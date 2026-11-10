// Evercraft Community Broadcast Continuity v0: advisory plan only.
// Does not connect audio, start listeners, provision nodes, transmit RF, or generate EAS.
import crypto from 'node:crypto';

const FRESH_AUDIO_MS=30_000;
const FRESH_STATUS_MS=60_000;
const SOURCES=['station-live-input','station-approved-bulletin'];
const REACH=['local-lan','station-wifi'];
const plain=x=>typeof x==='string'?x.trim():'';
const nonempty=x=>plain(x).length>0;
const asTime=x=>{const t=Date.parse(x);return Number.isFinite(t)?t:null;};
const fresh=(date,now,limit)=>{const t=asTime(date);return t!==null&&t<=now&&now-t<=limit;};
const requiredRef=x=>nonempty(x)&&x.length<=200;

/**
 * Candidate selection for an operator-supervised, expressly permitted LAN broadcast
 * continuity trial. These are UNTRUSTED supplied observations, not field receipts.
 * Never return execution authorization or FM/EAS authority.
 */
export function planCommunityBroadcastContinuity({station={},node={},paths=[],sources=[],now=new Date()}={}){
  const instant=now instanceof Date?now.getTime():asTime(now);
  if(instant===null||!Number.isFinite(instant))throw new Error('valid_observation_time_required');
  const blockers=[];
  const operatorConsent=station?.operator_authorized===true&&requiredRef(station?.written_approval_ref);
  if(!operatorConsent)blockers.push('station_operator_written_consent_required');
  if(node?.enrollment_approved!==true||!requiredRef(node?.enrollment_ref)||node?.revoked===true)
    blockers.push('revocable_device_enrollment_required');
  if(node?.power_verified!==true||!Number.isFinite(node?.autonomy_minutes)||node.autonomy_minutes<=0)
    blockers.push('measured_node_power_required');
  const channel=Array.isArray(paths)?paths.find(p=>REACH.includes(p?.kind)&&p?.listener_access_tested===true&&p?.authorized===true&&fresh(p?.observed_at,instant,FRESH_STATUS_MS)):null;
  if(!channel)blockers.push('fresh_authorized_listener_path_test_required');

  const validSource=s=>SOURCES.includes(s?.kind)&&s?.station_origin_verified===true&&
    requiredRef(s?.source_ref)&&requiredRef(s?.distribution_rights_ref)&&
    s?.local_distribution_approved===true;
  const options=(Array.isArray(sources)?sources:[]).filter(validSource);
  const program=options.find(s=>s.kind==='station-live-input'&&fresh(s.observed_at,instant,FRESH_AUDIO_MS));
  // Offline bulletins need a verified local cache and a hard expiration, not
  // a live internet feed. The recording may predate the current outage.
  const bulletin=options.find(s=>s.kind==='station-approved-bulletin'&&
    requiredRef(s.editor_approval_ref)&&s.local_cache_integrity_verified===true&&
    /^sha256:[a-f0-9]{64}$/.test(plain(s.cached_audio_digest))&&
    asTime(s.approved_at)!==null&&asTime(s.approved_at)<=instant&&
    asTime(s.expires_at)!==null&&asTime(s.expires_at)>instant&&
    asTime(s.expires_at)-asTime(s.approved_at)<=24*60*60*1000);
  if(!program&&!bulletin)blockers.push('fresh_rights_cleared_station_audio_or_approved_bulletin_required');
  const state=blockers.length?'held':program?'candidate_live_lan_trial':'candidate_offline_bulletin_trial';
  const candidate=blockers.length?null:program||bulletin;
  const result={
    schema:'evercraft.community-broadcast-continuity.plan.v0',
    state,
    operational_state:'unverified_advisory_only',
    observed_at:new Date(instant).toISOString(),
    station_key:plain(station?.station_key)||null,
    candidate_source_kind:candidate?.kind||null,
    candidate_source_ref:candidate?.source_ref||null,
    candidate_path_kind:channel?.kind||null,
    blockers,
    controls:{
      station_licensee_controls_fm:true,
      fm_transmission_authorized:false,
      eas_creation_or_relay_authorized:false,
      node_enrollment_performed:false,
      deployment_authorized:false,
      client_broadcast_started:false,
      live_reach_independently_verified:false,
      audio_rights_must_be_confirmed_by_licensee:true,
      station_can_revoke_any_time:true,
    },
  };
  return {...result,plan_digest:'sha256:'+crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex')};
}
