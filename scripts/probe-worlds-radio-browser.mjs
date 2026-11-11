// Deterministic radio-browser UI smoke: entirely synthetic station catalog/audio.
// Does NOT prove real broadcaster reachability, rights, actual iPhone, or public deployment.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const origin='http://127.0.0.1:8876';
const out=resolve('artifacts/evercraft-worlds-radio');
await mkdir(out,{recursive:true});
const service=spawn(process.execPath,[
  'systemia/worlds/worlds-vault-runtime.mjs','--host','127.0.0.1','--port','8876',
  '--public-root','public','--data-root','artifacts/evercraft-worlds-radio/private-vault'
],{stdio:'ignore'});
const receipt={schema:'evercraft.worlds.radio.browser-smoke.v1',synthetic:true,
  station_stream_verified:false,physical_mobile_verified:false,production_deployed:false,
  observed_at_utc:new Date().toISOString(),scenarios:[]};
const near={stationuuid:'4a2ee96b-0011-4222-8333-998855aa1122',name:'Synthetic Yakima Test Station',
  url_resolved:'https://fixtures.example.test/stream.mp3',geo_lat:46.6,geo_long:-120.51,
  countrycode:'US',state:'Washington',lastcheckok:1,codec:'MP3',votes:5};
const far={...near,stationuuid:'4a2ee96b-0011-4222-8333-998855aa1133',
  name:'Synthetic Far-Away Station',geo_lat:30,geo_long:100};
let browser;
try{
  await new Promise(r=>setTimeout(r,950));
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl',
    '--use-gl=angle','--use-angle=swiftshader']});
  for(const profile of [
    {name:'desktop',viewport:{width:1280,height:780},isMobile:false,hasTouch:false},
    {name:'phone-emulation',viewport:{width:390,height:844},isMobile:true,hasTouch:true}
  ]){
    const context=await browser.newContext({viewport:profile.viewport,isMobile:profile.isMobile,
      hasTouch:profile.hasTouch,deviceScaleFactor:1});
    await context.addInitScript(()=>{
      window.__radioPlayCalls=0;
      HTMLMediaElement.prototype.play=function(){window.__radioPlayCalls++;return Promise.resolve();};
    });
    let catalogRequests=0;
    await context.route('**/json/stations/search?**',async route=>{
      catalogRequests++;
      await route.fulfill({status:200,contentType:'application/json',
        headers:{'access-control-allow-origin':'*'},body:JSON.stringify([near,far])});
    });
    await context.route('**/json/url/**',r=>r.fulfill({
      status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},
      body:'{"ok":"true"}'
    }));
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(String(e.message).slice(0,220)));
    const response=await page.goto(origin+'/worlds/',{waitUntil:'domcontentloaded',timeout:25000});
    assert.equal(response?.status(),200,profile.name+': Worlds unavailable');
    const toggle=page.locator('#worldRadioToggle');
    await toggle.waitFor({state:'visible',timeout:12000});
    assert.equal(catalogRequests,0,'catalog queried without user action');
    assert.equal(await page.locator('#worldRadioPanel').isVisible(),false);
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'),'true');
    assert.equal(await page.locator('#worldRadioPanel').isVisible(),true);
    await page.locator('#wrPreset').selectOption('0');
    await page.locator('#wrExplore').click();
    await page.locator('#wrStations button').first().waitFor({state:'visible',timeout:12000});
    assert.equal(await page.locator('#wrStations button').count(),1,'geo filter leaked far-away station');
    assert.equal(catalogRequests,1,'unexpected extra catalog requests');
    assert.equal(await page.evaluate(()=>window.__radioPlayCalls),0,'audio played without consent');
    assert.equal(await page.locator('#wrAudio').getAttribute('src'),null);
    await page.locator('#wrStations button').first().click();
    assert.equal(await page.evaluate(()=>window.__radioPlayCalls),1,'play not called on station click');
    assert.equal(await page.locator('#wrAudio').getAttribute('src'),near.url_resolved);
    const rect=await page.locator('#wrMap').boundingBox();
    assert.ok(rect?.width>250&&rect?.height>100,profile.name+': map unreadable');
    const dimensions=await page.evaluate(()=>({
      page:document.documentElement.scrollWidth,viewport:innerWidth,
      panel:document.querySelector('#worldRadioPanel').getBoundingClientRect().width
    }));
    assert.ok(dimensions.page<=dimensions.viewport+3,profile.name+': horizontal overflow');
    await page.screenshot({path:out+'/'+profile.name+'.png',timeout:10000});
    await page.locator('#wrClose').click();
    assert.equal(await page.locator('#worldRadioPanel').isVisible(),false);
    assert.equal(await page.locator('#wrMini').isVisible(),true,'no mini-player after closing station drawer');
    assert.match(await page.locator('#wrMiniStation').innerText(),/Synthetic Yakima Test Station/);
    await page.locator('#start').click();
    await page.locator('#hud').waitFor({state:'visible',timeout:12000});
    assert.equal(await page.locator('#wrAudio').getAttribute('src'),near.url_resolved,
      'world exploration dropped station');
    await page.locator('#wrMiniOpen').click();
    assert.equal(await page.locator('#worldRadioPanel').isVisible(),true,'mini-player cannot reopen stations');
    assert.equal(await page.locator('#wrMini').isVisible(),false,'mini should hide beneath open drawer');
    await page.locator('#wrClose').click();
    await page.locator('#wrMiniStop').click();
    assert.equal(await page.locator('#wrMini').isVisible(),false,'stop must dismiss mini-player');
    assert.equal(await page.locator('#wrAudio').getAttribute('src'),null,'stop must disconnect stream');
    assert.deepEqual(errors,[],profile.name+': browser exception');
    receipt.scenarios.push({profile:profile.name,result:'PASS',catalogRequests,
      audio_start_calls:1,synthetic_station:near.name,map_width:rect.width,dimensions});
    await context.close();
  }
  // Yakima interpretation is historical; the station remains explicitly PRESENT-DAY.
  // Check the hosted integration separately from the standalone offline fallback.
  const yakimaContext=await browser.newContext({viewport:{width:390,height:844},
    isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await yakimaContext.addInitScript(()=>{
    window.__radioPlayCalls=0;
    HTMLMediaElement.prototype.play=function(){window.__radioPlayCalls++;return Promise.resolve();};
  });
  let yakimaRequests=0;
  await yakimaContext.route('**/json/stations/search?**',async route=>{
    yakimaRequests++;
    await route.fulfill({status:200,contentType:'application/json',
      headers:{'access-control-allow-origin':'*'},body:JSON.stringify([near,far])});
  });
  await yakimaContext.route('**/json/url/**',r=>r.fulfill({
    status:200,contentType:'application/json',body:'{"ok":"true"}'
  }));
  const yakimaPage=await yakimaContext.newPage(),yakimaErrors=[];
  yakimaPage.on('pageerror',e=>yakimaErrors.push(String(e.message).slice(0,220)));
  const yakimaResponse=await yakimaPage.goto(
    origin+'/worlds/hidden-world/yakima-standalone.html',
    {waitUntil:'domcontentloaded',timeout:25000}
  );
  assert.equal(yakimaResponse?.status(),200,'Yakima walkthrough unavailable');
  const yakimaToggle=yakimaPage.locator('#worldRadioToggle');
  await yakimaToggle.waitFor({state:'visible',timeout:18000});
  assert.match(await yakimaToggle.textContent(),/Live Yakima radio/);
  assert.equal(yakimaRequests,0,'Yakima queried catalog without visitor consent');
  await yakimaToggle.click();
  await yakimaPage.locator('#wrExplore').click();
  await yakimaPage.locator('#wrStations button').first().waitFor({state:'visible',timeout:12000});
  assert.match(await yakimaPage.locator('.wr-history').textContent(),/PRESENT-DAY/);
  await yakimaPage.locator('#wrStations button').first().click();
  assert.equal(await yakimaPage.evaluate(()=>window.__radioPlayCalls),1);
  await yakimaPage.locator('#wrClose').click();
  assert.equal(await yakimaPage.locator('#wrMini').isVisible(),true,'Yakima mini-player not visible');
  assert.deepEqual(yakimaErrors,[],'Yakima historical walkthrough browser errors');
  await yakimaPage.screenshot({path:out+'/yakima-phone-emulation.png',timeout:15000});
  receipt.scenarios.push({profile:'yakima-phone-emulation',result:'PASS',synthetic:true,
    catalogRequests:yakimaRequests,audio_start_calls:1,present_day_disclosure:true});
  await yakimaContext.close();
  receipt.status='PASS';
}catch(error){
  receipt.status='FAIL';receipt.error=String(error?.stack||error);process.exitCode=1;
}finally{
  await writeFile(out+'/receipt.json',JSON.stringify(receipt,null,2));
  if(browser)await browser.close();
  service.kill('SIGTERM');
  console.log(JSON.stringify(receipt,null,2));
}