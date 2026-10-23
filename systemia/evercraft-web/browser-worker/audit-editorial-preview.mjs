#!/usr/bin/env node
// An unpublicized, localhost-only Saban reviewer. Never clicks, submits, pays,
// records customer data, or treats source-branch screenshots as live deployment.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {renderOfferPage} from '../../mcp/fabric-public-site.mjs';

const pos=process.argv.indexOf('--out');
if(pos<0||!process.argv[pos+1])throw Error('Usage: node audit-editorial-preview.mjs --out <new directory>');
const out=path.resolve(process.argv[pos+1]);
fs.mkdirSync(out,{recursive:false,mode:0o700});

const item={public_id:'audit-center-website-audit-machine-v1',name:'Systemia Website Audit',
  description:'Public-web diagnosis',state:'payment_ready',commercial_state:'sell_now',
  pricing:'Free preview. Quick Win Audit $49 one-time. Paid delivery only after verified settlement.',
  entry_paid_offer:{name:'Quick Win Audit',price:'$49',price_usd_normalized:49,billing:'one_time'},
};
const host='127.0.0.1';
const watermark='<div aria-label="Source-only design review" style="position:fixed;z-index:999;top:8px;right:8px;max-width:170px;padding:7px 9px;color:#fff;background:#42213c;border:2px solid #e8a0bd;border-radius:7px;font:700 10px system-ui;pointer-events:none">SOURCE REVIEW • NOT LIVE • NO PAYMENT</div>';
function buildPage(hold){
  const src=renderOfferPage(item,{checkoutConfigured:!hold});
  return src.replace('<body>','<body>'+watermark);
}
const server=http.createServer((req,res)=>{
  if(req.method!=='GET'||!['/open','/held'].includes(req.url)){
    res.writeHead(404);res.end();return;
  }
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(buildPage(req.url==='/held'));
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,host,resolve)});
const port=server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const checksum=v=>'sha256:'+createHash('sha256').update(v).digest('hex');
const report={schema:'evercraft.audit-editorial.source-preview.v1',observedAt:new Date().toISOString(),
  state:'nonproduction_review',liveDeployed:false,paymentAttempted:false,
  publisherAuthorized:false,views:[],blockers:[]};
try{
  for(const view of [
    {name:'mobile',width:390,height:844,isMobile:true,hasTouch:true},
    {name:'desktop',width:1365,height:850,isMobile:false,hasTouch:false},
  ])for(const hold of [false,true]){
    const name=view.name+'-'+(hold?'held':'open');
    const ctx=await browser.newContext({viewport:{width:view.width,height:view.height},
      isMobile:view.isMobile,hasTouch:view.hasTouch,deviceScaleFactor:1,
      serviceWorkers:'block',acceptDownloads:false});
    const page=await ctx.newPage();
    const errors=[],blocked=[];
    page.on('pageerror',e=>errors.push(String(e?.message||e).slice(0,180)));
    await page.route('**/*',route=>{
      const req=route.request(),u=new URL(req.url());
      if(!['GET','HEAD'].includes(req.method())||u.hostname!==host||u.port!==String(port)){
        blocked.push(req.method()+':'+u.origin);return route.abort();
      }
      return route.continue();
    });
    const response=await page.goto('http://'+host+':'+port+'/'+(hold?'held':'open'),{waitUntil:'domcontentloaded',timeout:20000});
    const button=hold?page.getByRole('link',{name:/Request an approved invoice/}):
      page.getByRole('button',{name:/Continue to checkout/});
    const rect=await button.boundingBox();
    const overflow=await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-window.innerWidth));
    const screenshot=name+'.png';
    await page.screenshot({path:path.join(out,screenshot),fullPage:true,animations:'disabled'});
    const countForms=await page.locator('form[action="/api/offers/website-audit/checkout"]').count();
    const entry={name,viewport:{width:view.width,height:view.height},httpStatus:response?.status()||0,
      ctaVisible:await button.count()===1,ctaFirstViewport:Boolean(rect&&rect.y+rect.height<=view.height),
      ctaTop:rect?Math.round(rect.y):null,horizontalOverflowPx:overflow,
      headingVisible:await page.locator('#audit-title').count()===1,
      checkoutFormCount:countForms,readOnly:true,submitted:false,
      screenshot,sha256:checksum(fs.readFileSync(path.join(out,screenshot))),
      pageErrors:errors,blockedRequests:blocked};
    report.views.push(entry);
    if(!entry.ctaVisible||!entry.ctaFirstViewport||entry.horizontalOverflowPx||
      entry.httpStatus!==200||!entry.headingVisible||errors.length||blocked.length||
      countForms!==(hold?0:1))report.blockers.push(name+':visual_or_checkout_contract');
    await ctx.close();
  }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
fs.writeFileSync(path.join(out,'source-preview-receipt.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({state:report.state,views:report.views.map(v=>({name:v.name,ctaTop:v.ctaTop,
  firstViewport:v.ctaFirstViewport,overflow:v.horizontalOverflowPx})),blockers:report.blockers,
  liveDeployed:false,paymentAttempted:false}));
if(report.blockers.length)process.exitCode=2;
