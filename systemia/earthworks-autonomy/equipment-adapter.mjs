const REQUIRED_TELEMETRY = Object.freeze(['position','speed','state','heartbeat_at']);
const REQUIRED_PHYSICAL_SAFETY = Object.freeze([
  'independent_stop',
  'heartbeat_fail_safe',
  'operator_takeover',
  'adapter_watchdog'
]);

export function validateAdapterManifest(manifest = {}) {
  const errors=[];
  if (!manifest.id) errors.push('adapter id required');
  if (!manifest.machine_kind) errors.push('machine_kind required');
  if (!Array.isArray(manifest.authority_states) || manifest.authority_states.length===0) errors.push('authority_states required');
  if (!Array.isArray(manifest.commands)) errors.push('commands required');
  if (!Array.isArray(manifest.telemetry)) errors.push('telemetry required');

  for (const key of REQUIRED_TELEMETRY) {
    if (!manifest.telemetry?.includes(key)) errors.push(`missing telemetry: ${key}`);
  }

  if (manifest.authority_states?.includes('bounded_physical')) {
    for (const key of REQUIRED_PHYSICAL_SAFETY) {
      if (!manifest.safety?.[key]) errors.push(`bounded physical adapter missing safety control: ${key}`);
    }
    if (!manifest.safety?.local_stop_on_command_timeout) errors.push('bounded physical adapter requires local stop on command timeout');
  }

  return {ok:errors.length===0,errors};
}

export function createAdapterRegistry() {
  const adapters=new Map();

  function register(manifest) {
    const result=validateAdapterManifest(manifest);
    if (!result.ok) throw new Error(result.errors.join('; '));
    adapters.set(manifest.id,structuredClone(manifest));
    return get(manifest.id);
  }

  function get(id) {
    const item=adapters.get(id);
    return item ? structuredClone(item) : null;
  }

  function list() {
    return [...adapters.values()].map(structuredClone);
  }

  function authorize({adapterId,authorityState,command}) {
    const adapter=adapters.get(adapterId);
    if (!adapter) return {ok:false,reason:'unknown adapter'};
    if (!adapter.authority_states.includes(authorityState)) {
      return {ok:false,reason:`adapter does not permit authority state: ${authorityState}`};
    }
    if (authorityState==='shadow') {
      return {ok:false,reason:'shadow authority cannot actuate equipment'};
    }
    if (!adapter.commands.includes(command)) {
      return {ok:false,reason:`unsupported command: ${command}`};
    }
    return {
      ok:true,
      adapter_id:adapter.id,
      machine_kind:adapter.machine_kind,
      authority_state:authorityState,
      command
    };
  }

  return {register,get,list,authorize};
}

export function makeSimulatorAdapter(machineKind='haul_truck') {
  return {
    id:`simulator.${machineKind}.v1`,
    vendor:'Evercraft',
    machine_kind:machineKind,
    model_families:['digital_twin'],
    authority_states:['simulation'],
    commands:['hold','resume','navigate_to_zone','request_load_slot','load','haul','dump','manage_stockpile'],
    telemetry:['position','speed','state','heartbeat_at','payload','health','localization_quality'],
    safety:{independent_stop:true,heartbeat_fail_safe:true,operator_takeover:true,adapter_watchdog:true,local_stop_on_command_timeout:true}
  };
}
