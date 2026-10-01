import { createHash } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const RULES=[
  {
    match:o=>o.observation_kind==='mdns-service'&&/_matter\._tcp/i.test(o.service_type||''),
    profile:{
      device_family:'matter_device',
      bridge_modes:['matter'],
      candidate_kinds:['observation','actuation'],
      compute_implied:false,
      confidence:0.9,
    },
  },
  {
    match:o=>o.observation_kind==='mdns-service'&&/_mqtt\._tcp/i.test(o.service_type||''),
    profile:{
      device_family:'mqtt_endpoint',
      bridge_modes:['mqtt'],
      candidate_kinds:['observation','network_egress','network_ingress'],
      compute_implied:false,
      confidence:0.9,
    },
  },
  {
    match:o=>o.observation_kind==='mdns-service'&&/_(smb|nfs)\._tcp/i.test(o.service_type||''),
    profile:{
      device_family:'network_storage',
      bridge_modes:['lan_api'],
      candidate_kinds:['storage'],
      compute_implied:false,
      confidence:0.88,
    },
  },
  {
    match:o=>o.observation_kind==='mdns-service'&&/_ssh\._tcp/i.test(o.service_type||''),
    profile:{
      device_family:'general_compute_candidate',
      bridge_modes:['native_agent'],
      candidate_kinds:['compute'],
      compute_implied:false,
      confidence:0.65,
    },
  },
  {
    match:o=>o.observation_kind==='mdns-service'&&/_(http|https)\._tcp/i.test(o.service_type||''),
    profile:{
      device_family:'lan_api_candidate',
      bridge_modes:['lan_api'],
      candidate_kinds:['observation','actuation','storage','network_egress'],
      compute_implied:false,
      confidence:0.45,
    },
  },
  {
    match:o=>o.observation_kind==='mdns-service'&&/_ipp\._tcp/i.test(o.service_type||''),
    profile:{
      device_family:'printer',
      bridge_modes:['lan_api'],
      candidate_kinds:['actuation'],
      compute_implied:false,
      confidence:0.95,
    },
  },
  {
    match:o=>o.observation_kind==='mdns-service'&&/_(airplay|googlecast)\._tcp/i.test(o.service_type||''),
    profile:{
      device_family:'media_output',
      bridge_modes:['lan_api'],
      candidate_kinds:['actuation'],
      compute_implied:false,
      confidence:0.92,
    },
  },
  {
    match:o=>o.observation_kind==='bluetooth-device',
    profile:{
      device_family:'bluetooth_device',
      bridge_modes:['ble_proxy'],
      candidate_kinds:['observation','actuation'],
      compute_implied:false,
      confidence:0.35,
    },
  },
  {
    match:o=>o.observation_kind==='usb-device',
    profile:{
      device_family:'usb_device',
      bridge_modes:['usb'],
      candidate_kinds:['observation','actuation','storage','device_io'],
      compute_implied:false,
      confidence:0.4,
    },
  },
  {
    match:o=>o.observation_kind==='lan-neighbor',
    profile:{
      device_family:'lan_neighbor',
      bridge_modes:[],
      candidate_kinds:[],
      compute_implied:false,
      confidence:0.1,
    },
  },
];

export function profileAmbientObservation(observation={}){
  const rule=RULES.find(r=>r.match(observation));
  const profile=rule?.profile||{
    device_family:'unknown',
    bridge_modes:[],
    candidate_kinds:[],
    compute_implied:false,
    confidence:0,
  };

  const body={
    schema:'evercraft.saban.ambient-candidate-profile.v1',
    observation_ref:String(observation.device_hint_hash||''),
    observation_kind:String(observation.observation_kind||'unknown'),
    source:String(observation.source||'unknown'),
    service_type:observation.service_type||null,
    device_family:profile.device_family,
    suggested_bridge_modes:profile.bridge_modes,
    candidate_capability_kinds:profile.candidate_kinds,
    compute_implied:false,
    native_compute_requires_verified_agent:true,
    owner_authorization_required:true,
    credentials_required_before_control:true,
    active_probe_allowed:false,
    confidence:profile.confidence,
    next_steps:[
      'identify_owner_authorized_device',
      'resolve_compatible_endpoint_without_embedded_credentials',
      'declare_bounded_capabilities',
      'authorize_exact_device',
      'heartbeat_and_attest',
      ...(profile.candidate_kinds.includes('compute')
        ? ['install_or_verify_native_agent','run_safe_workload_conformance']
        : ['probe_only_after_authorization']),
    ],
  };
  return {...body,profile_hash:sha(body)};
}

export function profileAmbientCensus(census={}){
  if(census?.schema!=='evercraft.saban.passive-ambient-census.v1'){
    throw new Error('passive_ambient_census_required');
  }
  const profiles=(census.observations||[]).map(profileAmbientObservation);
  const counts=profiles.reduce((acc,p)=>{
    acc[p.device_family]=(acc[p.device_family]||0)+1;
    return acc;
  },{});
  const body={
    schema:'evercraft.saban.ambient-candidate-inventory.v1',
    observation_count:profiles.length,
    candidate_count:profiles.filter(p=>p.confidence>0).length,
    family_counts:counts,
    profiles,
    authorization_granted:false,
    active_probe_performed:false,
    generated_at:census.observed_at||new Date().toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}

export const AmbientCandidateRules=Object.freeze(
  RULES.map(r=>({
    device_family:r.profile.device_family,
    bridge_modes:r.profile.bridge_modes,
    candidate_kinds:r.profile.candidate_kinds,
    confidence:r.profile.confidence,
  }))
);
