import { createHash } from 'node:crypto';
import path from 'node:path';
import { YardPublicRouteBroker } from './public-route-broker.mjs';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

function clean(value){return String(value??'').trim();}

export class PublicRelayHostController {
  constructor({yard}={}){
    if(!yard) throw new Error('yard_operator_required');
    this.yard=yard;
  }

  async deploy({
    capacityEndpoint,
    allocatorToken='',
    releaseRef,
    stateRoot,
    brokerDeploymentId='evercraft-public-relay-broker',
    edgeDeploymentId='evercraft-public-relay-edge',
    brokerInput={},
    edgeInput={},
    requestedBrokerHostname='remote-broker',
    routeTtlMs=60*60_000,
    renewEveryMs=30*60_000,
  }={}){
    const endpoint=clean(capacityEndpoint);
    const release=clean(releaseRef);
    const root=path.resolve(clean(stateRoot));
    if(!endpoint) throw new Error('public_relay_capacity_endpoint_required');
    if(!release) throw new Error('public_relay_release_ref_required');
    if(!clean(stateRoot)) throw new Error('public_relay_state_root_required');

    const mode=clean(edgeInput.mode||'proof_loopback')||'proof_loopback';
    const allowLoopbackProof=mode==='proof_loopback';

    let broker=null;
    let edge=null;
    let binding=null;
    try{
      broker=await this.yard.deployRelease({
        deploymentId:brokerDeploymentId,
        releaseRef:release,
        workloadClass:'systemia.remote-capacity-broker.v1',
        capacityEndpoint:endpoint,
        allocatorToken,
        input:{
          ...brokerInput,
          state_root:path.join(root,'broker'),
        },
        rollbackTarget:'public-relay-host:broker-previous',
        leaseTtlMs:Number(brokerInput.lease_ttl_ms||15*60_000),
      });

      edge=await this.yard.deployRelease({
        deploymentId:edgeDeploymentId,
        releaseRef:release,
        workloadClass:'systemia.public-edge.v1',
        capacityEndpoint:endpoint,
        allocatorToken,
        input:{
          ...edgeInput,
          mode,
        },
        rollbackTarget:'public-relay-host:edge-previous',
        leaseTtlMs:Number(edgeInput.lease_ttl_ms||15*60_000),
      });

      const brokerNode=clean(broker.receipt?.capacity_node_id);
      const edgeNode=clean(edge.receipt?.capacity_node_id);
      if(!brokerNode||brokerNode!==edgeNode){
        throw new Error('public_relay_same_node_binding_failed');
      }

      const providerClient=this.yard.publicRouteProviderClient(edgeDeploymentId);
      const routeBroker=new YardPublicRouteBroker({
        yard:this.yard,
        providerClient,
        allowLoopbackProof,
      });
      binding=await routeBroker.bindDeployment(brokerDeploymentId,{
        requestedHostname:requestedBrokerHostname,
        stableHostname:true,
        ttlMs:routeTtlMs,
      });

      this.yard.startLeaseKeeper(brokerDeploymentId,{
        ttlMs:Number(brokerInput.lease_ttl_ms||15*60_000),
        renewEveryMs:Math.min(
          Number(renewEveryMs||30*60_000),
          Math.max(30_000,Number(brokerInput.lease_ttl_ms||15*60_000)/2)
        ),
      });
      this.yard.startLeaseKeeper(edgeDeploymentId,{
        ttlMs:Number(edgeInput.lease_ttl_ms||15*60_000),
        renewEveryMs:Math.min(
          Number(renewEveryMs||30*60_000),
          Math.max(30_000,Number(edgeInput.lease_ttl_ms||15*60_000)/2)
        ),
      });

      const productionReady=
        binding.route_verified===true &&
        binding.route_scope==='public_https' &&
        mode==='wildcard_https';

      const body={
        schema:'evercraft.yard.public-relay-host.v1',
        capacity_node_id:brokerNode,
        broker_deployment_id:brokerDeploymentId,
        broker_deployment_receipt:broker.receipt?.receipt_hash||null,
        edge_deployment_id:edgeDeploymentId,
        edge_deployment_receipt:edge.receipt?.receipt_hash||null,
        route_binding_receipt:binding.receipt_hash||null,
        broker_route_lease_id:binding.route_lease_id||null,
        broker_instance_id:broker.result?.instance_id||null,
        requested_broker_hostname:String(requestedBrokerHostname||'remote-broker'),
        route_ttl_ms:Math.max(60000,Math.min(86400000,Number(routeTtlMs||3600000))),
        broker_origin:binding.origin,
        route_scope:binding.route_scope,
        route_verified:binding.route_verified===true,
        mode,
        production_ready:productionReady,
        private_nodes_require_public_ingress:false,
        private_nodes_connect_outbound:true,
        broker_and_edge_same_node:true,
        continuity_renewal_supported:true,
        allocator_authority_exposed:false,
        tls_private_key_exposed:false,
        created_at:new Date().toISOString(),
      };
      return {...body,receipt_hash:sha(body)};
    }catch(error){
      if(binding?.route_lease_id){
        try{
          const providerClient=this.yard.publicRouteProviderClient(edgeDeploymentId);
          const routeBroker=new YardPublicRouteBroker({
            yard:this.yard,
            providerClient,
            allowLoopbackProof,
          });
          await routeBroker.releaseBinding(binding,{reason:'public_relay_host_deploy_failed'});
        }catch{}
      }
      if(edge){
        try{await this.yard.stopDeployment(edgeDeploymentId,{reason:'public_relay_host_deploy_failed'});}catch{}
      }
      if(broker){
        try{await this.yard.stopDeployment(brokerDeploymentId,{reason:'public_relay_host_deploy_failed'});}catch{}
      }
      throw error;
    }
  }

  async renewRelayHost(relayHost,{ttlMs=60*60_000}={}){
    if(!relayHost||relayHost.schema!=='evercraft.yard.public-relay-host.v1'){
      throw new Error('public_relay_host_receipt_required');
    }
    const allowLoopbackProof=relayHost.route_scope==='loopback_proof';
    const providerClient=this.yard.publicRouteProviderClient(relayHost.edge_deployment_id);
    const routeBroker=new YardPublicRouteBroker({
      yard:this.yard,
      providerClient,
      allowLoopbackProof,
    });
    const renewal=await routeBroker.renewBinding({
      route_lease_id:relayHost.broker_route_lease_id,
      deployment_id:relayHost.broker_deployment_id,
      origin:relayHost.broker_origin,
      route_scope:relayHost.route_scope,
      route_verified:relayHost.route_verified===true,
      instance_id:relayHost.broker_instance_id||null,
    },{ttlMs});
    const body={
      ...relayHost,
      previous_receipt_hash:relayHost.receipt_hash||null,
      route_binding_receipt:renewal.receipt_hash,
      route_ttl_ms:Math.max(60000,Math.min(86400000,Number(ttlMs||3600000))),
      route_expires_at:renewal.expires_at||null,
      route_origin_changed:false,
      continuity_renewal_supported:true,
      renewed_at:renewal.renewed_at||new Date().toISOString(),
    };
    delete body.receipt_hash;
    return {...body,receipt_hash:sha(body)};
  }

  async publishRemoteService({
    relayHost,
    remoteNodeId,
    remoteServiceId,
    bridgeDeploymentId,
    publicDeploymentHostname='service',
    releaseRef,
    capacityEndpoint,
    allocatorToken='',
    edgeDeploymentId,
    ttlMs=30*60_000,
  }={}){
    if(!relayHost||relayHost.schema!=='evercraft.yard.public-relay-host.v1'){
      throw new Error('public_relay_host_receipt_required');
    }
    if(relayHost.production_ready!==true && relayHost.route_scope!=='loopback_proof'){
      throw new Error('public_relay_host_not_verified');
    }

    const allowLoopbackProof=relayHost.route_scope==='loopback_proof';
    const relay=await this.yard.createRemoteServiceRelay(
      relayHost.broker_deployment_id,
      {
        nodeId:remoteNodeId,
        serviceId:remoteServiceId,
        ttlMs,
        allowLoopbackProof,
      }
    );

    let bridge=null;
    let binding=null;
    try{
      bridge=await this.yard.deployRelease({
        deploymentId:bridgeDeploymentId,
        releaseRef,
        workloadClass:'systemia.federated-service-bridge.v1',
        capacityEndpoint,
        allocatorToken,
        input:{
          relay_url:relay.relay_url,
          relay_token:relay.relay_token,
        },
        rollbackTarget:'public-relay-host:bridge-previous',
        leaseTtlMs:ttlMs,
      });

      const providerClient=this.yard.publicRouteProviderClient(edgeDeploymentId);
      const routeBroker=new YardPublicRouteBroker({
        yard:this.yard,
        providerClient,
        allowLoopbackProof,
      });
      binding=await routeBroker.bindDeployment(bridgeDeploymentId,{
        requestedHostname:publicDeploymentHostname,
        stableHostname:true,
        ttlMs,
      });

      this.yard.startLeaseKeeper(bridgeDeploymentId,{
        ttlMs,
        renewEveryMs:Math.max(30_000,Math.min(ttlMs/2,30*60_000)),
      });

      const body={
        schema:'evercraft.yard.public-relayed-service.v1',
        relay_host_receipt:relayHost.receipt_hash,
        broker_deployment_id:relayHost.broker_deployment_id,
        edge_deployment_id:edgeDeploymentId,
        remote_node_id:remoteNodeId,
        remote_service_id:remoteServiceId,
        remote_service_relay_id:relay.relay_id,
        bridge_deployment_id:bridgeDeploymentId,
        bridge_deployment_receipt:bridge.receipt?.receipt_hash||null,
        bridge_route_binding_receipt:binding.receipt_hash||null,
        public_route_lease_id:binding.route_lease_id||null,
        bridge_instance_id:bridge.result?.instance_id||null,
        public_hostname:String(publicDeploymentHostname||'service'),
        remote_service_relay_expires_at:relay.expires_at||null,
        public_origin:binding.origin,
        route_scope:binding.route_scope,
        route_verified:binding.route_verified===true,
        production_ready:
          relayHost.production_ready===true &&
          binding.route_verified===true &&
          binding.route_scope==='public_https',
        private_node_public_ingress:false,
        relay_token_persisted:false,
        continuity_renewal_supported:true,
        allocator_authority_exposed:false,
        created_at:new Date().toISOString(),
      };
      return {...body,receipt_hash:sha(body)};
    }catch(error){
      if(binding?.route_lease_id){
        try{
          const providerClient=this.yard.publicRouteProviderClient(edgeDeploymentId);
          const routeBroker=new YardPublicRouteBroker({
            yard:this.yard,
            providerClient,
            allowLoopbackProof,
          });
          await routeBroker.releaseBinding(binding,{reason:'public_relay_service_publish_failed'});
        }catch{}
      }
      if(bridge){
        try{await this.yard.stopDeployment(bridgeDeploymentId,{reason:'public_relay_service_publish_failed'});}catch{}
      }
      try{
        await this.yard.releaseRemoteServiceRelay(
          relayHost.broker_deployment_id,
          relay.relay_id,
          {reason:'public_relay_service_publish_failed'}
        );
      }catch{}
      throw error;
    }
  async renewRemotePublication(publication,{ttlMs=30*60_000}={}){
    if(!publication||publication.schema!=='evercraft.yard.public-relayed-service.v1'){
      throw new Error('public_relayed_service_receipt_required');
    }
    const relayRenewal=await this.yard.renewRemoteServiceRelay(
      publication.broker_deployment_id,
      publication.remote_service_relay_id,
      {ttlMs}
    );
    if(relayRenewal.renewed!==true){
      throw new Error('remote_service_relay_renewal_failed');
    }
    if(relayRenewal.relay_token_rotated===true){
      throw new Error('remote_service_relay_token_rotation_not_allowed');
    }

    const allowLoopbackProof=publication.route_scope==='loopback_proof';
    const providerClient=this.yard.publicRouteProviderClient(publication.edge_deployment_id);
    const routeBroker=new YardPublicRouteBroker({
      yard:this.yard,
      providerClient,
      allowLoopbackProof,
    });
    const routeRenewal=await routeBroker.renewBinding({
      route_lease_id:publication.public_route_lease_id,
      deployment_id:publication.bridge_deployment_id,
      origin:publication.public_origin,
      route_scope:publication.route_scope,
      route_verified:publication.route_verified===true,
      instance_id:publication.bridge_instance_id||null,
    },{ttlMs});

    const body={
      ...publication,
      previous_receipt_hash:publication.receipt_hash||null,
      bridge_route_binding_receipt:routeRenewal.receipt_hash,
      remote_service_relay_expires_at:relayRenewal.expires_at||null,
      public_route_expires_at:routeRenewal.expires_at||null,
      relay_token_rotated:false,
      route_origin_changed:false,
      continuity_renewal_supported:true,
      renewed_at:new Date().toISOString(),
    };
    delete body.receipt_hash;
    return {...body,receipt_hash:sha(body)};
  }

  }
}
