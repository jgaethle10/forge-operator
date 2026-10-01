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

function normalizeDeclaredCapability(input={}){
  const kind=String(input.kind||'').trim();
  if(!kind) throw new Error('micro_device_capability_kind_required');
  const operations=uniq(input.operations);
  if(!operations.length) throw new Error('micro_device_capability_operations_required');
  return {
    kind,
    operations,
    protocol:input.protocol?String(input.protocol):null,
    endpoint:input.endpoint?String(input.endpoint):null,
    metadata:input.metadata&&typeof input.metadata==='object'?structuredClone(input.metadata):{},
  };
}

export function normalizeMicroDeviceManifest(input={}){
  const id=String(input.device_id||'').trim();
  if(!id) throw new Error('micro_device_id_required');
  const mode=String(input.bridge_mode||'').trim();
  if(!BRIDGE_MODES.has(mode)) throw new Error('micro_device_bridge_mode_invalid');
  if(!input.authorization_ref) throw new Error('micro_device_authorization_required');
  const workloads=uniq(input.supported_workloads);
  const declaredCapabilities=(input.capabilities||[]).map(normalizeDeclaredCapability);

  const computeExecutionMode=String(
    input.compute_execution_mode||
    (mode==='native_agent'?'native_device':'none')
  );
  if(!['native_device','gateway_proxy','none'].includes(computeExecutionMode)){
    throw new Error('micro_device_compute_execution_mode_invalid');
  }
  if(computeExecutionMode==='native_device'&&mode!=='native_agent'&&input.native_compute_verified!==true){
    throw new Error('micro_device_native_compute_requires_verified_native_agent');
  }
  if(computeExecutionMode!=='none'&&!workloads.length){
    throw new Error('micro_device_workloads_required_for_compute');
  }
  if(computeExecutionMode==='none'&&!declaredCapabilities.length){
    throw new Error('micro_device_capability_or_compute_required');
  }

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
    compute_execution_mode:computeExecutionMode,
    declared_capabilities:declaredCapabilities,
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
      primary_function_priority:input.primary_function_priority!==false,
      cpu_utilization_ceiling:input.cpu_utilization_ceiling==null?0.60:Math.max(0.05,Math.min(0.95,Number(input.cpu_utilization_ceiling))),
      memory_reserve_mb:Math.max(0,Number(input.memory_reserve_mb||64)),
      temperature_ceiling_c:input.temperature_ceiling_c==null?null:Number(input.temperature_ceiling_c),
      battery_floor_percent:input.battery_floor_percent==null?null:Math.max(0,Math.min(100,Number(input.battery_floor_percent))),
      require_external_power:input.require_external_power===true,
      network_utilization_ceiling:input.network_utilization_ceiling==null?0.70:Math.max(0.05,Math.min(0.95,Number(input.network_utilization_ceiling))),
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

export function microDeviceToAmbientCapabilities(manifestInput={}){
  const manifest=manifestInput?.schema==='evercraft.microseed.device-manifest.v1'
    ? manifestInput
    : normalizeMicroDeviceManifest(manifestInput);

  if(!manifest.endpoint&&manifest.bridge_mode!=='native_agent'&&!manifest.declared_capabilities?.every(x=>x.endpoint)){
    throw new Error('micro_device_bridge_endpoint_required');
  }

  const baseMetadata={
    device_class:manifest.device_class,
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
    compute_execution_mode:manifest.compute_execution_mode,
    max_concurrency:manifest.constraints.max_concurrency,
    duty_cycle:manifest.constraints.duty_cycle,
    thermal_budget:manifest.constraints.thermal_budget,
    power_budget_watts:manifest.constraints.power_budget_watts,
    primary_function_priority:manifest.constraints.primary_function_priority,
    cpu_utilization_ceiling:manifest.constraints.cpu_utilization_ceiling,
    memory_reserve_mb:manifest.constraints.memory_reserve_mb,
    temperature_ceiling_c:manifest.constraints.temperature_ceiling_c,
    battery_floor_percent:manifest.constraints.battery_floor_percent,
    require_external_power:manifest.constraints.require_external_power,
    network_utilization_ceiling:manifest.constraints.network_utilization_ceiling,
    external_cash_cost_usd:0,
    incremental_energy_cost_state:'not_measured',
    arbitrary_code_execution:false,
  };

  const capabilities=[];
  if(manifest.compute_execution_mode==='native_device'){
    capabilities.push({
      schema:'evercraft.ambient-capability.v1',
      id:'microseed:'+manifest.device_id+':compute',
      source_type:'microseed-device',
      access_class:'authorized_compute',
      kind:'compute',
      operations:['execute_registered_workload'],
      endpoint:manifest.endpoint,
      protocol:manifest.protocol||'evercraft.microseed.v1',
      locality:null,
      cost:0,
      terms_ref:null,
      owner_ref:'authorization-hash:'+manifest.authorization_ref_hash,
      observed_at:manifest.observed_at,
      metadata:{
        ...baseMetadata,
        resources:manifest.resources,
        supported_workloads:manifest.supported_workloads,
        execution_location:'device',
      },
    });
  }

  for(const [index,declared] of (manifest.declared_capabilities||[]).entries()){
    capabilities.push({
      schema:'evercraft.ambient-capability.v1',
      id:'microseed:'+manifest.device_id+':capability:'+index,
      source_type:'microseed-device',
      access_class:'authorized_compute',
      kind:declared.kind,
      operations:declared.operations,
      endpoint:declared.endpoint||manifest.endpoint,
      protocol:declared.protocol||manifest.protocol||'evercraft.microseed.v1',
      locality:null,
      cost:0,
      terms_ref:null,
      owner_ref:'authorization-hash:'+manifest.authorization_ref_hash,
      observed_at:manifest.observed_at,
      metadata:{
        ...baseMetadata,
        ...declared.metadata,
        execution_location:'device_capability_via_gateway',
      },
    });
  }
  return capabilities;
}

export function microDeviceToAmbientCapability(manifestInput={}){
  const capabilities=microDeviceToAmbientCapabilities(manifestInput);
  const compute=capabilities.find(x=>x.kind==='compute');
  if(!compute) throw new Error('micro_device_native_compute_not_declared');
  return compute;
}

export const MicroSeedBridgeModes=Object.freeze([...BRIDGE_MODES]);
