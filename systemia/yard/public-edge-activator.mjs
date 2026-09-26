import path from 'node:path';
import { createHash } from 'node:crypto';
import { discoverEligibleCapacity, allocatorTokenForOffer } from './capacity-resolver.mjs';
import { YardOperator } from './operator.mjs';
import { PublicEdgeController } from './public-edge-controller.mjs';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

export async function activatePublicSpecialistEdge({
  stateDir,
  releaseRef,
  allocatorToken='',
  allocatorTokens={},
  discovery={},
  endpointTimeoutMs=1000,
  leaseTtlMs=3600000,
  renewEveryMs=1800000,
  controllerIntervalMs=60000,
  requestedHostname='evercraft-specialists',
  mode='wildcard_https',
  requiredPlacementLabels=['public-edge'],
  specialistGatewayUrl='https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceGateway',
  allowLoopbackProof=false,
}={}){
  if(!stateDir) throw new Error('activation_state_dir_required');
  if(!/^[a-f0-9]{40}$/i.test(String(releaseRef||''))){
    throw new Error('release_ref_must_be_immutable_sha');
  }
  const productionMode=String(mode||'wildcard_https')==='wildcard_https';
  if(!productionMode&&!allowLoopbackProof){
    throw new Error('proof_mode_requires_explicit_authority');
  }

  const resolution=await discoverEligibleCapacity({
    workloadClass:'systemia.public-edge.v1',
    requiredWorkloads:[
      'systemia.public-edge.v1',
      'systemia.specialist-handoff-mcp.v1',
    ],
    requiredPlacementLabels,
    requiredServiceCapabilities:productionMode?['public_edge']:[],
    requireAttestation:true,
    discovery,
    endpointTimeoutMs,
  });

  if(!resolution.selected){
    const reasonCounts={};
    for(const candidate of resolution.candidates||[]){
      const reason=String(candidate.reason||'unknown');
      reasonCounts[reason]=(reasonCounts[reason]||0)+1;
    }
    const error=new Error('no_edge_ready_compute_node');
    error.receipt={
      schema:'evercraft.public-edge.activation-hold.v1',
      state:'held_no_edge_ready_compute_node',
      production_mode:productionMode,
      required_workloads:resolution.requirements.workloads,
      required_placement_labels:resolution.requirements.placement_labels,
      required_service_capabilities:resolution.requirements.service_capabilities,
      discovered_count:resolution.discovered_count,
      eligible_count:resolution.eligible_count,
      candidate_reason_counts:reasonCounts,
      resolver_receipt:resolution.receipt_hash,
      founder_action_required:false,
      observed_at:new Date().toISOString(),
    };
    error.receipt.receipt_hash=sha(error.receipt);
    throw error;
  }

  const selected=resolution.selected;
  const token=allocatorTokenForOffer(selected,{allocatorToken,allocatorTokens});
  if(selected.allocation_auth==='bearer'&&!token){
    const error=new Error('allocator_authority_unavailable_for_selected_edge_node');
    error.receipt={
      schema:'evercraft.public-edge.activation-hold.v1',
      state:'held_allocator_authority_unavailable',
      selected_node:selected.node_id,
      selected_endpoint:selected.endpoint,
      resolver_receipt:resolution.receipt_hash,
      founder_action_required:false,
      observed_at:new Date().toISOString(),
    };
    error.receipt.receipt_hash=sha(error.receipt);
    throw error;
  }

  const yard=new YardOperator({
    stateDir:path.join(path.resolve(stateDir),'yard'),
  });
  const controller=new PublicEdgeController({
    yard,
    stateDir:path.join(path.resolve(stateDir),'controller'),
    leaseTtlMs,
    renewEveryMs,
    intervalMs:controllerIntervalMs,
    allowLoopbackProof,
  });

  const provisioned=await controller.provision({
    releaseRef,
    capacityEndpoint:selected.endpoint,
    allocatorToken:token,
    edge:{
      mode,
      // Wildcard domain and TLS paths intentionally remain node-local.
      // Evercraft Compute consumes its admitted environment configuration.
      base_domain:'',
      tls_key_path:'',
      tls_cert_path:'',
      public_host:productionMode?'0.0.0.0':'127.0.0.1',
      public_port:productionMode?443:0,
    },
    specialist:{
      gateway_url:specialistGatewayUrl,
    },
    requestedHostname,
    edgeRollbackTarget:'systemia:auto-edge-previous',
    specialistRollbackTarget:'systemia:auto-specialist-previous',
    requireIdentityAttestation:true,
  });

  controller.start({immediate:false});

  const body={
    schema:'evercraft.public-edge.activation.v1',
    state:provisioned.route_verified===true
      ? 'public_https_verified'
      : 'proof_runtime_active',
    runtime_fabric:'Evercraft Compute',
    selected_node:selected.node_id,
    selected_endpoint_ref:sha(selected.endpoint),
    placement_labels:selected.placement_labels||[],
    resolver_receipt:resolution.receipt_hash,
    provision_receipt:provisioned.receipt_hash,
    origin:provisioned.origin,
    route_scope:provisioned.route_scope,
    route_verified:provisioned.route_verified,
    provider_transport:provisioned.provider_transport,
    founder_login_required:false,
    selected_endpoint_exposed:false,
    allocator_token_exposed:false,
    activated_at:new Date().toISOString(),
  };
  const receipt={...body,receipt_hash:sha(body)};

  return {
    schema:'evercraft.public-edge.activation-handle.v1',
    receipt,
    resolution,
    controller,
    yard,
    close:async(reason='activation_shutdown')=>
      await controller.close({reason}),
  };
}
