#!/usr/bin/env node
// First-party public Website Audit offer capture. This is NOT a functioning audit demonstration.
// Read-only anonymous GET/HEAD/OPTIONS, same-origin only, no payment or form submission.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const ORIGIN='https://fabric.systemiacommandcenters.com';
export const OFFER_PATH='/offers/website-audit';
export const ALLOWED_METHODS=new Set(['GET','HEAD','OPTIONS']);

export function admitRequest(url,method){
  if(!ALLOWED_METHODS.has(String(method).toUpperCase()))return {allowed:false,reason:'non_read_method'};
  let parsed;try{parsed=new URL(url);}catch{return {allowed:false,reason:'invalid_url'};}
  if(['data:','blob:'].includes(parsed.protocol))return {allowed:true,reason:'embedded_asset'};
  if(parsed.protocol!=='https:'||parsed.origin!==ORIGIN)return {allowed:false,reason:'off_origin_asset'};
  return {allowed:true,reason:'same_origin_read'};
}
export function pageEvidence({httpStatus,title,heading,hasEmailField,hasCheckoutButton,pageErrorCount}){
  const problems=[];
  if(httpStatus!==200)problems.push('offer_http_not_200');
  if(!/website audit/i.test([title,heading].join(' ')))problems.push('offer_identity_missing');
  if(!hasEmailField)problems.push('buyer_email_field_missing');
  if(!hasCheckoutButton)problems.push('checkout_cta_missing');
  if(pageErrorCount>0)problems.push('browser_runtime_errors');
  return {state:problems.length?'blocked':'public_offer_observed',problems,
    checkoutVerified:false,checkoutActionPerformed:false,
    paymentVerified:false,fulfillmentVerified:false,actualAuditWorkflowCaptured:false,
    capturedScope:'anonymous_public_offer_page_only',publicationAuthority:false};
}
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function output(file,dir){
  const stat=fs.statSync(file);
  return {file:path.relative(dir,file),sha256:digest(file),bytes:stat.size};
}
function probeMp4(file){
  const r=spawnSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,width,height',
    '-of','json',file],{encoding:'utf8',timeout:15000});
  if(r.error||r.status!==0)throw Error('ffprobe_failed');
  const d=JSON.parse(r.stdout);
  const v=(d.streams||[]).find(s=>s.codec_type==='video');
  if(!v||v.width<1000||v.height<600||Number(d.format?.duration)<3)
    throw Error('captured_video_invalid');
  return {durationSec:Number(d.format.duration),width:v.width,height:v.height};
}

export async function capture({outDir,chromium}){
  const dir=path.resolve(outDir);
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const receipt={schema:'evercraft.website-audit.public-capture.v1',
    origin:ORIGIN,route:OFFER_PATH,observedAt:new Date().toISOString(),
    browser:'playwright-chromium',sourceState:'actual_public_offer_not_audit_runtime',
    inputMethods:'GET_HEAD_OPTIONS_only',anonymous:true,
    login:false,checkoutActionPerformed:false,paymentVerified:false,
    productionRights:'owned_browser_capture_pending_human_review',
    publicationAuthority:false,errors:[],requestsDenied:{},files:{},
    state:'blocked'};
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  let context;
  try{
    context=await browser.newContext({
      viewport:{width:1280,height:720},deviceScaleFactor:1,
      serviceWorkers:'block',acceptDownloads:false,
      recordVideo:{dir:path.join(dir,'recorded'),size:{width:1280,height:720}}
    });
    const page=await context.newPage();
    page.on('pageerror',error=>receipt.errors.push(String(error.message||error).slice(0,160)));
    await page.route('**/*',async route=>{
      const req=route.request(),verdict=admitRequest(req.url(),req.method());
      if(!verdict.allowed){
        receipt.requestsDenied[verdict.reason]=(receipt.requestsDenied[verdict.reason]||0)+1;
        await route.abort();return;
      }
      await route.continue();
    });
    let httpStatus=0;
    try{
      const response=await page.goto(ORIGIN+OFFER_PATH,{waitUntil:'domcontentloaded',timeout:25000});
      httpStatus=response?.status()||0;
      await page.waitForTimeout(1600);
      receipt.title=(await page.title()).slice(0,180);
      receipt.heading=(await page.locator('h1').first().textContent().catch(()=>'')||'').trim().slice(0,180);
      receipt.hasEmailField=await page.locator('input[type="email"]').count()>0;
      receipt.hasCheckoutButton=await page.getByRole('button',{name:/continue to checkout/i}).count()>0;
      receipt.httpStatus=httpStatus;
      const screenshot=path.join(dir,'website-audit-public-offer.png');
      await page.screenshot({path:screenshot,fullPage:true,animations:'disabled'});
      receipt.files.screenshot=output(screenshot,dir);
      // Record a real scroll and hover only. No click, typing, POST or external navigation.
      await page.evaluate(()=>window.scrollTo({top:Math.min(680,document.body.scrollHeight-innerHeight),behavior:'smooth'}));
      await page.waitForTimeout(1700);
      await page.evaluate(()=>window.scrollTo({top:0,behavior:'smooth'}));
      await page.waitForTimeout(1600);
    }catch(e){receipt.errors.push('navigation:'+String(e.message||e).slice(0,200));}
    const rawVideo=page.video();
    await context.close();context=null;
    const raw=await rawVideo?.path();
    if(raw&&fs.existsSync(raw)){
      const canonical=path.join(dir,'website-audit-public-offer.webm');
      fs.renameSync(raw,canonical);
      receipt.files.recordingWebm=output(canonical,dir);
      const mp4=path.join(dir,'website-audit-public-offer.mp4');
      const cmd=spawnSync('ffmpeg',['-nostdin','-y','-hide_banner','-loglevel','error',
        '-i',canonical,'-an','-c:v','libx264','-crf','20','-preset','veryfast',
        '-pix_fmt','yuv420p','-movflags','+faststart',mp4],{encoding:'utf8',timeout:60000});
      if(cmd.error||cmd.status!==0){receipt.errors.push('transcode:'+String(cmd.stderr||cmd.error?.message).slice(-140));}
      else{
        receipt.video=probeMp4(mp4);
        receipt.files.previewMp4=output(mp4,dir);
      }
    }
    const result=pageEvidence({
      httpStatus,title:receipt.title,heading:receipt.heading,
      hasEmailField:receipt.hasEmailField,
      hasCheckoutButton:receipt.hasCheckoutButton,
      pageErrorCount:receipt.errors.length
    });
    Object.assign(receipt,result);
    if(!receipt.files.previewMp4)receipt.state='blocked';
  }finally{
    if(context)try{await context.close();}catch{}
    await browser.close();
    fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  }
  return receipt;
}
async function main(){
  const {chromium}=await import('playwright');
  const dir=process.argv[2]||path.resolve('artifacts/saban/website-audit-public-capture');
  const result=await capture({outDir:dir,chromium});
  console.log(JSON.stringify({state:result.state,status:result.httpStatus,
    video:result.files.previewMp4,blockedRequests:result.requestsDenied,
    evidence:result.capturedScope,errors:result.errors,publicationAuthority:false},null,2));
  if(result.state!=='public_offer_observed')process.exitCode=2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  main().catch(error=>{console.error('website_audit_public_capture_failed:'+String(error.message||error));
    process.exitCode=2;});
}
