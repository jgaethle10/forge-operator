#!/usr/bin/env node
// Saban Visual Commerce / Influence Lab. Public, anonymous, GET-only inspection.
// This can inspect a displayed checkout CTA, not submit the checkout form or authorize payment.
import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const ORIGIN='https://fabric.systemiacommandcenters.com';
const TARGET=ORIGIN+'/offers/website-audit';
const OUT=path.resolve(process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:'artifacts/saban/influence-website-audit');
const VIEWPORTS=[
  {id:'mobile',width:390,height:844,isMobile:true,hasTouch:true},
  {id:'desktop',width:1365,height:850,isMobile:false,hasTouch:false}
];
const sha=data=>'sha256:'+createHash('sha256').update(data).digest('hex');
function safeError(error){return String(error?.message||error||'').slice(0,220)}
function makeEntry(viewport){
  return {name:viewport.id,viewport:{width:viewport.width,height:viewport.height},status:0,
    finalOrigin:null,pageTitle:null,pageRendered:false,offerNameVisible:false,priceVisible:false,
    emailFieldPresent:false,checkoutCtaVisible:false,checkoutFormActionCorrect:false,
    checkoutFormMethodPost:false,canonicalMatches:false,ogImageUrl:null,ogImageAllowed:false,
    screenshotPath:null,screenshotSha256:null,errors:[],blockedNonReadMethods:[],
    paymentPosted:false,formSubmitted:false,checkoutCreated:false,providerSettlementVerified:false,
    disclosure:'Observation-only; no customer interaction, checkout or payment was performed.'};
}
async function inspect(){
  const receipt={
    schema:'evercraft.influence-lab.saban-website-audit-browser.v1',
    observedAt:new Date().toISOString(),target:TARGET,
    boundary:{readOnly:true,publicPageOnly:true,authorizedExternalContact:false,
      formSubmitAllowed:false,paymentPosted:false,checkoutCreated:false,
      settledRevenueVerified:false},
    views:[],verdict:'held',blockers:[],
  };
  fs.mkdirSync(OUT,{recursive:true});
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try{
    for(const viewport of VIEWPORTS){
      const entry=makeEntry(viewport);
      const ctx=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},
        isMobile:viewport.isMobile,hasTouch:viewport.hasTouch,deviceScaleFactor:1,
        acceptDownloads:false,serviceWorkers:'block',permissions:[]});
      const page=await ctx.newPage();
      page.on('pageerror',e=>{if(entry.errors.length<10)entry.errors.push('page:'+safeError(e))});
      const forbiddenMethods=new Set();
      await page.route('**/*',async route=>{
        const request=route.request();
        let url;
        try{url=new URL(request.url())}catch{forbiddenMethods.add('invalid_url');return route.abort()}
        if(!['GET','HEAD','OPTIONS'].includes(request.method())){
          forbiddenMethods.add(request.method());return route.abort();
        }
        if(!['https:','data:','blob:'].includes(url.protocol))return route.abort();
        return route.continue();
      });
      try{
        const response=await page.goto(TARGET,{waitUntil:'domcontentloaded',timeout:25000});
        entry.status=response?.status()||0;
        entry.finalOrigin=new URL(page.url()).origin;
        entry.pageTitle=(await page.title()).slice(0,180);
        await page.waitForTimeout(650);
        entry.offerNameVisible=await page.getByText(/Quick Win Audit/i).count()>0;
        entry.priceVisible=await page.getByText(/\$49(?:\b|$)/i).count()>0;
        entry.emailFieldPresent=await page.locator('input[name="customer_ref"][type="email"]').count()>0;
        entry.checkoutCtaVisible=await page.getByRole('button',{name:/Continue to checkout/i}).count()>0;
        entry.checkoutFormActionCorrect=await page.locator('form[action="/api/offers/website-audit/checkout"]').count()>0;
        entry.checkoutFormMethodPost=await page.locator('form[method="post" i],form[method="POST"]').count()>0;
        entry.canonicalMatches=(await page.locator('link[rel="canonical"]').getAttribute('href').catch(()=>null))===TARGET;
        const og=await page.locator('meta[property="og:image"]').getAttribute('content').catch(()=>null);
        if(og){
          try{
            const parsed=new URL(og,page.url());
            entry.ogImageUrl=parsed.toString();
            entry.ogImageAllowed=parsed.protocol==='https:'&&parsed.origin===ORIGIN;
          }catch{}
        }
        entry.pageRendered=entry.status===200&&entry.finalOrigin===ORIGIN;
        if(entry.pageRendered){
          const file=path.join(OUT,viewport.id+'-website-audit.png');
          await page.screenshot({path:file,fullPage:true,animations:'disabled'});
          entry.screenshotPath=path.basename(file);
          entry.screenshotSha256=sha(fs.readFileSync(file));
        }
      }catch(e){entry.errors.push('navigation:'+safeError(e))}
      entry.blockedNonReadMethods=[...forbiddenMethods];
      await ctx.close();
      receipt.views.push(entry);
    }
  }finally{await browser.close()}
  for(const view of receipt.views){
    for(const key of ['pageRendered','offerNameVisible','priceVisible','emailFieldPresent','checkoutCtaVisible',
      'checkoutFormActionCorrect','checkoutFormMethodPost','canonicalMatches','ogImageAllowed']){
      if(view[key]!==true)receipt.blockers.push(view.name+':'+key);
    }
    if(view.blockedNonReadMethods.length)receipt.blockers.push(view.name+':blocked_non_read_request_observed');
    if(view.errors.length)receipt.blockers.push(view.name+':browser_errors');
  }
  receipt.verdict=receipt.blockers.length?'held':'read_only_page_ui_checks_passed';
  fs.writeFileSync(path.join(OUT,'browser-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({verdict:receipt.verdict,views:receipt.views.map(v=>({id:v.name,http:v.status,
    email:v.emailFieldPresent,cta:v.checkoutCtaVisible,screenshot:v.screenshotPath,errors:v.errors.length})),
    blockers:receipt.blockers,checkoutCreated:false,paymentPosted:false}));
  // A failure is a useful diagnostic that CI should surface, never obscure.
  if(receipt.blockers.length)process.exitCode=2;
}
inspect().catch(error=>{console.error(safeError(error));process.exitCode=1});
