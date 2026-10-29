#!/usr/bin/env node
// Saban bounded browser gauntlet: real public site + MOCKED partner application API.
// Never sends real contact data, signs partners, charges, or posts to social channels.
import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const url='https://jgaethle10.github.io/forge-operator/partners/';
const targetDir=path.resolve('artifacts/saban/partners-browser');
fs.mkdirSync(targetDir,{recursive:true});
const scenarios=[
 {name:'desktop-received',viewport:{width:1440,height:900},mode:'received'},
 {name:'mobile-received',viewport:{width:390,height:844},mode:'received',mobile:true},
 {name:'mobile-offline',viewport:{width:390,height:844},mode:'offline',mobile:true},
 {name:'desktop-rejected',viewport:{width:1365,height:850},mode:'rejected'},
 {name:'mobile-duplicate',viewport:{width:375,height:812},mode:'duplicate',mobile:true},
];
const receipt={schema:'evercraft.saban.partners-browser-gauntlet.v1',
 verified_at:new Date().toISOString(),
 source:'real public GitHub Pages HTML + controlled synthetic API doubles',
 public_applicant_post_attempted:false,real_applicant_created:false,provider_publish_attempted:false,
 tests:[]};
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
function digest(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}
try{
 for(const scenario of scenarios){
  const errors=[];
  const context=await browser.newContext({viewport:scenario.viewport,
    isMobile:Boolean(scenario.mobile),hasTouch:Boolean(scenario.mobile),
    deviceScaleFactor:1,acceptDownloads:false,serviceWorkers:'block'});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e.message).slice(0,180)));
  await page.route('https://fabric.systemiacommandcenters.com/api/partners/**',async route=>{
   const request=route.request();
   if(request.url().endsWith('/readiness')){
    return route.fulfill({status:200,contentType:'application/json',
     headers:{'access-control-allow-origin':'https://jgaethle10.github.io'},
     body:JSON.stringify({schema:'evercraft.partners.intake-readiness.v1',
      intake_available:scenario.mode!=='offline'})});
   }
   if(request.method()==='POST'&&request.url().endsWith('/inquiry')){
    if(scenario.mode==='rejected')return route.fulfill({status:503,contentType:'application/json',
      headers:{'access-control-allow-origin':'https://jgaethle10.github.io'},
      body:JSON.stringify({ok:false,error:'intake_unavailable'})});
    return route.fulfill({status:scenario.mode==='duplicate'?200:201,
     contentType:'application/json',headers:{'access-control-allow-origin':'https://jgaethle10.github.io'},
     body:JSON.stringify({ok:true,received:true,reference:'EVP-AABBCCDDEEFF001122334455',
      duplicate:scenario.mode==='duplicate'})});
   }
   return route.abort();
  });
  let status=0,overflow=false,caption='',shot='';
  try{
   const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:35000});
   status=response?.status()||0;
   if(status!==200)throw Error('public page returned '+status);
   await page.waitForSelector('#partner-application button:not([disabled])',{timeout:12000});
   await page.locator('#full-name').fill('Synthetic Browser Applicant');
   await page.locator('#email').fill('synthetic@example.test');
   await page.locator('#audience').selectOption({label:'Business owners & executives'});
   await page.locator('#region').fill('Test region');
   await page.locator('#understand').check();
   if(scenario.mode==='offline'){
    caption=await page.locator('#send-note').innerText();
    if(!/email/i.test(caption)||!/Send/i.test(caption))throw Error('offline fallback not clearly stated');
    if(!/Prepare my application email/.test(await page.locator('button[type=submit]').innerText()))
      throw Error('offline submit mislabeled');
   }else{
    await page.locator('button[type=submit]').click();
    await page.waitForFunction(()=>/received|could not confirm/.test(document.querySelector('#send-note')?.textContent||''),{timeout:12000});
    caption=await page.locator('#send-note').innerText();
    if(scenario.mode==='rejected'){
     if(!/could not confirm/i.test(caption))throw Error('failure falsely acknowledged');
     if(!await page.locator('#partner-application').isVisible())throw Error('lost application inputs after failure');
    }else{
     if(!caption.includes('EVP-AABBCCDDEEFF001122334455'))throw Error('no reference receipt');
     if(await page.locator('#partner-application').isVisible())throw Error('confirmed form did not close');
    }
   }
   overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+3);
   if(overflow)throw Error('horizontal overflow');
   shot=path.join(targetDir,scenario.name+'.png');
   await page.screenshot({path:shot,fullPage:true,animations:'disabled'});
  }catch(e){errors.push(String(e?.message||e).slice(0,250))}
  receipt.tests.push({name:scenario.name,http_status:status,overflow,caption:caption.slice(0,200),
   screenshot:shot?path.basename(shot):null,screenshot_sha256:shot&&fs.existsSync(shot)?digest(shot):null,
   errors});
  await context.close();
 }
}finally{await browser.close()}
receipt.summary={cases:receipt.tests.length,
 passed:receipt.tests.filter(x=>x.http_status===200&&x.errors.length===0&&x.screenshot).length,
 failed:receipt.tests.filter(x=>x.errors.length||x.http_status!==200).map(x=>x.name),
 actual_backend_submission_confirmed:false};
fs.writeFileSync(path.join(targetDir,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log('SABAN_PARTNERS_BROWSER_RECEIPT '+JSON.stringify(receipt.summary));
if(receipt.summary.failed.length||receipt.summary.passed!==scenarios.length)process.exitCode=2;
