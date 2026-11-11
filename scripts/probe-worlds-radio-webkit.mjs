// Safari-engine compatibility only: Playwright WebKit with emulated iPhone layout.
// Synthetic catalog and stubbed audio. NOT proof of a real iPhone, station,
 // actual speaker output, production deployment, or commercial stream rights.
import assert from 'node:assert/strict';
import {webkit,devices} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const origin='http://127.0.0.1:8898';
const out=resolve('artifacts/evercraft-worlds-radio');
await mkdir(out,{recursive:true});
const receipt={
  schema:'evercraft.worlds.radio.webkit-compat.v1',
  observed_at_utc:new Date().toISOString(),
  engine:'Playwright WebKit',
  device:'emulated iPhone layout, NOT physical iOS Safari',
  synthetic:true,live_station_playback_verified:false,
  physical_ios_verified:false,production_deployed:false,
  status:'NOT_RUN'
};
const server=spawn(process.execPath,[
  'systemia/worlds/worlds-vault-runtime.mjs','--host','127.0.0.1','--port','8898',
  '--public-root','public','--data-root','artifacts/evercraft-worlds-radio/webkit-vault'
],{stdio:'ignore'});
let browser;
try{
  let ready=false;
  for(let i=0;i<32;i++){
    try{const res=await fetch(origin+'/worlds/');if(res.ok){ready=true;break;}}catch{}
    await new Promise(r=>setTimeout(r,300));
  }
  assert.equal(ready,true,'owned local Worlds test server unavailable');
  browser=await webkit.launch({headless:true});
  const context=await browser.newContext({...devices['iPhone 13']});
  await context.addInitScript(()=>{
    window.__worldRadioPlayCount=0;
    HTMLMediaElement.prototype.play=function(){
      window.__worldRadioPlayCount++;
      return Promise.resolve();
    };
  });
  const near={stationuuid:'4a2ee96b-0011-4222-8333-998855aa1122',
    name:'Synthetic Yakima Radio',url_resolved:'https://fixtures.example.test/live.mp3',
    geo_lat:46.6,geo_long:-120.51,countrycode:'US',state:'Washington',
    lastcheckok:1,votes:1,codec:'MP3'};
  const far={...near,stationuuid:'4a2ee96b-0011-4222-8333-998855aa1133',
    geo_lat:1,geo_long:1,name:'Outside Yakima radius'};
  let searches=0;
  await context.route('**/json/stations/search?**',async route=>{
    searches++;
    await route.fulfill({status:200,contentType:'application/json',
      headers:{'access-control-allow-origin':'*'},body:JSON.stringify([near,far])});
  });
  await context.route('**/json/url/**',r=>r.fulfill({
    status:200,contentType:'application/json',body:'{"ok":"true"}'
  }));
  const page=await context.newPage();
  let radioModuleError=null;
  page.on('pageerror',e=>{
    if(/world-radio/i.test(String(e?.stack||e)))radioModuleError=String(e.message).slice(0,180);
  });
  const response=await page.goto(origin+'/worlds/',{waitUntil:'domcontentloaded',timeout:22000});
  assert.equal(response?.status(),200,'Worlds returned non-200');
  await page.locator('#worldRadioToggle').waitFor({state:'visible',timeout:10000});
  assert.equal(searches,0,'unexpected radio catalog lookup without visitor action');
  assert.equal(await page.locator('#wrMini').isVisible(),false,'mini player opened without station');
  await page.locator('#worldRadioToggle').click();
  await page.locator('#wrExplore').click();
  await page.locator('#wrStations button').first().waitFor({state:'visible',timeout:15000});
  assert.equal(await page.locator('#wrStations button').count(),1,'radius filter leaked far-away station');
  assert.equal(await page.evaluate(()=>window.__worldRadioPlayCount),0,'unexpected autoplay');
  await page.locator('#wrStations button').first().click();
  assert.equal(await page.evaluate(()=>window.__worldRadioPlayCount),1,'station click did not initiate playback');
  await page.locator('#wrClose').click();
  assert.equal(await page.locator('#wrMini').isVisible(),true,'persistent player missing');
  await page.locator('#wrMiniOpen').click();
  assert.equal(await page.locator('#worldRadioPanel').isVisible(),true,'station list could not reopen');
  await page.locator('#wrClose').click();
  await page.locator('#wrMiniStop').click();
  assert.equal(await page.locator('#wrMini').isVisible(),false,'stop did not dismiss player');
  assert.equal(await page.locator('#wrAudio').getAttribute('src'),null,'stop left stream URL attached');
  assert.equal(radioModuleError,null,'radio module browser exception');
  const sizes=await page.evaluate(()=>({
    width:document.documentElement.scrollWidth,viewport:innerWidth,
    buttonHeight:document.querySelector('#worldRadioToggle').getBoundingClientRect().height
  }));
  assert.ok(sizes.width<=sizes.viewport+3,'horizontal viewport overflow');
  await page.screenshot({path:out+'/webkit-iphone-layout.png'});
  receipt.status='PASS';
  receipt.synthetic_catalog_requests=searches;
  receipt.stub_play_calls=1;
  receipt.viewport=sizes;
  await context.close();
}catch(err){
  receipt.status='FAIL';
  receipt.error=String(err?.message||err).slice(0,500);
  process.exitCode=1;
}finally{
  await writeFile(out+'/webkit-compat-receipt.json',JSON.stringify(receipt,null,2)+'\n');
  if(browser)await browser.close();
  server.kill('SIGTERM');
  console.log(JSON.stringify(receipt,null,2));
}