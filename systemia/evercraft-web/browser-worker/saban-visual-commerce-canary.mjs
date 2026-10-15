#!/usr/bin/env node
// Saban / Evercraft Customer Gauntlet: bounded public browser recording.
// No credential capture, POST, payment, login, downloads or arbitrary target URLs.
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ORIGIN='https://fabric.systemiacommandcenters.com';
const CASES=[
  ['home','/'],
  ['offers','/offers'],
  ['website-audit','/offers/website-audit'],
  ['ibmi-rescue','/offers/ibmi-rescue'],
  ['legacy-rescue','/offers/legacy-rescue'],
  ['findmypart','/offers/findmypart'],
  ['site-survive','/offers/site-survive']
];
const VIEWPORTS=[
  {name:'mobile',width:390,height:844,isMobile:true,deviceScaleFactor:1,hasTouch:true},
  {name:'desktop',width:1365,height:850,isMobile:false,deviceScaleFactor:1,hasTouch:false}
];
const OUT=path.resolve('artifacts/saban/commerce-visual');
fs.mkdirSync(OUT,{recursive:true});
const digest=(buf)=>'sha256:'+createHash('sha256').update(buf).digest('hex');
const receipt={
  schema:'evercraft.saban.visual-commerce-canary.v1',
  observed_at:new Date().toISOString(),
  origin:ORIGIN,
  execution:'authorized_ephemeral_github_runner',
  browser:'chromium',
  public_anonymous_only:true,
  payment_post_attempted:false,
  credential_capture_allowed:false,
  tests:[]
};
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try {
  for(const viewport of VIEWPORTS) {
    for(const [name,route] of CASES){
      const id=viewport.name+'-'+name;
      const videoDir=path.join(OUT,'video');
      fs.mkdirSync(videoDir,{recursive:true});
      const context=await browser.newContext({
        viewport:{width:viewport.width,height:viewport.height},
        isMobile:viewport.isMobile,
        deviceScaleFactor:1,
        hasTouch:viewport.hasTouch,
        serviceWorkers:'block',
        acceptDownloads:false,
        recordVideo:{dir:videoDir,size:{width:viewport.width,height:viewport.height}},
      });
      const page=await context.newPage();
      const errors=[];
      const blockedMethods=[];
      page.on('pageerror',e=>errors.push(String(e?.message||e).slice(0,180)));
      // Fail closed on non-read requests. The visual canary never creates an order.
      await page.route('**/*',async(route)=>{
        const request=route.request();
        const url=new URL(request.url());
        if(!['GET','HEAD','OPTIONS'].includes(request.method()) ||
           !['https:','data:','blob:'].includes(url.protocol)){
          blockedMethods.push(request.method());return route.abort();
        }
        return route.continue();
      });
      const entry={id,path:route,viewport:viewport.name,status:0,title:null,has_customer_email_field:false,has_checkout_cta:false,errors:[],blocked_methods:[],shot:null,video:null};
      try {
        const response=await page.goto(ORIGIN+route,{waitUntil:'domcontentloaded',timeout:22000});
        entry.status=response?.status()||0;
        await page.waitForTimeout(1100);
        entry.title=(await page.title()).slice(0,160);
        entry.has_customer_email_field=await page.locator('input[name="customer_ref"][type="email"]').count()>0;
        entry.has_checkout_cta=await page.getByRole('button',{name:/Continue to checkout/i}).count()>0;
        const screenshotPath=path.join(OUT,id+'.png');
        await page.screenshot({path:screenshotPath,fullPage:true,animations:'disabled'});
        entry.shot={file:path.relative(OUT,screenshotPath),sha256:digest(fs.readFileSync(screenshotPath))};
      } catch(error) {
        entry.errors.push('navigation: '+String(error?.message||error).slice(0,250));
        try{
          const screenshotPath=path.join(OUT,id+'-error.png');
          await page.screenshot({path:screenshotPath,fullPage:false,timeout:3000});
          entry.shot={file:path.relative(OUT,screenshotPath),sha256:digest(fs.readFileSync(screenshotPath))};
        }catch{}
      }
      const video=page.video();
      try{await context.close()}catch(err){entry.errors.push('context_close:'+String(err?.message||err).slice(0,140))}
      try{
        const rawPath=await video.path();
        const dest=path.join(OUT,id+'.webm');
        if(fs.existsSync(rawPath)){fs.copyFileSync(rawPath,dest);entry.video={file:path.relative(OUT,dest),sha256:digest(fs.readFileSync(dest))};}
      }catch(err){entry.errors.push('video:'+String(err?.message||err).slice(0,150))}
      entry.errors.push(...errors.slice(0,6));
      entry.blocked_methods=blockedMethods;
      receipt.tests.push(entry);
      console.log(JSON.stringify({case:id,status:entry.status,email:entry.has_customer_email_field,video:Boolean(entry.video),errors:entry.errors.length}));
    }
  }
} finally { await browser.close(); }
receipt.summary={
  total:receipt.tests.length,
  http_ok:receipt.tests.filter(r=>r.status===200).length,
  broken:receipt.tests.filter(r=>r.status!==200).map(r=>r.id),
  missing_email_field_on_cta:receipt.tests.filter(r=>r.has_checkout_cta&&!r.has_customer_email_field).map(r=>r.id),
  videos:receipt.tests.filter(r=>r.video).length,
  screenshots:receipt.tests.filter(r=>r.shot).length
};
fs.writeFileSync(path.join(OUT,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log('SABAN_VISUAL_RECEIPT '+JSON.stringify(receipt.summary));
// Upload diagnostic evidence even when the website fails. Never infer payment readiness.
if(receipt.summary.videos===0||receipt.summary.screenshots===0) process.exitCode=2;
