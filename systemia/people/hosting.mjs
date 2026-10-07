export function peopleLayerServiceSpec(releaseRef,{
  edgeDeploymentId='evercraft-public-edge',
  hostname='people',
}={}){
  if(!/^[a-f0-9]{40}$/i.test(String(releaseRef||'')))throw new Error('release_ref_must_be_immutable_sha');
  return {
    schema:'evercraft.compute.service-spec.v1',
    service_id:'people-layer-production',
    release_ref:String(releaseRef),
    workload_class:'systemia.people-layer.v1',
    capacity_source_deployment_id:edgeDeploymentId,
    input:{},
    input_env:{
      state_root:'PEOPLE_STATE_DIR',
      admin_token_file:'PEOPLE_ADMIN_TOKEN_FILE',
    },
    rollback_target:'evercraft:people-layer-previous',
    lease_ttl_ms:3600000,
    renew_every_ms:1800000,
    health:{
      path:'/health',
      expect:{
        ok:true,
        service:'evercraft-people-layer',
        runtime:'Evercraft Compute',
        base44_runtime_dependency:false,
      },
    },
    route:{
      mode:'public_edge',
      edge_deployment_id:edgeDeploymentId,
      hostname,
      stable_hostname:true,
    },
  };
}
