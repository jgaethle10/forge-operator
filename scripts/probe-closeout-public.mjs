#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { publicPaymentOffer } from '../systemia/mcp/public-payment-offers.mjs';

const root=process.argv[2]||'https://jgaethle10.github.io/forge-operator/';
const base=new URL('closeout/',root.endsWith('/')?root:root+'/');
if(base.protocol!=='https:') throw new Error('Closeout live test requires HTTPS');
const receipt={
  schema:'evercraft.closeout.public-https-canary.v1',
  checked_at:new Date().toISOString(),
  url:base.href,
  checks:[],
  source_offer_registered:false,
  product_page_verified:false,
  live_checkout_verified:false,
  paid_order_verified:false,
  external_customer_verified:false,
  success:false
};
async function get(path,type) {
  const url=new URL(path,base);
  let last;
  for(let attempt=1;attempt<=9;attempt++){
    try{
      const response=await fetch(url,{headers:{'accept':type},signal:AbortSignal.timeout(13000),redirect:'follow'});
      if(!response.ok)throw Error('HTTP '+response.status);
      const body=await response.text();
      if(!body)throw Error('Empty body');
      receipt.checks.push({path:url.pathname,status:response.status,bytes:body.length,pass:true});
      return body;
    }catch(e){
      last=e;
      if(attempt<9)await new Promise(r=>setTimeout(r,1700));
    }
  }
  receipt.checks.push({path:url.pathname,pass:false,error:String(last?.message||last)});
  throw new Error('Closeout live HTTPS check failed: '+url.href+': '+last);
}
try{
  const page=await get('','text/html');
  assert.match(page,/<title>Evercraft Closeout \| Every finished job/);
  for(const id of ['packetForm','outSummary','photoSection','printBtn','sampleBtn']){
    assert.ok(page.includes('id="'+id+'"'),'Missing deployed builder control: '+id);
  }
  assert.match(page,/No payment is taken here/);
  assert.match(page,/No customer data or images are uploaded by this page/);
  assert.doesNotMatch(page,/buy\.stripe\.com|checkout\.stripe\.com/i);
  const product=JSON.parse(await get('product.json','application/json'));
  assert.equal(product.product_id,'evercraft.commerce.closeout');
  assert.equal(product.proposed_price_usd,49);
  assert.equal(product.checkout.checkout_available,false);
  assert.equal(product.checkout.order_created,false);
  assert.equal(product.checkout.provider_paid_receipt_verified,false);
  assert.equal(product.launch_evidence.revenue_verified,false);
  const llms=await get('llms.txt','text/plain');
  assert.match(llms,/No Closeout checkout or paid customer has been verified/i);
  const native=publicPaymentOffer('closeout-pilot');
  assert.equal(native.offer_key,'evercraft.closeout.human_review_packet_49.v1');
  assert.equal(native.amount_cents,4900);
  assert.equal(native.native_order_enabled,false);
  receipt.product_page_verified=true;
  receipt.source_offer_registered=true;
  receipt.success=true;
  console.log('CLOSEOUT_PUBLIC_HTTPS_VERIFIED_SOURCE_SKU_HELD');
}catch(error){
  receipt.error=String(error?.stack||error);
  console.error(receipt.error);
}finally{
  const artifacts=fileURLToPath(new URL('../artifacts/',import.meta.url));
  mkdirSync(artifacts,{recursive:true});
  writeFileSync(fileURLToPath(new URL('../artifacts/closeout-public-canary.json',import.meta.url)),JSON.stringify(receipt,null,2)+'\n');
  if(process.env.GITHUB_STEP_SUMMARY){
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      '## Evercraft Closeout public HTTPS canary\n\n'+
      '- Result: **'+(receipt.success?'PASS':'FAIL')+'**\n'+
      '- Public builder: '+base.href+'\n'+
      '- Paid checkout: **NOT VERIFIED / HELD**\n'+
      '- Source SKU registered: '+String(receipt.source_offer_registered)+'\n'+
      '- Customer/revenue evidence: **NOT VERIFIED**\n\n'
    );
  }
}
if(!receipt.success)process.exitCode=1;
