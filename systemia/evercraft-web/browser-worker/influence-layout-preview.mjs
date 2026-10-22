#!/usr/bin/env node
// Offline sourced HTML specimen served on loopback for visual review only.
// Real Website Audit purchase, Raven, and payment provider are not contacted.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {renderOfferPage} from '../../mcp/fabric-public-site.mjs';

const OWNED='https://fabric.systemiacommandcenters.com';
const source={
  public_id:'audit-center-website-audit-machine-v1',
  name:'Systemia Website Audit',
  description:'Find website conversion and public-web friction.',
  commercial_state:'sell_now',
  state:'payment_ready',
  pricing:'Free preview. Quick Win Audit $49 one-time and machine-fulfilled after verified payment; the $49 may be credited toward Complete Audit. Complete Audit $500 one-time. Audit + Patch $1,200 one-time.',
  entry_paid_offer:{name:'Quick Win Audit',price:'$49',price_usd_normalized:49,billing:'one_time'},
};
const idx=process.argv.indexOf('--out');
if(idx<0||!process.argv[idx+1])throw Error('usage: influence-layout-preview.mjs --out <existing-review-directory>');
const out=path.resolve(process.argv[idx+1]);
fs.mkdirSync(out,{recursive:true});
let html=renderOfferPage(source);
// Specimen includes actual first-party public images, never a simulated customer result.
html=html.replaceAll('src="/visuals/', 'src="'+OWNED+'/visuals/')
  .replaceAll('srcset="/visuals/','srcset="'+OWNED+'/visuals/')
  .replaceAll('src="/assets/','src="'+OWNED+'/assets/');
const label='<div id="source-preview" style="position:fixed;z-index:9999;right:12px;top:56px;max-width:164px;background:#3f1026;border:2px solid #ff9cc7;color:#fff;font:700 9px system-ui;padding:8px 10px;border-radius:8px;pointer-events:none">SOURCE BRANCH REVIEW • NOT LIVE • NO PAYMENT</div>';
html=html.replace('<body>','<body>'+label);
const server=http.createServer((req,res)=>{
  if(req.method!=='GET'||req.url!=='/offers/website-audit'){
    res.writeHead(404,{'content-type':'text/plain'});res.end('Not found');return;
  }
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(html);
});
await new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',resolve);
});
const port=server.address().port;
const local='http://127.0.0.1:'+port+'/offers/website-audit';
const hash=v=>'sha256:'+createHash('sha256').update(v).digest('hex');
const report={schema:'evercraft.influence-lab.source-layout-preview.v1',
  state:'source_branch_specimen',previewPubliclyDeployed:false,customerCheckoutCreated:false,
  paymentPosted:false,observedAt:new Date().toISOString(),views:[],source:'renderOfferPage local source fixture'};
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
  for(const viewport of [
    {name:'mobile',width:390,height:844,isMobile:true,hasTouch:true},
    {name:'desktop',width:1365,height:850,isMobile:false,hasTouch:false}
  ]){
    const ctx=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},
      isMobile:viewport.isMobile,hasTouch:viewport.hasTouch,deviceScaleFactor:1,
      acceptDownloads:false,serviceWorkers:'block'});
    const page=await ctx.newPage();
    const errors=[],blocked=[];
    page.on('pageerror',e=>errors.push(String(e?.message||e).slice(0,200)));
    await page.route('**/*',async route=>{
      const request=route.request();
      let url;
      try{url=new URL(request.url())}catch{return route.abort()}
      const allowOrigin=(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.port===String(port))||
        (url.protocol==='https:'&&url.origin===OWNED);
      if(!['GET','HEAD'].includes(request.method())||!allowOrigin){
        blocked.push(request.method()+':'+url.origin);return route.abort();
      }
      return route.continue();
    });
    const response=await page.goto(local,{waitUntil:'networkidle',timeout:25000});
    const cta=page.getByRole('button',{name:/Continue to checkout/i});
    const rect=await cta.boundingBox();
    const overflowPx=await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-window.innerWidth));
    const readableHeadline=await page.locator('#audit-title').count()===1;
    const file='branch-'+viewport.name+'-website-audit.png';
    await page.screenshot({path:path.join(out,file),fullPage:true,animations:'disabled'});
    report.views.push({name:viewport.name,status:response?.status()||0,
      priceVisible:await page.getByText(/\$49(?:\b|$)/i).count()>0,
      buttonVisible:await cta.count()>0,
      buttonFirstViewport:rect?rect.y+rect.height<=viewport.height:null,
      horizontalOverflowPx:overflowPx,readableHeadline,
      buttonTop:rect?Math.round(rect.y):null,
      screenshotFile:file,screenshotSha256:hash(fs.readFileSync(path.join(out,file))),
      formActionVerified:await page.locator('form[action="/api/offers/website-audit/checkout"]').count()>0,
      errors,blockedMethods:blocked,formSubmitted:false,paymentAttempted:false});
    await ctx.close();
  }
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
fs.writeFileSync(path.join(out,'branch-preview-receipt.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({schema:report.schema,views:report.views.map(({name,status,buttonTop,buttonFirstViewport,errors})=>({name,status,buttonTop,buttonFirstViewport,errors:errors.length})),publiclyDeployed:false,paymentAttempted:false}));
if(report.views.some(v=>v.status!==200||v.buttonVisible!==true||v.formActionVerified!==true||
  v.errors.length||v.blockedMethods.length||v.horizontalOverflowPx>0||
  v.readableHeadline!==true))process.exitCode=2;
