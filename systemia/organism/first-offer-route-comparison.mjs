#!/usr/bin/env node
/** Read-only external origin comparison. HTTP reachability != offer checkout. */
import {writeFile,appendFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const HOST='https://fabric.systemiacommandcenters.com';
const PATHS=Object.freeze({
 health:'/health',
 generic_ibmi:'/offers/ibmi-rescue',
 ibmi_74:'/offers/ibmi-74-deadline-xray',
});
const routeStatus=async(key,route,{request,timeoutMs})=>{
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const res=await request(HOST+route,{
   method:'GET',redirect:'manual',signal:controller.signal,
   headers:{accept:'text/html,application/json','user-agent':'Evercraft-Offer1-Route-Comparison/1.0'}
  });
  // Do not save customer or private data, cookies, headers or response bodies.
  if(res?.body&&typeof res.body.cancel==='function')await res.body.cancel().catch(()=>{});
  return {key,http_status:Number(res.status),reachable:true,transport_error:null,
    redirected:Number(res.status)>=300&&Number(res.status)<400};
 }catch(e){
  return {key,http_status:null,reachable:false,
   transport_error:String(e?.cause?.code||e?.code||e?.name||'fetch_error').slice(0,80),
   redirected:false};
 }finally{clearTimeout(timer);}
};
export async function compareFirstOfferRoutes({request=fetch,now=new Date(),timeoutMs=7000}={}){
 const checkedAt=new Date(now).toISOString();
 const values=await Promise.all(Object.entries(PATHS).map(([key,p])=>routeStatus(key,p,{request,timeoutMs})));
 const statuses=Object.fromEntries(values.map(({key,...rest})=>[key,rest]));
 const a=statuses.health.http_status;
 const b=statuses.generic_ibmi.http_status;
 const c=statuses.ibmi_74.http_status;
 let diagnosis='public_origin_transport_or_tls_unverified';
 let next='repair_or_verify_owned_external_ingress';
 if(values.every(x=>x.reachable)){
   if(c===404&&a===200&&b===200){
     diagnosis='new_7_4_variant_absent_existing_ibmi_route_healthy';
     next='review_protected_fabric_7_4_variant_release_and_exact_checkout_guard';
   }else if(c===404&&a===200&&b===404){
     diagnosis='offer_router_or_catalog_missing_from_healthy_origin';
     next='inspect_catalog_and_owned_fabric_offer_route_binding';
   }else if(c===404&&a===404&&b===404){
     diagnosis='public_origin_returns_not_found_for_all_tested_routes';
     next='verify_public_edge_virtual_host_deployment_and_router_binding';
   }else if(c===200){
     diagnosis='specific_7_4_path_http_200_not_content_or_checkout_verified';
     next='verify_exact_buyer_page_contents_then_provider_checkout';
   }else{
     diagnosis='public_origin_http_responses_incomplete';
     next='inspect_individual_route_responses_and_public_release';
   }
 }
 return {
  schema:'evercraft.systemia.offer-one.public-route-comparison.v1',
  checked_at:checkedAt,
  origin:HOST,requests:'three_read_only_gets_no_redirect_follow',
  statuses,diagnosis,next_action:next,
  independent_page_content_verified:false,
  exact_checkout_verified:false,customer_payment_verified:false,
  no_release_authority:true,no_network_mutation:true,
 };
}
export function renderFirstOfferRouteComparison(r){
 return [
  '### Offer #1 public HTTP route comparison','','| Path | HTTP status |','| --- | --- |',
  ...Object.entries(PATHS).map(([key,p])=>'| `'+p+'` | '+(r.statuses[key].http_status??'unreachable')+' |'),
  '','Diagnosis: `'+r.diagnosis+'`',
  '','Next action: `'+r.next_action+'`',
  '','An HTTP response does not establish exact offer checkout, payment or authorization.',''
 ].join('\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const outputPath=process.argv[2]||'first-offer-route-comparison.json';
 const result=await compareFirstOfferRoutes();
 await writeFile(outputPath,JSON.stringify(result,null,2)+'\n');
 if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,renderFirstOfferRouteComparison(result));
 process.stdout.write(JSON.stringify({
  diagnosis:result.diagnosis,
  health:result.statuses.health.http_status,
  generic_ibmi:result.statuses.generic_ibmi.http_status,
  ibmi_74:result.statuses.ibmi_74.http_status,
  checkout_verified:false,
 })+'\n');
}
