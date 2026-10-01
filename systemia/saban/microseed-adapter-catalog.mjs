import { createHash } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

export const MicroSeedAdapterCatalog=Object.freeze({
  native_agent:{
    mode:'native_agent',
    implementation_state:'built_in',
    runtime_dependency:null,
    supports:['compute','telemetry'],
  },
  lan_api:{
    mode:'lan_api',
    implementation_state:'built_in',
    runtime_dependency:null,
    supports:['observation','actuation','storage','network_egress','network_ingress'],
  },
  matter:{
    mode:'matter',
    implementation_state:'runtime_dependency',
    runtime_dependency:'chip-tool',
    supports:['observation','actuation'],
  },
  mqtt:{
    mode:'mqtt',
    implementation_state:'not_implemented',
    runtime_dependency:null,
    supports:[],
  },
  ble_proxy:{
    mode:'ble_proxy',
    implementation_state:'not_implemented',
    runtime_dependency:null,
    supports:[],
  },
  serial:{
    mode:'serial',
    implementation_state:'not_implemented',
    runtime_dependency:null,
    supports:[],
  },
  usb:{
    mode:'usb',
    implementation_state:'not_implemented',
    runtime_dependency:null,
    supports:[],
  },
  thread:{
    mode:'thread',
    implementation_state:'not_implemented',
    runtime_dependency:null,
    supports:[],
  },
  zigbee_gateway:{
    mode:'zigbee_gateway',
    implementation_state:'not_implemented',
    runtime_dependency:null,
    supports:[],
  },
});

export function evaluateMicroSeedAdapterAvailability(mode,{
  runtime={},
}={}){
  const key=String(mode||'').trim();
  const entry=MicroSeedAdapterCatalog[key];
  if(!entry){
    return {available:false,mode:key,reason:'bridge_mode_unknown'};
  }
  if(entry.implementation_state==='built_in'){
    return {available:true,mode:key,reason:'built_in',entry};
  }
  if(entry.implementation_state==='runtime_dependency'){
    const dependency=entry.runtime_dependency;
    const ready=runtime?.executables?.[dependency]===true;
    return {
      available:ready,
      mode:key,
      reason:ready?'runtime_dependency_ready':'runtime_dependency_missing:'+dependency,
      entry,
    };
  }
  return {
    available:false,
    mode:key,
    reason:'adapter_not_implemented',
    entry,
  };
}

export function buildMicroSeedAdapterHealth({
  executables={},
  observed_at=new Date().toISOString(),
}={}){
  const adapters={};
  for(const mode of Object.keys(MicroSeedAdapterCatalog)){
    adapters[mode]=evaluateMicroSeedAdapterAvailability(mode,{runtime:{executables}});
  }
  const body={
    schema:'evercraft.saban.microseed-adapter-health.v1',
    adapters:Object.fromEntries(
      Object.entries(adapters).map(([mode,value])=>[mode,{
        available:value.available,
        reason:value.reason,
        implementation_state:value.entry?.implementation_state||'unknown',
        runtime_dependency:value.entry?.runtime_dependency||null,
        supports:value.entry?.supports||[],
      }])
    ),
    observed_at,
  };
  return {...body,receipt_hash:sha(body)};
}
