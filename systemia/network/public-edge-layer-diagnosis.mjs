/**
 * External, read-only public edge fault-domain diagnosis.
 *
 * A composite product canary can fail while public ingress is up.
 * Never convert successful DNS/TLS/HTTP evidence into a full product
 * release PASS, and never prescribe router mutation for an app failure.
 */
const clean=(value)=>String(value??'').trim().slice(0,160);

function layer(value,failed=false){
  return value===true?'verified':failed?'failed':'unverified';
}

function publicFailureDomain(stage){
  if(stage==='public_dns') return 'dns';
  if(stage==='public_tcp_tls_ingress') return 'public_transport';
  if(stage==='trusted_tls') return 'trusted_tls';
  if(stage==='customer_surface') return 'public_http';
  if(stage==='journal_surface') return 'journal_publication';
  if(stage==='runtime_health') return 'fabric_runtime';
  if(stage==='device_attestation') return 'device_attestation';
  if(stage==='mcp_sse_probe'||stage==='mcp_initialize'||stage==='mcp_tools') return 'mcp_transport_or_contract';
  if(stage==='unknown'||!stage) return 'undetermined';
  return 'product_surface_or_contract';
}

export function diagnoseExternalEdgeLayers({
  checks={},
  publicTcp=null,
  failureStage='',
  error='',
  compositeVerified=false,
}={}){
  const stage=clean(failureStage);
  const failure=stage.length>0&&stage!=='unknown';
  const dns=checks?.public_dns===true;
  const tcp=publicTcp?.https_443?.reachable===true ||
    checks?.public_tcp_443===true;
  const tls=checks?.trusted_tls===true;
  const http=checks?.customer_surface===true;
  const transportVerified=dns&&tcp&&tls&&http;
  const failureDomain=failure?publicFailureDomain(stage):'none_observed';
  const productHealthy=compositeVerified===true && !failure &&
    transportVerified && checks?.runtime_health===true &&
    checks?.mcp_tools===true && checks?.journal_surface===true;

  const layers={
    public_dns:layer(dns,stage==='public_dns'),
    public_tcp_443:layer(tcp,stage==='public_tcp_tls_ingress'),
    trusted_tls:layer(tls,stage==='trusted_tls'),
    public_http_root:layer(http,stage==='customer_surface'),
    journal_surface:layer(checks?.journal_surface===true,stage==='journal_surface'),
    fabric_runtime:layer(checks?.runtime_health===true,stage==='runtime_health'),
    mcp_contract:layer(checks?.mcp_tools===true,
      ['mcp_sse_probe','mcp_initialize','mcp_tools'].includes(stage)),
    device_attestation:layer(checks?.device_attestation===true,stage==='device_attestation')
  };

  let recommendedNext='collect_independent_external_and_resident_receipts';
  if(failureDomain==='journal_publication'){
    recommendedNext='inspect_journal_index_and_publication_receipts';
  }else if(failureDomain==='fabric_runtime'){
    recommendedNext='inspect_fabric_runtime_and_release_parity';
  }else if(failureDomain==='mcp_transport_or_contract'){
    recommendedNext='inspect_mcp_transport_and_tool_contract';
  }else if(failureDomain==='product_surface_or_contract'){
    recommendedNext='inspect_failed_product_surface_without_router_changes';
  }else if(failureDomain==='public_transport' || failureDomain==='trusted_tls' ||
           failureDomain==='dns' || failureDomain==='public_http'){
    recommendedNext='compare_external_canary_with_resident_node_observation';
  }

  return {
    schema:'evercraft.network.public-edge-layer-diagnosis.v1',
    composite_product_verified:productHealthy,
    public_transport_verified:transportVerified,
    state:productHealthy?'full_contract_verified':
      transportVerified&&failure?'transport_verified_product_failed':
      transportVerified?'transport_verified_product_unverified':
      'public_transport_unverified',
    layers,
    failure_domain:failureDomain,
    failure_stage:stage||null,
    failure_reason:clean(error,160)||null,
    recommended_next:recommendedNext,
    router_mutation_authorized:false,
    can_restart_public_edge:false,
    local_resident_node_health_verified:false,
    external_evidence_only:true,
    note:'Evidence is inherited from this external canary run; it does not prove a physical NodeSeed, internal application readiness, or authority to recover.'
  };
}
