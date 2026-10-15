#!/usr/bin/env node
/**
 * Evercraft first-party, rendered-browser website commerce acceptance.
 * NO checkouts, payment authorization, credentials, customer data, forms,
 * marketing sends, or external browser providers. Browser reads only.
 *
 * Audit mode (default) emits a truthful red/green receipt without exiting
 * nonzero for expected commercial holds. --gate fails if buyer-ready is false.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ORIGIN='https://instant-website-builder-usa-6feac193.base44.app';
const OFFERS=[
  {name:'Starter Export',tier:'starter',amount:19.99,requiresReady:true,url:'https://buy.stripe.com/eVq4gzffx99q9zc2C2fAc0A'},
  {name:'Pro Brand Launch',tier:'pro',amount:24.99,requiresReady:true,url:'https://buy.stripe.com/9B600jaZh5Xeh1EfoOfAc0B'},
  {name:'Business Empire',tier:'business',amount:49.99,requiresReady:true,url:'https://buy.stripe.com/14AdR97N5bhycLo6SifAc0C'},
  {name:'Gift a Website',tier:'gift',amount:19.99,requiresReady:false,url:'https://buy.stripe.com/4gMdR97N51GY5iWb8yfAc0D'},
  {name:'Human-Finished Pro Site',tier:'human_finished',amount:500,requiresReady:true,url:'https://buy.stripe.com/4gM7sLd7p1GY3aO7WmfAc0E'},
  {name:'Premium Custom Build',tier:'premium_custom',amount:999,requiresReady:true,url:'https://buy.stripe.com/bJe5kD5EXclC3aOfoOfAc0F'},
  {name:'Total Business Launch',tier:'total_launch',amount:1999,requiresReady:true,url:'https://buy.stripe.com/dRm14n3wPadufXA0tUfAc0G'}
];

const receipt={
  schema:'evercraft.website-commerce.browser-acceptance.v1',
  checked_at:new Date().toISOString(),
  origin:ORIGIN,
  engine:'evercraft-owned-playwright-chromium',
  read_only:true,
  customer_data_submitted:false,
  payment_attempted:false,
  observed:[],
  blockers:[],
  buyer_ready:false,
  note:'Provider checkout form visibility is not payment, project entitlement, settlement, fulfillment, or production deployment proof.'
};

function statusFrom({http,body,expected}){
  if(/the link is no longer active|payment link (?:is )?inactive|not currently accepting payments/i.test(body))return 'inactive';
  if(http!==200)return 'http_unavailable';
  if(/stripe checkout/i.test(body)&&!/(payment method|card information|cardholder name)/i.test(body))return 'unverified';
  const nameSeen=body.toLowerCase().includes(expected.name.toLowerCase());
  const paymentFields=/(card information|cardholder name|payment method)/i.test(body);
  const priceSeen=body.includes(expected.amount.toFixed(2))||body.includes(expected.amount.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}));
  return nameSeen&&paymentFields&&priceSeen?'provider_form_visible':'unverified';
}
let browser;
try{
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'en-US'});
  const page=await context.newPage();
  const response=await page.goto(ORIGIN+'/ServiceCheckout?plan=human_finished',{waitUntil:'domcontentloaded',timeout:22000});
  await page.waitForTimeout(1100);
  const currentText=(await page.locator('body').innerText()).slice(0,6500);
  const appVisible=response?.status()===200&&currentText.includes('Human-Finished Pro Site')&&currentText.includes('Tell us what we are building');
  const availabilityGuard=/checkout temporarily paused|checking checkout availability/i.test(currentText);
  receipt.observed.push({surface:'human_finished_app_form',state:appVisible?'rendered':'not_rendered',availability_guard_visible:availabilityGuard});
  if(!appVisible)receipt.blockers.push('managed_service_buyer_form_not_rendered');
  // Require the exact visual release, not merely a healthy SPA shell or checkout page.
  // The visual proofs are clearly labeled illustrative, not customer results.
  const proofPage=await context.newPage();
  try{
    const visualResponse=await proofPage.goto(ORIGIN+'/websites',{waitUntil:'domcontentloaded',timeout:22000});
    await proofPage.waitForTimeout(1100);
    const proofText=await proofPage.locator('body').innerText();
    const releaseVisible=visualResponse?.status()===200 &&
      proofText.includes('Your next customer should get it in') &&
      proofText.includes('illustrative concepts') &&
      proofText.includes('Start a finished site from $500');
    let comparisonFunctional=false;
    if(releaseVisible){
      await proofPage.getByRole('button',{name:'Studio',exact:true}).click();
      const studioShown=(await proofPage.locator('body').innerText()).includes('Sunday Studio');
      await proofPage.getByRole('button',{name:'Before',exact:true}).click();
      const beforeShown=(await proofPage.locator('body').innerText()).includes('Welcome to our website.');
      await proofPage.getByRole('button',{name:'Clearer concept',exact:true}).click();
      const afterShown=(await proofPage.locator('body').innerText()).includes('Make time for a little more you.');
      comparisonFunctional=studioShown&&beforeShown&&afterShown;
    }
    receipt.observed.push({surface:'website_launch_visual_release',state:releaseVisible?'rendered':'stale_or_unverified',comparison_functional:comparisonFunctional});
    if(!releaseVisible)receipt.blockers.push('website_launch_release_revision_not_live');
    else if(!comparisonFunctional)receipt.blockers.push('website_launch_visual_comparison_not_functional');
  }catch(error){
    receipt.observed.push({surface:'website_launch_visual_release',state:'browser_error',reason:String(error.message||error).slice(0,140)});
    receipt.blockers.push('website_launch_visual_release_probe_failed');
  }finally{await proofPage.close();}
  for(const offer of OFFERS){
    const view=await context.newPage();
    try{
      const r=await view.goto(offer.url,{waitUntil:'domcontentloaded',timeout:23000});
      await view.waitForTimeout(1200);
      const body=(await view.locator('body').innerText()).slice(0,4800);
      const state=statusFrom({http:r?.status()||0,body,expected:offer});
      const row={surface:'provider_payment_page',tier:offer.tier,expected_usd:offer.amount,required:offer.requiresReady,state,http_status:r?.status()||0};
      receipt.observed.push(row);
      if(offer.requiresReady&&state!=='provider_form_visible')receipt.blockers.push('payment_link_not_verified:'+offer.tier+':'+state);
    }catch(error){
      receipt.observed.push({surface:'provider_payment_page',tier:offer.tier,required:offer.requiresReady,state:'browser_error',reason:String(error.message||error).slice(0,140)});
      if(offer.requiresReady)receipt.blockers.push('payment_link_not_verified:'+offer.tier+':browser_error');
    }finally{await view.close();}
  }
  receipt.buyer_ready=receipt.blockers.length===0;
}catch(error){
  receipt.blockers.push('native_browser_probe_failed');
  receipt.error=String(error.message||error).slice(0,300);
}finally{
  await browser?.close().catch(()=>{});
  const output=path.resolve(process.env.EVERCRAFT_CHECKOUT_RECEIPT||'website-commerce-acceptance.receipt.json');
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(receipt,null,2));
  if(process.argv.includes('--gate')&&!receipt.buyer_ready)process.exitCode=1;
}
