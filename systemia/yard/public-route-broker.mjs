import { createHash, randomBytes } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

function normalizeEndpoint(value){
  const raw=String(value||'').trim();
  if(!raw) throw new Error('route_provider_endpoint_required');
  const url=new URL(raw);
  if(!['http:','https:'].includes(url.protocol)) throw new Error('route_provider_protocol_invalid');
  return url.origin;
}

async function requestJson(url,options={}){
  const response=await fetch(url,{
    ...options,
    headers:{'content-type':'application/json',...(options.headers||{})},
  });
  const body=await response.json().catch(()=>null);
  if(!response.ok) throw new Error(body?.error||`route_provider_http_${response.status}`);
  return body;
}

export class YardPublicRouteBroker {
  constructor({yard,providerEndpoint,providerToken='',allowLoopbackProof=false}={}){
    if(!yard) throw new Error('yard_operator_required');
    this.yard=yard;
    this.providerEndpoint=normalizeEndpoint(providerEndpoint);
    this.providerToken=String(providerToken||'');
    this.allowLoopbackProof=Boolean(allowLoopbackProof);
  }

  async capabilities(){
    const headers=this.providerToken?{authorization:`Bearer ${this.providerToken}`}:{};
    const offer=await requestJson(this.providerEndpoint+'/v1/public-route/capabilities',{headers});
    if(offer?.protocol!=='evercraft.public-route.v1') throw new Error('public_route_protocol_mismatch');
    if(offer?.https_required!==true && this.allowLoopbackProof!==true){
      throw new Error('public_route_provider_must_require_https');
    }
    return offer;
  }

  async bindDeployment(deploymentId,{requestedHostname='',ttlMs=3600000}={}){
    const record=this.yard.deploymentStatus(deploymentId);
    if(!record) throw new Error('deployment_not_found');
    if(record.state!=='ready') throw new Error('deployment_not_ready');
    if(!record.result?.local_url) throw new Error('resident_local_url_unavailable');
    if(!record.result?.instance_id) throw new Error('resident_instance_id_unavailable');

    const offer=await this.capabilities();
    const requestId='route_'+randomBytes(10).toString('hex');
    const headers=this.providerToken?{authorization:`Bearer ${this.providerToken}`}:{};
    const lease=await requestJson(this.providerEndpoint+'/v1/public-route/leases',{
      method:'POST',
      headers,
      body:JSON.stringify({
        request_id:requestId,
        deployment_id:deploymentId,
        workload_class:record.receipt?.workload_class||null,
        deployment_receipt_hash:record.receipt?.receipt_hash||null,
        instance_id:record.result.instance_id,
        upstream_origin:record.result.local_url,
        requested_hostname:String(requestedHostname||'').trim()||null,
        requested_ttl_ms:Math.max(60000,Math.min(86400000,Number(ttlMs||3600000))),
      }),
    });

    const releaseBadLease=async(reason)=>{
      if(!lease?.lease_id) return;
      try{
        await requestJson(
          this.providerEndpoint+'/v1/public-route/leases/'+encodeURIComponent(lease.lease_id)+'/release',
          {method:'POST',headers,body:JSON.stringify({reason})}
        );
      }catch{}
    };

    if(lease?.protocol!=='evercraft.public-route.v1') {
      await releaseBadLease('protocol_mismatch');
      throw new Error('public_route_lease_protocol_mismatch');
    }
    if(lease?.deployment_receipt_hash!==record.receipt?.receipt_hash) {
      await releaseBadLease('deployment_receipt_mismatch');
      throw new Error('public_route_deployment_receipt_mismatch');
    }
    if(lease?.instance_id!==record.result.instance_id) {
      await releaseBadLease('instance_mismatch');
      throw new Error('public_route_instance_mismatch');
    }
    if(!lease?.origin) {
      await releaseBadLease('origin_missing');
      throw new Error('public_route_origin_missing');
    }

    let verified;
    try{
      verified=await this.yard.verifyPublicRoute(deploymentId,{
        origin:lease.origin,
        allowLoopbackProof:this.allowLoopbackProof,
      });
    }catch(error){
      await releaseBadLease('verification_failed');
      throw error;
    }

    const body={
      schema:'evercraft.yard.public-route-binding.v1',
      deployment_id:deploymentId,
      workload_class:record.receipt?.workload_class||null,
      provider:offer.provider||null,
      provider_protocol:offer.protocol,
      route_lease_id:lease.lease_id||null,
      origin:verified.origin,
      route_scope:verified.scope,
      route_verified:verified.verified,
      deployment_receipt_hash:record.receipt.receipt_hash,
      public_route_receipt_hash:verified.receipt_hash,
      instance_id:record.result.instance_id,
      bound_at:new Date().toISOString(),
    };
    return {...body,receipt_hash:sha(body)};
  }
}
