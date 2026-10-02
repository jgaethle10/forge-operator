import dns from 'node:dns/promises';

function clean(value,max=2000){
  return String(value??'').trim().slice(0,max);
}

function normalizeOrigin(value){
  const raw=clean(value);
  if(!raw) throw new Error('public_edge_origin_required');
  const url=new URL(raw);
  if(url.protocol!=='https:') throw new Error('public_edge_origin_must_use_https');
  return url.origin;
}

async function defaultLocalProbe(url,{timeoutMs=3000}={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),Math.max(250,Number(timeoutMs||3000)));
  try{
    const response=await fetch(url,{signal:controller.signal,headers:{accept:'application/json'}});
    const body=await response.json().catch(()=>null);
    return {
      ok:response.ok && body?.ok===true,
      status:response.status,
      service:body?.service||null,
      body,
    };
  }catch(error){
    return {ok:false,status:0,error:clean(error?.message||error,500),body:null};
  }finally{
    clearTimeout(timer);
  }
}

async function defaultDnsProbe(hostname){
  try{
    const records=await dns.lookup(hostname,{all:true});
    return {
      ok:records.length>0,
      addresses:[...new Set(records.map((row)=>row.address))],
    };
  }catch(error){
    return {ok:false,addresses:[],error:clean(error?.message||error,500)};
  }
}

function normalizeExternalProbe(input){
  if(!input||typeof input!=='object'){
    return {
      state:'not_observed',
      observed:false,
      tcp_reachable:null,
      tls_reachable:null,
      http_reachable:null,
      status:null,
      observed_at:null,
      source:null,
      detail:null,
    };
  }
  return {
    state:clean(input.state||'observed',80),
    observed:true,
    tcp_reachable:input.tcp_reachable===true?true:input.tcp_reachable===false?false:null,
    tls_reachable:input.tls_reachable===true?true:input.tls_reachable===false?false:null,
    http_reachable:input.http_reachable===true?true:input.http_reachable===false?false:null,
    status:Number.isFinite(Number(input.status))?Number(input.status):null,
    observed_at:clean(input.observed_at||'',80)||null,
    source:clean(input.source||'',160)||null,
    detail:clean(input.detail||'',500)||null,
  };
}

export function classifyPublicEdgeIngress({
  local,
  dns: dnsState,
  external,
  expectedAddresses=[],
}={}){
  const localOk=local?.ok===true;
  const dnsOk=dnsState?.ok===true;
  const externalState=normalizeExternalProbe(external);
  const expected=[...new Set((expectedAddresses||[]).map(clean).filter(Boolean))];
  const resolved=[...new Set((dnsState?.addresses||[]).map(clean).filter(Boolean))];
  const addressMatch=!expected.length||expected.some((value)=>resolved.includes(value));

  let state='unknown';
  let severity='medium';
  let remediation='collect_external_probe';
  let directIngressReady=false;

  if(!localOk){
    state='local_service_unhealthy';
    severity='high';
    remediation='repair_local_service_before_public_routing';
  }else if(!dnsOk){
    state='dns_unresolved';
    severity='high';
    remediation='repair_dns_binding';
  }else if(!addressMatch){
    state='dns_target_mismatch';
    severity='high';
    remediation='repair_dns_target';
  }else if(!externalState.observed){
    state='external_probe_required';
    severity='medium';
    remediation='obtain_independent_external_probe';
  }else if(
    externalState.tcp_reachable===false ||
    (externalState.tcp_reachable===null && externalState.tls_reachable===false)
  ){
    state='nat_or_firewall_ingress_blocked';
    severity='high';
    remediation='prefer_outbound_service_relay_then_safe_port_mapping_repair';
  }else if(externalState.tls_reachable===false){
    state='tls_ingress_failed';
    severity='high';
    remediation='repair_tls_or_public_edge_listener';
  }else if(externalState.http_reachable===false){
    state='http_route_failed';
    severity='high';
    remediation='repair_public_edge_route_binding';
  }else if(
    externalState.tcp_reachable===true &&
    externalState.tls_reachable!==false &&
    externalState.http_reachable!==false
  ){
    state='public_ingress_verified';
    severity='none';
    remediation='monitor';
    directIngressReady=true;
  }

  return {
    schema:'evercraft.public-edge.ingress-diagnosis.v1',
    state,
    severity,
    direct_ingress_ready:directIngressReady,
    local_service_ok:localOk,
    dns_ok:dnsOk,
    dns_target_match:addressMatch,
    resolved_addresses:resolved,
    expected_addresses:expected,
    external_probe:externalState,
    remediation,
    outbound_service_relay_preferred:
      state==='nat_or_firewall_ingress_blocked',
    arbitrary_router_admin_allowed:false,
    evidence_complete:
      localOk && dnsOk && addressMatch && externalState.observed,
  };
}

export async function observePublicEdgeIngress({
  publicOrigin,
  localHealthUrl,
  expectedAddresses=[],
  externalProbe=null,
  localProbe=defaultLocalProbe,
  dnsProbe=defaultDnsProbe,
  timeoutMs=3000,
}={}){
  const origin=normalizeOrigin(publicOrigin);
  const publicUrl=new URL(origin);
  const localUrl=clean(localHealthUrl);
  if(!localUrl) throw new Error('local_health_url_required');

  const [local,dnsState]=await Promise.all([
    localProbe(localUrl,{timeoutMs}),
    dnsProbe(publicUrl.hostname),
  ]);
  const external=typeof externalProbe==='function'
    ? await externalProbe({origin,hostname:publicUrl.hostname,timeoutMs})
    : externalProbe;

  return {
    ...classifyPublicEdgeIngress({
      local,
      dns:dnsState,
      external,
      expectedAddresses,
    }),
    public_origin:origin,
    local_health_url:localUrl,
    observed_at:new Date().toISOString(),
  };
}

export function recoveryDecision(diagnosis,{outboundRelayAvailable=false,portMappingCapability='unknown'}={}){
  if(!diagnosis||diagnosis.schema!=='evercraft.public-edge.ingress-diagnosis.v1'){
    throw new Error('ingress_diagnosis_required');
  }
  if(diagnosis.direct_ingress_ready){
    return {
      schema:'evercraft.public-edge.ingress-recovery.v1',
      action:'none',
      state:'direct_ingress_healthy',
      founder_action_required:false,
    };
  }
  if(diagnosis.state==='nat_or_firewall_ingress_blocked'&&outboundRelayAvailable){
    return {
      schema:'evercraft.public-edge.ingress-recovery.v1',
      action:'activate_outbound_service_relay',
      state:'software_recovery_available',
      founder_action_required:false,
      arbitrary_router_admin_allowed:false,
    };
  }
  if(
    diagnosis.state==='nat_or_firewall_ingress_blocked' &&
    ['upnp_verified','nat_pmp_verified'].includes(String(portMappingCapability))
  ){
    return {
      schema:'evercraft.public-edge.ingress-recovery.v1',
      action:'repair_bounded_port_mapping',
      state:'local_network_recovery_available',
      founder_action_required:false,
      capability:String(portMappingCapability),
      arbitrary_router_admin_allowed:false,
    };
  }
  return {
    schema:'evercraft.public-edge.ingress-recovery.v1',
    action:'hold',
    state:'no_safe_automatic_ingress_repair_available',
    founder_action_required:diagnosis.severity==='high',
    arbitrary_router_admin_allowed:false,
    preferred_next:
      diagnosis.state==='nat_or_firewall_ingress_blocked'
        ? 'establish_or_select_an_evercraft_public_broker_edge'
        : diagnosis.remediation,
  };
}
