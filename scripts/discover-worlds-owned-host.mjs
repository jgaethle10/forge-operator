// Discover the candidate Worlds hostname from a RUNNING, TLS-admitted owned edge.
// Read-only: loopback GET requests by default, optional external HTTPS GET checks.
// The candidate is never evidence of DNS ownership, route lease or public launch.
import {checkedLoopbackUrl} from '../systemia/worlds/worlds-edge-route.mjs';
import {checkWorldsOrigin} from './probe-worlds-public.mjs';
import {auditWorldsReadiness} from './audit-worlds-owned-readiness.mjs';

export const DISCOVERY_SCHEMA='evercraft.worlds.owned-host-discovery.v1';
const no=(status,reason,extra={})=>({schema:DISCOVERY_SCHEMA,mode:'read_only',
 status,reason,public_https_verified:false,physical_iphone_verified:false,
 customer_write_verified:false,lease_modified:false,settings_modified:false,...extra});
async function localJson(fetchFn,url,token=''){
 const res=await fetchFn(url,{method:'GET',redirect:'error',cache:'no-store',
  headers:token?{authorization:'Bearer '+token}:{},signal:AbortSignal.timeout(5000)});
 if(res.status!==200)throw Error('http_not_200');
 return res.json();
}
function edgeCandidate(health,caps,now){
 if(health?.ok!==true||health?.service!=='evercraft-public-edge'||
  !/^public_edge_[a-f0-9]{24}$/.test(String(health.instance_id||'')))throw Error('edge_identity_not_verified');
 if(health.mode!=='wildcard_https'||health.public_https!==true||
  caps?.protocol!=='evercraft.public-route.v1'||caps.proof_only!==false||
  caps.https_required!==true||caps.hostname_mode!=='wildcard_subdomain'||
  caps.lease_supported!==true||caps.lease_renewal_supported!==true||
  caps.release_supported!==true)throw Error('edge_not_tls_admitted');
 const domain=String(health.base_domain||'').toLowerCase();
 if(!domain||domain!==caps.base_domain||domain!==health.tls_admission?.base_domain||
   health.tls_admission?.ready!==true||!health.tls_admission.hostname_match)
   throw Error('edge_domain_or_certificate_mismatch');
 const validUntil=Date.parse(health.tls_admission.certificate_valid_to||'');
 if(!Number.isFinite(validUntil)||validUntil-now<72*3600000)
   throw Error('edge_certificate_expired_or_expiring');
 // The only candidate comes from the live owned edge's matching TLS domain.
 // This is NOT a DNS, HTTPS, ownership or lease verification.
 const origin=checkWorldsOrigin('https://worlds.'+domain);
 return {origin,domain,cert_expiry:health.tls_admission.certificate_valid_to};
}
export async function discoverWorldsOwnedHost({
 edgeControlUrl='http://127.0.0.1:18081',
 vaultUrl='http://127.0.0.1:8788',controlToken='',
 fetchFn=fetch,external=false,externalAuditor=auditWorldsReadiness,
 now=()=>Date.now()
}={}){
 let edge,vault;
 try{
  edge=checkedLoopbackUrl(edgeControlUrl);
  vault=checkedLoopbackUrl(vaultUrl);
  if(edge===vault)throw Error('shared_listener');
 }catch{return no('blocked_invalid_loopback','only distinct 127.0.0.1 control and vault listeners allowed');}
 let health,caps;
 try{[health,caps]=await Promise.all([
  localJson(fetchFn,edge+'/health',controlToken),
  localJson(fetchFn,edge+'/v1/public-route/capabilities',controlToken)
 ]);}catch{return no('blocked_edge_unavailable','owned_edge_loopback_health_or_capabilities_unavailable');}
 let candidate;
 try{candidate=edgeCandidate(health,caps,now());}
 catch(err){return no('blocked_edge_admission',String(err.message||'edge_not_admitted').slice(0,100));}
 const base={candidate_origin:candidate.origin,candidate_source:'owned_edge_tls_admission',
  candidate_verified_publicly:false,edge_mode:health.mode,
  edge_deployment_receipt_bound:health.deployment_receipt_bound===true,
  tls_certificate_valid_to:candidate.cert_expiry};
 let vaultHealth;
 try{vaultHealth=await localJson(fetchFn,vault+'/worlds/api/health');}
 catch{return no('blocked_local_vault','worlds_vault_loopback_unavailable',base);}
 if(vaultHealth?.schema!=='evercraft.worlds.vault.v1'||vaultHealth.ok!==true||
  vaultHealth.mode!=='owned-durable-vault')
  return no('blocked_local_vault','worlds_vault_identity_mismatch',base);
 if(vaultHealth.public_origin!==candidate.origin)
  return no('blocked_vault_origin','vault_not_pinned_to_edge_candidate',base);
 if(!external)return no('candidate_for_external_probe',
  'verify_dns_https_and_exact_worlds_lease_before_setting_repository_variable',base);
 let report;
 try{report=await externalAuditor(candidate.origin);}
 catch{return no('external_probe_failed','read_only_external_probe_exception',base);}
 if(report?.verified!==true||report.origin!==candidate.origin)
   return no('external_probe_failed',String(report?.status||'external_not_verified').slice(0,100),
     {...base,external_checks:report?.checks||null});
 return {...no('verified_readonly','external_https_get_probes_passed',base),
   public_https_verified:true,external_checks:report.checks,
   deployment_approved:false,physical_iphone_verified:false,customer_write_verified:false};
}
function flag(name){const i=process.argv.indexOf('--'+name);return i<0?'':process.argv[i+1]||'';}
if(process.argv[1]?.endsWith('discover-worlds-owned-host.mjs')){
 if(process.argv.includes('--help')){
  console.log('Read-only: node scripts/discover-worlds-owned-host.mjs [--external] [--edge-control http://127.0.0.1:18081] [--vault http://127.0.0.1:8788]');
 }else{
  discoverWorldsOwnedHost({
   edgeControlUrl:flag('edge-control')||'http://127.0.0.1:18081',
   vaultUrl:flag('vault')||'http://127.0.0.1:8788',
   controlToken:process.env.EVERCRAFT_EDGE_CONTROL_TOKEN||'',
   external:process.argv.includes('--external')
  }).then(receipt=>{
   console.log(JSON.stringify(receipt,null,2));
   if(!['candidate_for_external_probe','verified_readonly'].includes(receipt.status))process.exitCode=2;
  }).catch(()=>{console.log(JSON.stringify(no('diagnostic_exception','read_only_host_discovery_failed')));process.exitCode=2;});
 }
}
