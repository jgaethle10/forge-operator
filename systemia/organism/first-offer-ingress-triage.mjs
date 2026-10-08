#!/usr/bin/env node
/**
 * Read-only reconciliation of external Offer #1 GET probe and an optional
 * locally captured Fabric edge doctor receipt.
 *
 * This is an operator decision aid, not a native authority, not a network
 * repair action, and not a production availability certificate. The input
 * JSON files can be supplied by anyone; provenance must be checked at source.
 */
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { OFFER_ONE_URL } from './first-offer-external-probe.mjs';

const clean=(value,max=120)=>String(value??'').trim().slice(0,max);
const AGE_MS=60*60*1000;
const DOCTOR_AGE_MS=20*60*1000;
const FUTURE_SKEW_MS=5*60*1000;
const EXPECTED_HOST='fabric.systemiacommandcenters.com';
const fresh=(value,nowMs,maxAge)=>{
 const seen=Date.parse(clean(value));
 return Number.isFinite(seen)&&seen<=nowMs+FUTURE_SKEW_MS&&seen>=nowMs-maxAge;
};
function probeAuthority(value,nowMs){
 if(!value||value.schema!=='evercraft.systemia.offer-one.external-buyer-probe.v1')return 'external_probe_schema_invalid';
 if(value.url!==OFFER_ONE_URL)return 'external_probe_wrong_origin';
 if(!fresh(value.checked_at,nowMs,AGE_MS))return 'external_probe_missing_or_stale';
 if(value.checked_from!=='independent_http_client')return 'external_probe_source_unverified';
 return null;
}
function doctorAuthority(value,nowMs){
 if(!value)return 'local_doctor_not_supplied';
 if(value.schema!=='evercraft.fabric-edge-doctor.v1')return 'local_doctor_schema_invalid';
 if(value.domain!==EXPECTED_HOST)return 'local_doctor_wrong_origin';
 if(!fresh(value.observed_at,nowMs,DOCTOR_AGE_MS))return 'local_doctor_missing_or_stale';
 if(value.router_refresh_requested!==false)return 'local_doctor_was_not_read_only';
 if(![true,false].includes(value.local_fabric_ok))return 'local_fabric_health_unknown';
 if(![true,false].includes(value.local_edge_https_listener_ok))return 'local_edge_https_listener_unknown';
 return null;
}
export function reconcileFirstOfferIngress({external,doctor=null,now=new Date()}={}){
 const nowMs=new Date(now).getTime();
 if(!Number.isFinite(nowMs))throw new Error('valid_now_required');
 const extHold=probeAuthority(external,nowMs);
 const localHold=doctorAuthority(doctor,nowMs);
 const base={
   schema:'evercraft.systemia.offer-one-ingress-triage.v1',
   offer_url:OFFER_ONE_URL,
   generated_at:new Date(nowMs).toISOString(),
   evidence:{
     external_probe_usable:extHold===null,
     external_probe_hold:extHold,
     local_doctor_usable:localHold===null,
     local_doctor_hold:localHold,
     external_tcp_443:clean(external?.ingress?.tcp_443||'not_observed'),
     external_dns:clean(external?.ingress?.dns||'not_observed'),
     external_page_verified:extHold===null&&external?.verified===true,
     local_health:localHold===null?doctor.local_fabric_ok:null,
     local_https_listener:localHold===null?doctor.local_edge_https_listener_ok:null,
     local_router_refresh_requested:doctor?.router_refresh_requested??null,
   },
   status:'held',
   diagnosis:'undetermined',
   next_action:'collect_external_probe',
   candidate_causes:[],
   external_probe_assertions_are_not_cryptographically_authenticated:true,
   local_doctor_assertions_are_not_cryptographically_authenticated:true,
   no_router_dns_firewall_mutation:true,
   no_remote_shell_action:true,
   no_outreach_authority:true,
   no_deployment_authority:true,
   no_checkout_authority:true,
   public_offer_release_verified:false,
   provider_checkout_verified:false,
   settled_customer_payment_verified:false,
 };
 const decided=(diagnosis,next,candidates=[])=>({
   ...base,diagnosis,next_action:next,candidate_causes:candidates
 });
 if(extHold)return decided(extHold,'run_independent_external_read_only_offer_probe');
 if(external.verified===true&&external.state==='externally_verified_buyer_page'){
   // A page GET proves page text only. Commercial and deployment gates remain separate.
   return decided('buyer_page_get_visible','verify_yard_release_specialist_and_exact_provider_checkout');
 }
 if(external.ingress?.dns==='error'||external.ingress?.dns==='no_ipv4'){
   return decided('public_dns_unresolved','verify_authoritative_dns_and_expected_public_address');
 }
 if(external.ingress?.tcp_443==='reachable'){
   return decided('public_tcp_open_but_http_or_tls_unproved','inspect_tls_certificate_sni_and_http_route');
 }
 if(external.ingress?.tcp_443==='timeout' || external.reason==='public_tcp_443_unreachable'
   || external.ingress?.tcp_443==='ECONNREFUSED'){
   if(localHold)return decided('public_443_unreachable_local_state_unknown',
     'collect_fresh_unmodified_local_fabric_edge_doctor_receipt',
     ['local_listener','chromeos_forwarding','router_nat_or_firewall','isp_or_upstream_ingress','public_ip_binding']);
   if(doctor.local_fabric_ok===false)return decided('local_fabric_unhealthy',
      'diagnose_local_127_0_0_1_8787_service_before_external_mapping');
   if(doctor.local_edge_https_listener_ok===false)return decided('local_https_8443_listener_unhealthy',
      'diagnose_local_https_listener_and_service_before_forwarding');
   const dnsIp=clean(doctor.dns_ipv4);
   const publicIp=clean(doctor.public_ipv4_seen_inside);
   if(dnsIp&&publicIp&&dnsIp!==publicIp)return decided('dns_to_public_ip_mismatch',
      'independently_confirm_isp_dns_and_owned_public_address_before_authorized_change');
   if(doctor.ingress_transport==='outbound_service_relay')return decided('public_relay_path_unverified',
      'verify_existing_owned_relay_broker_and_public_tls_readback');
   return decided('public_443_blocked_beyond_healthy_local_listeners',
     'inspect_chromeos_host_forwarding_router_firewall_upstream_and_existing_relay_without_mutation',
     ['chromeos_forwarding','router_nat_or_firewall','isp_or_upstream_ingress','public_ip_binding']);
 }
 return decided('external_offer_route_unverified','collect_http_tls_and_local_edge_diagnostics');
}
export function renderFirstOfferIngressTriage(value){
 return [
   '### Offer #1: owned public ingress diagnosis',
   '',
   '| Evidence | Current result |',
   '| --- | --- |',
   '| Independent TCP 443 | '+value.evidence.external_tcp_443+' |',
   '| External DNS | '+value.evidence.external_dns+' |',
   '| Local read-only doctor | '+(value.evidence.local_doctor_usable?'Supplied and temporally valid':'Unavailable or unverified')+' |',
   '| Buyer checkout | Not verified |',
   '',
   'Diagnosis: `'+value.diagnosis+'`',
   '',
   'Next bounded action: `'+value.next_action+'`',
   '',
   'No router, DNS or firewall changes are authorized by this result.',
   '',
 ].join('\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [externalPath,outputPath,doctorPath]=process.argv.slice(2);
 if(!externalPath||!outputPath)throw Error('expected_external_probe_and_output_paths');
 const external=JSON.parse(await readFile(externalPath,'utf8'));
 const doctor=doctorPath?JSON.parse(await readFile(doctorPath,'utf8')):null;
 const result=reconcileFirstOfferIngress({external,doctor});
 await writeFile(outputPath,JSON.stringify(result,null,2)+'\n');
 if(process.env.GITHUB_STEP_SUMMARY){
   await appendFile(process.env.GITHUB_STEP_SUMMARY,renderFirstOfferIngressTriage(result));
 }
 process.stdout.write(JSON.stringify({
   diagnosis:result.diagnosis,next_action:result.next_action,
   external_tcp_443:result.evidence.external_tcp_443,
   public_offer_release_verified:false,
   provider_checkout_verified:false,
 })+'\n');
}
