#!/usr/bin/env node
/**
 * Independent, read-only Offer #1 gateway tier inspection.
 * Never calls prepare_verified_checkout, creates orders or verifies settlement.
 * A listing returned by a caller-supplied endpoint is a claim, not a signed
 * merchant/payment receipt and does not authorize distribution.
 */
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {checkIBMi74TierListing,DEADLINE_KEY} from './ibmi-74-offer-contract.mjs';

const clean=value=>String(value??'').trim();
const MAX_BYTES=64000;
export function normalizeMachineCommerceGateway(input){
 const raw=clean(input);
 if(!raw)return null;
 const u=new URL(raw);
 if(u.protocol!=='https:'||u.username||u.password||u.port||
    u.hash||u.hostname==='base44.app'||u.hostname.endsWith('.base44.app')){
   throw new Error('owned_https_machine_commerce_gateway_required');
 }
 if(u.hostname==='localhost'||u.hostname.endsWith('.localhost')||
   u.hostname.includes(':') || u.hostname.startsWith('[') ||
   /^(?:127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/.test(u.hostname)){
   throw new Error('private_or_loopback_gateway_prohibited');
 }
 return u;
}
export async function inspectIBMi74Tier({
 gateway=process.env.EVERCRAFT_MACHINE_COMMERCE_GATEWAY_URL||
  process.env.EVERCRAFT_MACHINE_COMMERCE_GATEWAY||'',
 request=fetch,now=new Date(),timeoutMs=12000
}={}){
 const receipt={
  schema:'evercraft.systemia.ibmi-74.owned-tier-readonly-canary.v1',
  checked_at:new Date(now).toISOString(),
  offer_key:DEADLINE_KEY,
  public_id:'ibmi-rescue-v1',
  request_method:'GET',
  status:'held',reason:'gateway_not_configured',http_status:null,
  tier_listed:false,exact_price_verified:false,
  gateway_response_is_not_signed_payment_authority:true,
  checkout_attempted:false,checkout_verified:false,
  provider_settlement_verified:false,payment_attempted:false,
  public_release_authorized:false,outbound_contact_authorized:false,
 };
 if(!clean(gateway))return receipt;
 let target;
 try{
  target=normalizeMachineCommerceGateway(gateway);
  if(!target) return receipt;
  target.searchParams.set('action','get_live_checkout_offer');
  target.searchParams.set('public_id','ibmi-rescue-v1');
 }catch{
  return {...receipt,reason:'gateway_url_not_permitted'};
 }
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const r=await request(target.toString(),{
    method:'GET',redirect:'manual',signal:controller.signal,
    headers:{accept:'application/json','user-agent':'Evercraft-IBMi74-ReadOnlyTierProbe/1.0'},
  });
  receipt.http_status=Number(r.status);
  if(r.status!==200){
    receipt.reason=r.status>=300&&r.status<400?'gateway_redirect_unverified':'gateway_http_'+r.status;
    return receipt;
  }
  const type=clean(r.headers?.get?.('content-type')).toLowerCase();
  if(!type.includes('application/json')){
   receipt.reason='gateway_not_json';
   return receipt;
  }
  const claimedLength=Number(r.headers?.get?.('content-length')||0);
  if(claimedLength>MAX_BYTES){receipt.reason='gateway_payload_oversized';return receipt;}
  const body=await r.text();
  if(Buffer.byteLength(body)>MAX_BYTES){receipt.reason='gateway_payload_oversized';return receipt;}
  let data;
  try{data=JSON.parse(body)}catch{receipt.reason='gateway_invalid_json';return receipt;}
  if(data?.ok!==true||data?.public_id&&data.public_id!=='ibmi-rescue-v1'){
    receipt.reason='gateway_offer_identity_unverified';
    return receipt;
  }
  const tiers=data?.offers?.offers;
  const proof=checkIBMi74TierListing(tiers);
  receipt.status=proof.ready?'listed_not_checkout_verified':'held';
  receipt.reason=proof.reason;
  receipt.tier_listed=proof.ready;
  receipt.exact_price_verified=proof.ready&&proof.currency==='usd';
  // A listing with omitted currency is not proof of USD merchant currency.
  if(proof.ready&&proof.currency==='not_returned')receipt.reason='listed_currency_unverified';
  return receipt;
 }catch(e){
  receipt.reason='gateway_network_or_tls_error';
  receipt.error_code=clean(e?.cause?.code||e?.code||e?.name||'fetch_error').slice(0,80);
  return receipt;
 }finally{clearTimeout(timer);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const out=process.argv[2]||'ibmi-74-owned-tier-readonly.json';
 const report=await inspectIBMi74Tier();
 await writeFile(out,JSON.stringify(report,null,2)+'\n');
 process.stdout.write(JSON.stringify({
  status:report.status,reason:report.reason,exact_price_verified:report.exact_price_verified,
  checkout_attempted:false,checkout_verified:false,payment_attempted:false
 })+'\n');
}
