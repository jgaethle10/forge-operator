#!/usr/bin/env node
/**
 * EVERCRAFT | Read-only seven-SKU Systemia Stripe buyer browser canary.
 * Uses our own Browser Worker + Chromium on the GitHub-controlled runner.
 * GET/render only: NEVER clicks buttons, fills fields, creates orders,
 * submits buyer data, makes a payment, or calls Stripe mutation APIs.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const catalogFile=new URL('../../../public/mesh/checkout-ready/verified-links.json',import.meta.url);
const expected=JSON.parse(fs.readFileSync(catalogFile,'utf8'));
const aliases={
  'weekly-social':[/social media management/i],
  'asset-diagnosis':[/asset diagnosis/i],
  'ai-boardroom-standard':[/ai boardroom/i,/standard/i],
  'ai-boardroom-financial':[/ai boardroom/i,/(deep dive|financial|modeling)/i],
  'knowledge-activation':[/knowledge activation/i],
  'social-intelligence-launch':[/social intelligence launch/i],
  'institutional-memory-system':[/institutional memory system/i]
};
export function priceVisible(body,cents){
  const amount=(cents/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const withoutCents=(cents/100).toLocaleString('en-US',{maximumFractionDigits:0});
  const esc=x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp('(?:\\$|USD\\s*)\\s*'+esc(amount)+'(?![\\d,.])','i').test(body)
    ||new RegExp('(?:\\$|USD\\s*)\\s*'+esc(withoutCents)+'(?![\\d,.])','i').test(body);
}
export function evaluateBuyerView({key,amount_cents,url,status,final_url,visible_text}){
  let source, final;
  try{source=new URL(url);final=new URL(final_url);}catch{return {state:'UNVERIFIED',findings:['BAD_URL']};}
  const provider=source.protocol==='https:'&&source.hostname==='buy.stripe.com'
    &&final.protocol==='https:'&&(final.hostname==='buy.stripe.com'||final.hostname.endsWith('.stripe.com'));
  const catalogName=aliases[key];
  if(!catalogName)throw Error('unrecognized_catalog_sku:'+key);
  const body=String(visible_text||'').slice(0,15000);
  const nameOk=catalogName.every(pattern=>pattern.test(body));
  const priceOk=priceVisible(body,amount_cents);
  const paymentSurface=/(card information|card number|card details|payment method|pay with card|payment details|billing information|credit or debit)/i.test(body);
  const forbidden=/(payment link (?:is )?(?:inactive|expired)|this payment link is no longer active|link has expired|site can.?t be reached|access denied|bot detection|captcha|verify you are human)/i.test(body);
  const findings=[];
  if(!provider)findings.push('PROVIDER_ORIGIN_NOT_VERIFIED');
  if(status!==200)findings.push('HTTP_NOT_200');
  if(!nameOk)findings.push('EXACT_SKU_TITLE_NOT_VERIFIED');
  if(!priceOk)findings.push('EXACT_AMOUNT_NOT_VERIFIED');
  if(!paymentSurface)findings.push('VISIBLE_PAYMENT_FIELDS_NOT_VERIFIED');
  if(forbidden)findings.push('CHECKOUT_BLOCKED_OR_EXPIRED');
  return {state:findings.length===0?'READ_ONLY_BUYER_FORM_VERIFIED':'UNVERIFIED',
    findings,provider_origin_ok:provider,exact_sku_visible:nameOk,exact_amount_visible:priceOk,
    payment_fields_visible:paymentSurface,block_or_inactive_detected:forbidden};
}
export function validateCatalog(catalog){
  if(catalog.schema!=='evercraft.payments.existing-provider-links.v1')throw Error('unexpected_catalog_schema');
  if(!Array.isArray(catalog.links)||catalog.links.length!==7)throw Error('expected_seven_live_links');
  const seen=new Set();
  for(const offer of catalog.links){
    if(seen.has(offer.key)||!aliases[offer.key])throw Error('duplicate_or_unknown_offer:'+offer.key);
    seen.add(offer.key);
    if(!Number.isInteger(offer.amount_cents)||offer.amount_cents<100)throw Error('invalid_price');
    const url=new URL(offer.url);
    if(url.protocol!=='https:'||url.hostname!=='buy.stripe.com'||!/^\/[a-zA-Z0-9]+$/.test(url.pathname))throw Error('unapproved_stripe_url');
  }
  return true;
}
async function run(){
  validateCatalog(expected);
  const output=path.resolve(process.env.EVERCRAFT_STRIPE_BROWSER_RECEIPT||'/tmp/evercraft-systemia-stripe-seven-browser.json');
  const receipt={schema:'evercraft.chum.stripe-seven-buyer-browser.v1',observed_at:new Date().toISOString(),
    engine:'Evercraft-owned Browser Worker Playwright Chromium',
    scope:'read_only_render_exact_sku_title_amount_and_payment_surface',
    account:'Systemia',catalog_path:'public/mesh/checkout-ready/verified-links.json',
    payment_attempted:false,customer_data_entered:false,form_submitted:false,orders_created:false,
    payment_received_verified:false,fulfillment_verified:false,manual_reconciliation_required:true,
    verified_count:0,total:expected.links.length,rows:[],state:'UNVERIFIED'};
  let browser;
  try{
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:900},timezoneId:'America/Los_Angeles'});
    for(const offer of expected.links){
      const page=await context.newPage();
      try{
        const response=await page.goto(offer.url,{waitUntil:'domcontentloaded',timeout:30000});
        await page.waitForTimeout(1800);
        const body=await page.locator('body').innerText({timeout:6500});
        const v=evaluateBuyerView({key:offer.key,amount_cents:offer.amount_cents,url:offer.url,
          status:response?.status()||null,final_url:page.url(),visible_text:body});
        receipt.rows.push({key:offer.key,expected_usd:(offer.amount_cents/100).toFixed(2),
          http_status:response?.status()||null,final_host:new URL(page.url()).hostname,
          ...v});
      }catch(e){
        receipt.rows.push({key:offer.key,expected_usd:(offer.amount_cents/100).toFixed(2),
          state:'UNVERIFIED',findings:['BROWSER_OR_NETWORK_ERROR'],
          error_kind:e?.name==='TimeoutError'?'timeout':'navigation_error'});
      }finally{await page.close();}
    }
    await context.close();
  }catch(e){receipt.infrastructure_error=e?.name==='TimeoutError'?'browser_timeout':'browser_unavailable';}
  finally{
    await browser?.close().catch(()=>{});
    receipt.verified_count=receipt.rows.filter(x=>x.state==='READ_ONLY_BUYER_FORM_VERIFIED').length;
    receipt.state=receipt.verified_count===receipt.total?'ALL_SEVEN_READ_ONLY_FORMS_VERIFIED':'BUYER_BROWSER_EVIDENCE_INCOMPLETE';
    fs.mkdirSync(path.dirname(output),{recursive:true});
    fs.writeFileSync(output,JSON.stringify(receipt,null,2)+'\n');
    console.log(JSON.stringify({receipt_path:output,...receipt},null,2));
    if(process.argv.includes('--gate')&&receipt.state!=='ALL_SEVEN_READ_ONLY_FORMS_VERIFIED')process.exitCode=1;
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await run();
