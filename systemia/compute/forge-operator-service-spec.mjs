const DEFAULT_REPOSITORY='ghcr.io/jgaethle10/forge-operator';

function clean(value){return String(value||'').trim();}

export function buildForgeOperatorServiceSpec({
  releaseRef,
  imageDigest,
  releaseReceiptRef,
  hostname='forge',
  edgeDeploymentId='evercraft-public-edge',
  capacitySourceDeploymentId='evercraft-public-edge',
  repository=DEFAULT_REPOSITORY,
  requireAiReady=true,
  leaseTtlMs=60*60*1000,
  renewEveryMs=30*60*1000,
}={}){
  const release=clean(releaseRef).toLowerCase();
  const digest=clean(imageDigest).toLowerCase();
  const receipt=clean(releaseReceiptRef);
  if(!/^[a-f0-9]{40}$/.test(release)) throw new Error('forge_release_ref_invalid');
  if(!/^sha256:[a-f0-9]{64}$/.test(digest)) throw new Error('forge_image_digest_invalid');
  if(!receipt) throw new Error('forge_release_execution_receipt_required');
  if(!/^[a-z0-9][a-z0-9.-]{0,62}$/i.test(clean(hostname))) throw new Error('forge_hostname_invalid');

  return {
    schema:'evercraft.compute.service-spec.v1',
    service_id:'forge-operator-production',
    release_ref:release,
    workload_class:'systemia.forge-operator-runtime.v1',
    capacity_source_deployment_id:clean(capacitySourceDeploymentId),
    input:{
      image_digest:digest,
      release_receipt_ref:receipt,
      repository:clean(repository)||DEFAULT_REPOSITORY,
      require_ai_ready:requireAiReady!==false,
    },
    rollback_target:'evercraft:forge-operator-previous',
    lease_ttl_ms:Number(leaseTtlMs),
    renew_every_ms:Number(renewEveryMs),
    health:{
      path:'/api/health',
      expect:{
        ok:true,
        service:'forge-operator',
        runtime:'Evercraft Compute',
        workload_class:'systemia.forge-operator-runtime.v1',
        immutable_container:true,
        university_benchmark_ingress_ready:true,
        university_remote_persistence:false,
        university_public_write_allowed:false,
      },
    },
    route:{
      mode:'public_edge',
      edge_deployment_id:clean(edgeDeploymentId),
      hostname:clean(hostname),
      stable_hostname:true,
    },
  };
}
