#!/usr/bin/env node
/**
 * Real first-party visual source capture for Fallen Studios.
 * NOT an advertisement, client case study, or cleared portfolio piece.
 * Records actual browser pixels from the published Evercraft Studio site.
 * Never sends a form, creates a customer, handles payments or inserts fake footage.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';

const URL='https://jgaethle10.github.io/forge-operator/commercial-studio/';
const output=path.resolve(process.env.FALLEN_SITE_CAPTURE_DIR||'/tmp/fallen-real-site-capture');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function command(bin,args){
  const proc=spawnSync(bin,args,{encoding:'utf8',maxBuffer:8*1024*1024,timeout:160000});
  if(proc.status!==0)throw Error(bin+'_failed:'+String(proc.stderr||'').slice(-700));
  return String(proc.stdout||'');
}
async function glide(page,selector,holdMs=1700){
  const y=await page.locator(selector).evaluate(el=>Math.max(0,el.getBoundingClientRect().top+window.scrollY-115));
  await page.evaluate(y=>window.scrollTo({top:y,behavior:'smooth'}),y);
  await page.waitForTimeout(holdMs);
}
async function run(){
  fs.mkdirSync(output,{recursive:true});
  const capture=path.join(output,'browser-source');
  fs.mkdirSync(capture,{recursive:true});
  const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});
  let context;
  const source={url:URL,observed_at:new Date().toISOString(),page_verified:false,
    customer_video:false,client_portfolio_approved:false,usage:'INTERNAL_REAL_UI_CAPTURE_REVIEW_ONLY',
    paid_campaign_authorized:false,claim:'Public first-party website footage; no paid-client outcome is portrayed.'};
  try{
    context=await browser.newContext({
      // True mobile CSS layout at 360x640, captured at 3x pixel density.
      // A desktop 1080px CSS viewport creates tiny unreadable vertical footage.
      viewport:{width:360,height:640},
      deviceScaleFactor:3,locale:'en-US',
      colorScheme:'dark',reducedMotion:'no-preference',
      recordVideo:{dir:capture,size:{width:1080,height:1920}},
    });
    const page=await context.newPage();
    const response=await page.goto(URL,{waitUntil:'networkidle',timeout:30000});
    if(response?.status()!==200)throw Error('live_owned_page_not_http_200');
    const txt=await page.locator('body').innerText();
    if(!txt.includes('$50 commercial')||!txt.includes('30-second social video')||
       !txt.includes('Send my commercial brief'))throw Error('current_owned_offer_not_visible');
    source.page_verified=true;
    await page.screenshot({path:path.join(output,'01_hero.png')});
    await page.waitForTimeout(3000);
    await glide(page,'#intro-offer',3100);
    await page.screenshot({path:path.join(output,'02_scoped_pilot.png')});
    await glide(page,'#work',3000);
    await page.screenshot({path:path.join(output,'03_our_own_product_proof.png')});
    // Frame the real inquiry FORM, not merely the long section headline above it.
    await glide(page,'#studio-request',3500);
    await page.screenshot({path:path.join(output,'04_consent_inquiry.png')});
    const video=page.video();
    await page.close();
    await context.close();
    context=null;
    const raw=await video.path();
    const mp4=path.join(output,'evercraft-studio-actual-site-visual-source_1080x1920.mp4');
    command('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',raw,
      '-vf','fps=30,format=yuv420p','-c:v','libx264','-preset','medium','-crf','18',
      '-movflags','+faststart','-an',mp4]);
    const probe=JSON.parse(command('ffprobe',['-v','error','-show_format','-show_streams','-of','json',mp4]));
    const videoStream=(probe.streams||[]).find(x=>x.codec_type==='video');
    const duration=Number(probe.format?.duration||0);
    if(!videoStream||videoStream.width!==1080||videoStream.height!==1920||
       duration<12||duration>32)throw Error('site_capture_encoding_or_duration_invalid');
    const receipt={schema:'evercraft.fallen.real-public-ui-source.v1',...source,
      path:mp4,sha256:sha(mp4),duration_seconds:duration,width:videoStream.width,height:videoStream.height,
      silent:true,source_type:'real_browser_pixels',scene_count:4,
      screenshots:['01_hero.png','02_scoped_pilot.png','03_our_own_product_proof.png','04_consent_inquiry.png']
        .map(name=>({name,sha256:sha(path.join(output,name))})),
      release_state:'REJECTED_FOR_PAID_PORTFOLIO_UNTIL_OWNER_CREATIVE_REVIEW',
      limitations:['Website screen capture is NOT a client commercial','No licensed people, roofing footage or external job results',
        'No voiceover or soundtrack included','Original browser pixels require creative edit and separate owner/client approval']};
    fs.writeFileSync(path.join(output,'real-ui-footage-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
    console.log(JSON.stringify({file:mp4,receipt:path.join(output,'real-ui-footage-receipt.json'),
      duration,sha256:receipt.sha256,source:URL,release:receipt.release_state}));
  }finally{await context?.close().catch(()=>{});await browser.close();}
}
run().catch(e=>{console.error(String(e?.message||e));process.exitCode=1;});
