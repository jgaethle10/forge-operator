import net from 'node:net';

export const PRIVATE_ORIGIN='evercraft.';
const aliasRe=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.evercraft$/;
const reserved=new Set(['www','mail','ns1','ns2','hostmaster','admin','root','localhost','api','systemia']);

export function normalizePrivateAlias(value){
 const name=String(value||'').trim().toLowerCase().replace(/\.$/,'');
 if(!aliasRe.test(name))throw new Error('private_alias_must_be_single_label_dot_evercraft');
 const label=name.split('.')[0];
 if(reserved.has(label))throw new Error('private_alias_reserved');
 return name;
}
export function normalizePublicCandidate(value){
 const domain=String(value||'').trim().toLowerCase().replace(/\.$/,'');
 if(!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:[a-z0-9-]{2,63}\.)*[a-z]{2,63}$/.test(domain)||
   domain.endsWith('.evercraft'))throw new Error('public_domain_candidate_invalid');
 return domain;
}
export function verifyRegistry(registry){
 if(registry?.schema!=='evercraft.domains.registry.v1')throw new Error('registry_schema_invalid');
 if(registry.public_tld_operated!==false||registry.public_top_level_domain_registered!==false)throw new Error('public_tld_claim_not_supported');
 if(registry.policy?.no_public_dns_mutation!==true||
    registry.policy?.no_external_registrar_mutation!==true||
    registry.policy?.no_customer_publication_without_owner_approval!==true)throw new Error('policy_hold_required');
 const ids=new Set(),aliases=new Set();
 for(const entry of registry.names||[]){
  if(!/^[a-z0-9][a-z0-9-]{2,95}$/.test(String(entry.client_id||'')))throw new Error('client_id_invalid');
  const alias=normalizePrivateAlias(entry.alias);
  normalizePublicCandidate(entry.public_domain_candidate);
  if(ids.has(entry.client_id)||aliases.has(alias))throw new Error('duplicate_client_or_alias');
  ids.add(entry.client_id);aliases.add(alias);
  if(entry.private_dns_published!==false||entry.public_dns_delegated!==false||
     entry.customer_website_live!==false)throw new Error('registry_publication_claim_not_verified');
 }
 return {ok:true,count:aliases.size,aliases:[...aliases]};
}
export function planAlias(registry,alias){
 verifyRegistry(registry);
 const key=normalizePrivateAlias(alias);
 const entry=(registry.names||[]).find(e=>e.alias===key);
 if(!entry)throw new Error('alias_not_in_registry');
 const ownerApproved=entry.customer_approval==='verified';
 return {
  schema:'evercraft.domains.alias-plan.v1',
  alias:key,
  client_id:entry.client_id,
  private_scope:'operator_configured_resolvers_only',
  public_tld_delegated:false,
  private_record_published:false,
  site_reachable:false,
  tls_trusted:false,
  owner_approval_verified:ownerApproved,
  public_candidate:entry.public_domain_candidate,
  public_candidate_registered:entry.registrar_registration==='verified',
  customer_promotion_authorized:false,
  state:'HOLD',
  blockers:[
   ...(!ownerApproved?['client_identity_and_alias_approval_missing']:[]),
   'private_resolver_distribution_not_verified',
   'private_edge_binding_not_verified',
   'private_tls_trust_not_verified',
   'public_dot_evercraft_not_delegated'
  ]
 };
}
/** DNS-only, explicitly synthetic, loopback scoped. Never client production. */
export function buildLoopbackLabZone(registry,alias,{serial=2026111901}={}){
 const plan=planAlias(registry,alias);
 if(!Number.isInteger(serial)||serial<1)throw new Error('serial_invalid');
 const label=plan.alias.split('.')[0];
 return {
  origin:PRIVATE_ORIGIN,
  serial,
  default_ttl:60,
  primary_ns:'ns1.evercraft.',
  admin:'hostmaster.evercraft.',
  nameservers:['ns1.evercraft.','ns2.evercraft.'],
  records:[
   {name:label,type:'A',value:'127.0.0.1'},
   {name:'_evercraft.'+label,type:'TXT',value:'scope=loopback_dns_lab;website=not_deployed;tls=not_verified'}
  ]
 };
}
/** Promote a future private mapping only with real site, identity and TLS evidence. */
export function evaluatePrivateRelease({alias,clientApproved=false,resolverConfigured=false,
 edgeVerified=false,tlsTrustVerified=false,authorizationVerified=false}={}){
 const normalized=normalizePrivateAlias(alias);
 const gates={
  client_approved:clientApproved===true,
  private_resolver_configured:resolverConfigured===true,
  evercraft_edge_verified:edgeVerified===true,
  private_tls_trust_verified:tlsTrustVerified===true,
  authorized_publication:authorizationVerified===true
 };
 return {schema:'evercraft.domains.private-release-gate.v1',alias:normalized,
  eligible:Object.values(gates).every(Boolean),gates,
  blockers:Object.entries(gates).filter(([,v])=>!v).map(([k])=>k)};
}
/** Registry publication status is not the same thing as a public .com registration. */
export function evaluatePublicDomain({domain,registrarOwned=false,delegationProven=false,
 certificateVerified=false,siteVerified=false,clientApproved=false}={}){
 const name=normalizePublicCandidate(domain);
 const gates={
  registered_and_controlled:registrarOwned===true,
  delegated_and_observed:delegationProven===true,
  trusted_tls_verified:certificateVerified===true,
  exact_host_site_verified:siteVerified===true,
  client_approved:clientApproved===true
 };
 return {schema:'evercraft.domains.public-domain-gate.v1',
  domain:name,eligible:Object.values(gates).every(Boolean),gates,
  blockers:Object.entries(gates).filter(([,v])=>!v).map(([k])=>k),
  public_dns_mutated:false};
}
export function enforceLabBind(host,port){
 if(host!=='127.0.0.1')throw new Error('lab_must_bind_ipv4_loopback_only');
 if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('lab_port_must_be_unprivileged');
 return {host,port,network_scope:'loopback_only'};
}
