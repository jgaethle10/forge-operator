/**
 * ForensiScope commerce continuity: source-only hold.
 *
 * October 22 founder policy freezes ALL calls to legacy-hosted applications.
 * This script cannot issue an outbound network request. It retains classifiers
 * to interpret historical receipts but cannot endorse historic availability.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const CONFIG=Object.freeze({
  ship:null,
  parcel:null,
  payment:null,
  paymentOffer:'workflow_foundry.xray_250.v1',
  legacy_provider_transport_enabled:false
});

export function classifyShipDocument(response={}) {
 const failures=[];
 if(response.status!==200)failures.push('ship_http_'+String(response.status??'missing'));
 if(!/^text\/html\b/i.test(response.contentType||''))failures.push('ship_wrong_content_type');
 const match=String(response.body||'').match(/<script\b[^>]*\bsrc=["'](\/assets\/index-[^"']+\.js)["']/i);
 if(!match)failures.push('ship_app_bundle_not_found');
 return {ok:failures.length===0,failures,assetPath:match?.[1]||null};
}
export function classifyShipBundle(response={}) {
 const failures=[];
 if(response.status!==200)failures.push('ship_bundle_http_'+String(response.status??'missing'));
 if(!/\b(javascript|ecmascript)\b/i.test(response.contentType||''))failures.push('ship_bundle_wrong_content_type');
 for(const phrase of ['Your file is too big.','Tap the problem you recognize.','Open exact-byte Parcel Desk','Request a scoped delivery pilot']){
  if(!String(response.body||'').includes(phrase))failures.push('ship_bundle_missing:'+phrase);
 }
 return {ok:failures.length===0,failures};
}
export function classifyParcelDocument(response={}) {
 const failures=[];
 if(response.status!==200)failures.push('parcel_http_'+String(response.status??'missing'));
 if(!/^text\/html\b/i.test(response.contentType||''))failures.push('parcel_wrong_content_type');
 if(!String(response.body||'').includes('evercraft-parcel-v0.1'))
  failures.push('parcel_actual_tool_missing_spa_fallback');
 return {ok:failures.length===0,failures};
}
export function classifyPaymentQuote(response={}) {
 const failures=[];
 if(response.status!==200)failures.push('payment_quote_http_'+String(response.status??'missing'));
 let data;
 try {data=JSON.parse(String(response.body||''))}catch{failures.push('payment_quote_not_json')}
 if(!data?.ok||data?.offer?.offer_key!==CONFIG.paymentOffer)failures.push('payment_quote_wrong_offer');
 if(data?.offer?.product_key!=='workflow-foundry'||data?.offer?.amount_cents!==25000||
  String(data?.offer?.currency).toLowerCase()!=='usd')failures.push('payment_quote_contract_mismatch');
 if(data?.fulfillment?.ready!==true||!data?.fulfillment?.contract_key)
  failures.push('payment_fulfillment_contract_not_ready');
 return {ok:failures.length===0,failures,offer_key:CONFIG.paymentOffer,
  amount_cents:data?.offer?.amount_cents??null,fulfillment_ready:data?.fulfillment?.ready===true};
}

// Deliberately ignore injected fetch implementations too: no hidden bypass
// through a test adapter or a scheduled manual run.
export async function runCanary(_fetchImpl,_now=new Date()){
 return {
  schema:'evercraft.distribution.forensiscope-commerce-canary.v1',
  checked_at:new Date().toISOString(),
  mode:'OWNED_ONLY_NO_LEGACY_NETWORK',
  source_app:'ForensiScope',
  status:'HELD_LEGACY_PROVIDER_EGRESS_FROZEN',
  checks:{
   ship_document:{valid:false,http:null},
   ship_bundle:{valid:false,http:null},
   parcel_desk:{valid:false,http:null},
   existing_workflow_xray_quote:{valid:false,http:null}
  },
  failures:['legacy_provider_frozen','owned_media_handoff_not_yet_independently_verified',
   'owned_payment_to_shipping_not_yet_independently_verified'],
  unverified:['owned_recipient_exact_byte_receive_and_sha256','provider_verified_paid_receipt',
   'systemia_shipping_release','live_owned_HTTPS_route'],
  network_requests:0,
  customer_ready:false,revenue_verified:false,recipient_delivery_verified:false,
  public_distribution_authorized:false
 };
}

async function main(){
 const receipt=await runCanary();
 const output=process.env.EVERCRAFT_CANARY_OUT||'artifacts/distribution/forensiscope-commerce-canary.json';
 await mkdir(output.slice(0,output.lastIndexOf('/'))||'.',{recursive:true});
 await writeFile(output,JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify(receipt,null,2));
 // Held is expected safety behavior, not a false public green.
 if(process.argv.includes('--strict'))process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(e=>{console.error('ForensiScope held receipt error: '+String(e?.name||'Error'));process.exitCode=1});
}
