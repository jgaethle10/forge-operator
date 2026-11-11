// Non-gating, opt-in browser-media QA against live third-party radio streams.
// No recording, proxying, screenshots of broadcast media, or persisted stream URLs.
// Proves only whether *CI Chromium's media element* reached "playing", not physical sound.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const origin='http://127.0.0.1:8897';
const out=resolve('artifacts/evercraft-worlds-radio');
await mkdir(out,{recursive:true});
const receipt={
  schema:'evercraft.worlds.radio.browser-media-observation.v1',
  observed_at_utc:new Date().toISOString(),
  target:'Yakima, Washington',
  browser:'GitHub-hosted Playwright Chromium (not physical iPhone or speaker test)',
  consent_model:'QA clicked station button; no autoplay',
  stream_urls_persisted:false,audio_bytes_recorded:false,
  production_deployed:false,physical_audio_verified:false,
  attempts:[]
};
const server=spawn(process.execPath,[
  'systemia/worlds/worlds-vault-runtime.mjs','--host','127.0.0.1','--port','8897',
  '--public-root','public','--data-root','artifacts/evercraft-worlds-radio/live-vault'
],{stdio:'ignore'});
let browser;
try{
  await new Promise(r=>setTimeout(r,1100));
  browser=await chromium.launch({headless:true,args:[
    '--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader'
  ]});
  const context=await browser.newContext({viewport:{width:1280,height:800}});
  const page=await context.newPage();
  page.on('pageerror',err=>{
    receipt.page_errors??=[];
    receipt.page_errors.push(String(err?.message||'browser error').slice(0,120));
  });
  const loaded=await page.goto(origin+'/worlds/',{waitUntil:'domcontentloaded',timeout:20000});
  if(loaded?.status()!==200)throw Error('local_worlds_route_failed');
  await page.locator('#worldRadioToggle').click({timeout:15000});
  await page.locator('#wrPreset').selectOption('0');
  await page.locator('#wrExplore').click();
  // The actual live directory response is requested by the browser; no fixture.
  await page.waitForFunction(()=>{
    const t=document.querySelector('#wrStatus')?.textContent||'';
    return /listed within 350 km|No geotagged|directory unavailable/.test(t);
  },null,{timeout:32000});
  const status=await page.locator('#wrStatus').innerText();
  const count=await page.locator('#wrStations button').count();
  receipt.directory_visible=count>0;
  receipt.station_count_visible=count;
  if(!count)receipt.reason='no_playable_station_candidate_in_browser';
  // Limit external stream requests and never persist their URLs or media data.
  for(let i=0;i<Math.min(3,count);i++){
    await page.evaluate(()=>{
      const a=document.querySelector('#wrAudio');
      a.pause();a.removeAttribute('src');a.load();
      window.__radioMediaEvents=[];
      if(window.__radioMediaHandler){
        for(const event of ['playing','timeupdate','error','stalled','waiting'])a.removeEventListener(event,window.__radioMediaHandler);
      }
      window.__radioMediaHandler=(e)=>{
        window.__radioMediaEvents.push({
          type:e.type,readyState:a.readyState,currentTime:Math.round(a.currentTime*10)/10
        });
      };
      for(const event of ['playing','timeupdate','error','stalled','waiting'])a.addEventListener(event,window.__radioMediaHandler);
    });
    const button=page.locator('#wrStations button').nth(i);
    const name=(await button.locator('strong').innerText()).slice(0,100);
    await button.click();
    let reachedPlaying=false;
    try{
      await page.waitForFunction(()=>{
        const audio=document.querySelector('#wrAudio');
        return (window.__radioMediaEvents||[]).some(x=>x.type==='playing') &&
          audio && audio.readyState>=2 && !audio.paused;
      },null,{timeout:10000,polling:250});
      reachedPlaying=true;
    }catch{}
    const media=await page.evaluate(()=>{
      const a=document.querySelector('#wrAudio');
      return {
        paused:a.paused,readyState:a.readyState,
        events:(window.__radioMediaEvents||[]).slice(0,12),
        error_code:a.error?.code||null
      };
    });
    receipt.attempts.push({
      station:name,playing_event_with_decodable_data:reachedPlaying,
      ready_state:media.readyState,error_code:media.error_code,
      media_events:media.events.map(e=>e.type)
    });
    await page.evaluate(()=>{
      const a=document.querySelector('#wrAudio');
      a.pause();a.removeAttribute('src');a.load();
    });
    if(reachedPlaying)break;
  }
  receipt.browser_media_playback_observed=receipt.attempts.some(x=>x.playing_event_with_decodable_data);
  receipt.status=receipt.browser_media_playback_observed?'BROWSER_MEDIA_PLAYING_OBSERVED':'UNVERIFIED_BROWSER_MEDIA';
  await context.close();
}catch(error){
  receipt.status='UNVERIFIED_BROWSER_MEDIA';
  receipt.reason=String(error?.message||'probe error').slice(0,150);
  receipt.browser_media_playback_observed=false;
}finally{
  if(browser)await browser.close();
  server.kill('SIGTERM');
  await writeFile(out+'/live-browser-media-receipt.json',JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(receipt,null,2));
}
if(!receipt.browser_media_playback_observed)process.exitCode=1;
