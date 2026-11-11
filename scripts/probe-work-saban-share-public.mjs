#!/usr/bin/env node
// Read-only external canary for the actual Work Saban free-tool acquisition funnel.
// Never uploads a customer CSV, invokes a social provider, or creates conversion counts.
import assert from 'node:assert/strict';

const raw=String(process.env.WORK_SABAN_PAGES_ROOT||'').trim();
if(!raw)throw Error('WORK_SABAN_PAGES_ROOT is required');
const root=new URL(raw.endsWith('/')?raw:raw+'/');
if(root.protocol!=='https:'||root.hostname!=='jgaethle10.github.io'||
   root.pathname!=='/forge-operator/'||root.search||root.hash)
  throw Error('Work Saban canary requires the exact owned HTTPS Pages origin');

const pages=[
  {key:'owned_try_hub',route:'try/',markers:[
    '03 / Work Saban','Make a free sales report',
    '../work-saban/report/?utm_source=evercraft_try',
    'Sample data only'
  ]},
  {key:'brand_landing',route:'work-saban/',markers:[
    'Give your work','Make your sales report',
    'work-saban-social.png','summary_large_image'
  ]},
  {key:'csv_reporter',route:'work-saban/report/',markers:[
    'Your numbers.','id="csv-file"','id="consent"',
    'id="share-tool"','id="share-feedback"',
    'No account or file upload','work-saban-social.png',
    "connect-src 'none'",'./report.js'
  ]},
  {key:'local_report_script',route:'work-saban/report/report.js',markers:[
    'analyzeSalesCsv','checkSalesReport(text,result)',
    "const toolShareUrl='https://jgaethle10.github.io/forge-operator/work-saban/report/?utm_source=work_saban_tool",
    "navigator.share","navigator.clipboard","share-feedback"
  ]},
  {key:'local_csv_engine',route:'work-saban/report/engine.mjs',markers:[
    'export function analyzeSalesCsv',
    'export function checkSalesReport'
  ]},
  {key:'example_csv',route:'work-saban/example-sales.csv',markers:[
    'month,revenue',
    '2026-07,10500.00'
  ]},
];

async function fetchWithRetry(url,{binary=false}={}){
 let last=null;
 for(let attempt=0;attempt<6;attempt++){
  try{
   const response=await fetch(url,{headers:{'user-agent':'Evercraft-Work-Saban-Acquisition-Canary/1.0'},
    redirect:'follow',cache:'no-store',signal:AbortSignal.timeout(16000)});
   if(response.status!==200)throw Error('HTTP '+response.status);
   if(!response.url.startsWith('https://'))throw Error('Non-HTTPS final URL');
   const body=binary?new Uint8Array(await response.arrayBuffer()):await response.text();
   if(body.length<128)throw Error('Unexpected short resource');
   return {body,status:response.status,final_url:response.url};
  }catch(error){
   last=error;
   if(attempt<5)await new Promise(resolve=>setTimeout(resolve,1200));
  }
 }
 throw last;
}
const findings=[];
try{
 for(const item of pages){
  const url=new URL(item.route,root).href;
  const result=await fetchWithRetry(url);
  const missing=item.markers.filter(marker=>!result.body.includes(marker));
  findings.push({route:item.route,http_status:result.status,missing_markers:missing});
  assert.deepEqual(missing,[],item.key+' is missing expected live-page content');
 }
 const url=new URL('work-saban/brand/work-saban-social.png',root).href;
 const png=await fetchWithRetry(url,{binary:true});
 const header=[137,80,78,71,13,10,26,10];
 assert.ok(header.every((n,i)=>png.body[i]===n),'OG asset is not a real PNG');
 assert.ok(png.body.length>1000,'OG asset is empty');
 const size={width:new DataView(png.body.buffer,png.body.byteOffset+16,4).getUint32(0,false),
   height:new DataView(png.body.buffer,png.body.byteOffset+20,4).getUint32(0,false)};
 assert.deepEqual(size,{width:1200,height:630});
 findings.push({route:'work-saban/brand/work-saban-social.png',http_status:png.status,
   image_dimensions:size,bytes:png.body.length});
 console.log(JSON.stringify({schema:'evercraft.work-saban.acquisition-public-canary.v1',
  status:'public_https_verified',checks:findings,customer_csv_uploaded:false,
  social_post_submitted:false,paid_sale_observed:false,visitor_tracking_available:false},null,2));
 if(process.env.GITHUB_STEP_SUMMARY){
  const fs=await import('node:fs');
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    '\n## Work Saban free-tool acquisition canary\n\n'+
    '- Real CSV reporter, share control, no-upload script and 1200×630 first-party PNG: **verified HTTP 200**.\n'+
    '- Free tool: '+new URL('work-saban/report/',root).href+'\n'+
    '- No inference of traffic, real buyers, ad spend or social publication.\n');
 }
}catch(e){
 console.error(JSON.stringify({schema:'evercraft.work-saban.acquisition-public-canary.v1',
  status:'blocked_public_verification',checks:findings,error:String(e?.message||e).slice(0,250),
  customer_csv_uploaded:false,social_post_submitted:false,paid_sale_observed:false}));
 process.exitCode=1;
}
