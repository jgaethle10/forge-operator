// Evercraft Worlds route: a dedicated, renewable lease on the EXISTING owned public edge.
// Never opens ports, updates DNS, changes shared Caddy routes or claims public reachability.
import {checkWorldsOrigin} from '../../scripts/probe-worlds-public.mjs';
export const WORLDS_ROUTE_SCHEMA='evercraft.worlds.edge-lease.v1';
const HEX=/^(?:sha256:)?[a-f0-9]{64}$/i;
const INSTANCE=/^[a-z0-9][a-z0-9._-]{2,100}$/i;
const LEASE=/^edge_[a-f0-9]{20}$/;
export function checkedLoopbackUrl(value){
 let url;
 try{url=new URL(value);}catch{throw Error('worlds_edge_loopback_url_required');}
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||
 url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('worlds_edge_loopback_only');
 return url.origin;
}
async function readJson(fetchFn,url,{token='',method='GET',body}={}){
 const result=await fetchFn(url,{method,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000),
  headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})});
 let data;
 try{data=await result.json();}catch{throw Error('worlds_edge_invalid_response');}
 if(!result.ok)throw Error('worlds_edge_request_failed_'+result.status);
 return data;
}
export async function inspectWorldsEdge({edgeControlUrl,vaultUrl,publicOrigin,controlToken='',fetchFn=fetch,allowProof=false}={}){
 const edge=checkedLoopbackUrl(edgeControlUrl),vault=checkedLoopbackUrl(vaultUrl);
 const origin=checkWorldsOrigin(publicOrigin),host=new URL(origin).hostname;
 if(edge===vault)throw Error('worlds_edge_control_is_not_vault');
 const [edgeHealth,caps,vaultHealth]=await Promise.all([
  readJson(fetchFn,edge+'/health',{token:controlToken}),
  readJson(fetchFn,edge+'/v1/public-route/capabilities',{token:controlToken}),
  readJson(fetchFn,vault+'/worlds/api/health')
 ]);
 if(edgeHealth.ok!==true||edgeHealth.service!=='evercraft-public-edge'||!edgeHealth.instance_id)throw Error('worlds_edge_identity_mismatch');
 if(caps.protocol!=='evercraft.public-route.v1'||caps.lease_supported!==true||caps.lease_renewal_supported!==true||caps.release_supported!==true)throw Error('worlds_edge_lease_unsupported');
 if(vaultHealth.schema!=='evercraft.worlds.vault.v1'||vaultHealth.ok!==true||
 vaultHealth.mode!=='owned-durable-vault'||vaultHealth.public_origin!==origin)throw Error('worlds_vault_public_origin_mismatch');
 const proof=caps.proof_only===true;
 if(proof&&!allowProof)throw Error('worlds_edge_proof_only');
 if(!proof&&(caps.https_required!==true||caps.proof_only!==false||
 edgeHealth.public_https!==true||edgeHealth.mode!=='wildcard_https'||caps.hostname_mode!=='wildcard_subdomain'))throw Error('worlds_edge_not_https_admitted');
 if(!proof){
  const base=String(caps.base_domain||'');
  if(!base||host!=='worlds.'+base||host.split('.').length!==base.split('.').length+1)throw Error('worlds_hostname_not_dedicated');
  if(edgeHealth.base_domain!==base)throw Error('worlds_edge_domain_inconsistent');
 }
 return {schema:WORLDS_ROUTE_SCHEMA,ready:true,proof_only:proof,edge_control_url:edge,
  vault_url:vault,public_origin:origin,requested_hostname:'worlds',
  edge_instance_id:edgeHealth.instance_id,edge_mode:edgeHealth.mode,
  external_https_verified:false,write_test_performed:false};
}
function validateBinding(input){
 if(!HEX.test(input.deploymentReceiptHash||''))throw Error('worlds_deployment_receipt_required');
 if(!INSTANCE.test(input.instanceId||''))throw Error('worlds_deployment_instance_required');
}
function validateLease(lease,pre){
 if(!lease||!LEASE.test(lease.lease_id)||lease.protocol!=='evercraft.public-route.v1'||
 lease.upstream_origin!==pre.vault_url||
 lease.deployment_id!=='evercraft-worlds-vault'||lease.stable_hostname!==true||
 lease.wildcard_subdomains!==false)throw Error('worlds_route_lease_mismatch');
 if(!pre.proof_only&&(lease.origin!==pre.public_origin||lease.hostname!==new URL(pre.public_origin).hostname))throw Error('worlds_route_hostname_mismatch');
 if(pre.proof_only&&!lease.origin.startsWith('http://127.0.0.1:'))throw Error('worlds_route_proof_not_local');
 return true;
}
export async function reconcileWorldsRoute(input={}){
 const {edgeControlUrl,controlToken='',fetchFn=fetch,allowProof=false,
 deploymentReceiptHash,instanceId,previousLease=null}=input;
 validateBinding({deploymentReceiptHash,instanceId});
 const pre=await inspectWorldsEdge({...input,fetchFn,allowProof});
 const call=(route,body)=>readJson(fetchFn,pre.edge_control_url+route,{token:controlToken,method:'POST',body});
 const matchPrevious=previousLease&&previousLease.schema===WORLDS_ROUTE_SCHEMA&&
 previousLease.edge_instance_id===pre.edge_instance_id&&
 previousLease.public_origin===pre.public_origin&&
 previousLease.vault_url===pre.vault_url&&
 previousLease.deployment_receipt_hash===deploymentReceiptHash&&
 previousLease.deployment_instance_id===instanceId&&
 LEASE.test(previousLease.lease_id);
 if(previousLease&&!matchPrevious){
  // A restarted edge has a new instance ID. Permit re-leasing only if the
  // original deployment identity, target vault and customer origin are unchanged.
  const identical=previousLease.schema===WORLDS_ROUTE_SCHEMA&&
   previousLease.public_origin===pre.public_origin&&previousLease.vault_url===pre.vault_url&&
   previousLease.deployment_receipt_hash===deploymentReceiptHash&&
   previousLease.deployment_instance_id===instanceId&&LEASE.test(previousLease.lease_id);
  if(!identical)throw Error('worlds_previous_lease_binding_mismatch');
 }
 if(matchPrevious){
  try{
   const renewal=await call('/v1/public-route/leases/'+previousLease.lease_id+'/renew',{ttl_ms:3600000});
   if(renewal.ok!==true||renewal.renewed!==true||renewal.origin_changed!==false||
    renewal.origin!==pre.public_origin&&!pre.proof_only)throw Error('worlds_route_renewal_mismatch');
   const receipt={...previousLease,renewed_at:new Date().toISOString(),expires_at:renewal.expires_at,
    action:'renewed',external_https_verified:false};
   return receipt;
  }catch(err){
   if(err.message!=='worlds_edge_request_failed_404')throw err;
  }
 }
 const newLease=await call('/v1/public-route/leases',{
  upstream_origin:pre.vault_url,deployment_id:'evercraft-worlds-vault',
  deployment_receipt_hash:deploymentReceiptHash,instance_id:instanceId,
  requested_hostname:'worlds',stable_hostname:true,wildcard_subdomains:false,requested_ttl_ms:3600000
 });
 try{validateLease(newLease,pre);}catch(err){
  if(LEASE.test(newLease?.lease_id||'')){
   await call('/v1/public-route/leases/'+newLease.lease_id+'/release',{reason:'worlds_lease_validation_failed'}).catch(()=>{});
  }
  throw err;
 }
 return {schema:WORLDS_ROUTE_SCHEMA,action:'created',proof_only:pre.proof_only,
  lease_id:newLease.lease_id,lease_origin:newLease.origin,edge_instance_id:pre.edge_instance_id,
  public_origin:pre.public_origin,vault_url:pre.vault_url,
  deployment_receipt_hash:deploymentReceiptHash,deployment_instance_id:instanceId,
  expires_at:newLease.expires_at,updated_at:new Date().toISOString(),
  external_https_verified:false,write_test_performed:false};
}
