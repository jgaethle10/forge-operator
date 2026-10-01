import { createHash } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const BRIDGE_MODES=new Set([
  'native_agent',
  'lan_api',
  'mqtt',
  'ble_proxy',
  'serial',
  'usb',
  'matter',
  'thread',
  'zigbee_gateway',
]);

const uniq=(v)=>[...new Set((v||[]).map(x=>String(x).trim()).filter(Boolean))];

export function normalizeMicroDeviceManifest(input={}){
  const id=String(input.device_id||'').trim();
  if(!id) throw new Error('micro_device_id_required');
  const mode=String(input.bridge_mode||'').trim();
  if(!BRIDGE_MODES.has(mode)) throw new Error('micro_device_bridge_mode_invalid');
  if(!input.authorization_ref) throw new Error('micro_device_authorization_required');
  const workloads=uniq(input.supported_workloads);
  if(!workloads.length) throw new Error('micro_device_workloads_required');

  const body={
    schema:'evercraft.microseed.device-manifest.v1',
    device_id:id,
    device_class:String(input.device_class||'embedded-device'),
    bridge_mode:mode,
    authorization_ref_hash:sha(String(input.authorization_ref)),
    endpoint:input.endpoint?String(input.endpoint):null,
    protocol:input.protocol?String(input.protocol):null,
    supported_workloads:workloads,
    operations:uniq(input.operations),
    resources:{
      cpu_units:Math.max(0,Number(input.resources?.cpu_units||0)),
      memory_mb:Math.max(0,Number(input.resources?.memory_mb||0)),
      storage_gb:Math.max(0,Number(input.resources?.storage_gb||0)),
    },
    placement:{
      public_ingress:input.public_ingress===true,
      persistent_storage:input.persistent_storage===true,
      labels:uniq(input.placement_labels).map(x=>x.toLowerCase()),
    },
    constraints:{
      arbitrary_code_execution:false,
      max_concurrency:Math.max(1,Math.floor(Number(input.max_concurrency||1))),
      duty_cycle:input.duty_cycle?String(input.duty_cycle):'opportunistic',
      thermal_budget:input.thermal_budget?String(input.thermal_budget):'device_defined',
      power_budget_watts:input.power_budget_watts==null?null:Number(input.power_budget_watts),
    },
    attestation:{
      mode:input.attestation?.mode?String(input.attestation.mode):'gateway_bound',
      device_identity:input.attestation?.device_identity?String(input.attestation.device_identity):null,
      gateway_identity:input.attestation?.gateway_identity?String(input.attestation.gateway_identity):null,
    },
    observed_at:input.observed_at||new Date().toISOString(),
  };
  return {...body,manifest_hash:sha(body)};
}

export function microDeviceToAmbientCapability(manifestInput={}){
  const manifest=manifestInput?.schema==='evercraft.microseed.device-manifest.v1'
    ? manifestInput
    : normalizeMicroDeviceManifest(manifestInput);

  if(!manifest.endpoint&&manifest.bridge_mode!=='native_agent'){
    throw new Error('micro_device_bridge_endpoint_required');
  }

  return {
    schema:'evercraft.ambient-capability.v1',
    id:'microseed:'+manifest.device_id,
    source_type:'microseed-device',
    access_class:'authorized_compute',
    kind:'compute',
    operations:['execute_registered_workload',...manifest.operations],
    endpoint:manifest.endpoint,
    protocol:manifest.protocol||'evercraft.microseed.v1',
    locality:null,
    cost:0,
    terms_ref:null,
    owner_ref:'authorization-hash:'+manifest.authorization_ref_hash,
    observed_at:manifest.observed_at,
    metadata:{
      device_class:manifest.device_class,
      resources:manifest.resources,
      supported_workloads:manifest.supported_workloads,
      placement_labels:manifest.placement.labels,
      public_ingress:manifest.placement.public_ingress,
      persistent_storage:manifest.placement.persistent_storage,
      micro_node:true,
      zero_cost:true,
      attested:Boolean(
        manifest.attestation.device_identity||
        manifest.attestation.gateway_identity
      ),
      valid_version:true,
      device_model:null,
      bridge_mode:manifest.bridge_mode,
      max_concurrency:manifest.constraints.max_concurrency,
      duty_cycle:manifest.constraints.duty_cycle,
      thermal_budget:manifest.constraints.thermal_budget,
      power_budget_watts:manifest.constraints.power_budget_watts,
      arbitrary_code_execution:false,
    },
  };
}

export const MicroSeedBridgeModes=Object.freeze([...BRIDGE_MODES]);
