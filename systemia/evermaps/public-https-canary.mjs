/** Strict external HTTPS canary: no deployment or authority grant. */
const HASH=/^[0-9a-f]{64}$/;
export function normalizeEvermapsOwnedOrigin(raw){
 const u=new URL(String(raw||''));
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||
    u.pathname!=='/'||u.port)throw Error('evermaps_owned_public_https_origin_required');
 if(!/^[a-z0-9.-]+$/i.test(u.hostname)||u.hostname==='localhost'||
    u.hostname.endsWith('.local'))throw Error('evermaps_public_hostname_required');
 return u.origin;
}
export async function verifyEvermapsOwnedHttps({
 origin,expectedWgsSha256,fetchImpl=fetch,now=()=>new Date().toISOString()
}={}){
 const base=normalizeEvermapsOwnedOrigin(origin);
 if(!HASH.test(String(expectedWgsSha256||'')))throw Error('expected_verified_wgs_sha256_required');
 const targets=['/evermaps/api/health','/evermaps/','/evermaps/research/','/evermaps/research.csv'];
 const responses=[];
 for(const target of targets){
  const response=await fetchImpl(base+target,{method:'GET',
   headers:{accept:target.includes('api/health')?'application/json':'*/*'},
   signal:AbortSignal.timeout(20000),redirect:'error'});
  if(!response?.ok)throw Error('evermaps_https_route_failed:'+target+':'+(response?.status??'unknown'));
  responses.push(response);
 }
 const [healthRes,mapRes,indexRes,csvRes]=responses;
 const h=await healthRes.json();
 const html=await mapRes.text();
 if(h?.ok!==true||h.service!=='evermaps-research'||
    h.wgs_source_sha256!==expectedWgsSha256||
    h.source_dependencies_verified!==true||
    h.mining_site_recommendations_authorized!==false||
    h.public_https_route_verified!==false||
    !Number.isSafeInteger(h.research_record_count)||h.research_record_count<1)
  throw Error('evermaps_public_health_contract_mismatch');
 if(!html.includes('id="mobile-static-preview"')||
    !html.includes('Object.assign(data,')||
    !html.includes('preview.hidden=true')||
    !String(mapRes.headers.get('content-type')).includes('text/html')||
    !String(mapRes.headers.get('content-security-policy')).includes("connect-src 'none'")||
    !String(indexRes.headers.get('content-type')).includes('text/html')||
    !String(csvRes.headers.get('content-type')).includes('text/csv'))
  throw Error('evermaps_public_page_contract_mismatch');
 return {
  schema:'evercraft.evermaps.public-https-route-receipt.v1',
  result:'public_https_verified',
  origin:base,
  wgs_source_sha256:expectedWgsSha256,
  geology_research_records:h.research_record_count,
  source_dependency_health:'verified_at_release',
  map_mobile_fallback_verified:true,
  map_interactive_bootstrap_present:true,
  authorized_mining_sites:false,
  payment_or_external_action_taken:false,
  observed_at:now(),
  caveat:'Browser HTTPS/response canary only. Does not verify iPhone touch interactions, rights, permits, mineability, or environmental clearance.'
 };
}
