// AAAR v0.8 mobile cockpit E2E against the PR's LOCAL SOURCE, never the older hosted release.
// Desktop / phone emulation is NOT physical iPhone Safari acceptance.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {chromium,webkit} from 'playwright';

const engine=process.env.AAAR_BROWSER==='webkit'?'webkit':'chromium';
const browserDriver=engine==='webkit'?webkit:chromium;
const html=await readFile('public/worlds/flight/index.html','utf8');
const server=createServer((req,res)=>{
 if(req.method!=='GET'||req.url!=='/worlds/flight/'){
  res.writeHead(404);res.end('not_found');return;
 }
 res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
 res.end(html);
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const base='http://127.0.0.1:'+server.address().port+'/worlds/flight/';
let browser;
const receipts=[];
try{
 browser=await browserDriver.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(String(e.message||e)));
 const response=await page.goto(base,{waitUntil:'domcontentloaded',timeout:20000});
 assert.equal(response?.status(),200);
 await page.waitForFunction(()=>!document.querySelector('#scriptBlocked'),null,{timeout:8000});
 await page.locator('#designFromStart').click();
 await page.locator('#foundryOverlay.open').waitFor({state:'visible',timeout:10000});
 const inputSelection=await page.locator('#fi_massKg').evaluate(el=>{const css=getComputedStyle(el);return css.userSelect||css.webkitUserSelect||css.getPropertyValue('-webkit-user-select');});
 assert.equal(inputSelection,'text','Foundry form inputs must remain editable/selectable');
 await page.locator('#foundryClose').click();
 await page.locator('#beginFlight').click();
 await page.waitForFunction(()=>document.querySelector('#startScreen')?.style.display==='none',null,{timeout:8000});
 for(const orientation of [
  {name:'portrait',width:390,height:844},
  {name:'landscape',width:844,height:390}
 ]){
  await page.setViewportSize({width:orientation.width,height:orientation.height});
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#flightStick').isVisible(),true,orientation.name+': flight stick hidden');
  assert.equal(await page.locator('#flightThrottleRange').isVisible(),true,orientation.name+': throttle slider hidden');
  const layout=await page.evaluate(()=>{
   const box=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom}};
   return {view:innerWidth,content:document.documentElement.scrollWidth,stick:box('flightStick'),throttle:box('flightThrottleRange'),actions:box('openFoundry'),instrument:box('flightTelemetryMissing')};
  }).catch(()=>null);
  // Avoid depending on a backend-specific screenshot or timer. Inspect actual geometry.
  const dims=await page.evaluate(()=>{
   const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
   return {view:innerWidth,content:document.documentElement.scrollWidth,stick:rect('flightStick'),throttle:rect('flightThrottleRange'),actions:rect('openFoundry')};
  });
  assert.ok(dims.content<=dims.view+3,orientation.name+': horizontal overflow');
  assert.ok(dims.stick.width>90&&dims.stick.height>90,orientation.name+': thumb stick too small');
  assert.ok(dims.stick.left>=-1&&dims.stick.right<=dims.view+1,orientation.name+': stick outside viewport');
  assert.ok(dims.throttle.left>=-1&&dims.throttle.right<=dims.view+1,orientation.name+': throttle outside viewport');
  assert.ok(dims.stick.right<dims.throttle.left,orientation.name+': thumb controls overlap');
  await page.waitForFunction(()=>window.AAARSceneMetrics?.().frames>=3,null,{timeout:10000});
  const scenery=await page.evaluate(()=>window.AAARSceneMetrics());
  assert.equal(scenery.renderMode,'canvas2d',orientation.name+': missing mobile scenery fallback');
  assert.ok(scenery.treesTotal>500,orientation.name+': Cedar Basin forest population missing');
  assert.ok(scenery.terrainPolygons>300,orientation.name+': ground geometry not drawn');
  assert.ok(Number.isFinite(scenery.renderCostMs)&&scenery.renderCostMs>0&&scenery.renderCostMs<500,orientation.name+': renderer not time-bounded');
  const colors=await page.locator('#flightCanvas').evaluate(canvas=>{
    const ctx=canvas.getContext('2d');if(!ctx)return 0;
    const pts=new Set();
    for(let y=0;y<12;y++)for(let x=0;x<18;x++){
      const pixel=ctx.getImageData(Math.min(canvas.width-1,Math.floor((x+.5)*canvas.width/18)),Math.min(canvas.height-1,Math.floor((y+.5)*canvas.height/12)),1,1).data;
      pts.add([pixel[0]>>3,pixel[1]>>3,pixel[2]>>3].join('-'));
    }
    return pts.size;
  });
  assert.ok(colors>18,orientation.name+': rendered world appears blank or unpainted, color bins='+colors);
  const selected=await page.locator('#flightStick').evaluate(el=>{const css=getComputedStyle(el);return css.userSelect||css.webkitUserSelect||css.getPropertyValue('-webkit-user-select');});
  assert.equal(selected,'none',orientation.name+': iOS text selection still allowed on joystick');
  const box=await page.locator('#flightStick').boundingBox();
  const x=box.x+box.width/2,y=box.y+box.height/2;
  const before=Number(await page.locator('#bankOut').innerText());
  await page.mouse.move(x,y);await page.mouse.down();
  await page.mouse.move(x+box.width*.31,y-box.height*.24,{steps:5});
  const active=await page.locator('#flightStick').getAttribute('data-active');
  assert.equal(active,'true',orientation.name+': pointer drag did not reach flight stick');
  const displacement=await page.locator('#flightStickKnob').evaluate(el=>el.style.getPropertyValue('--stick-x'));
  assert.ok(Math.abs(parseFloat(displacement))>5,orientation.name+': stick did not move');
  await page.waitForTimeout(500);
  const after=Number(await page.locator('#bankOut').innerText());
  assert.ok(after>before,orientation.name+': aircraft bank did not respond to drag ('+before+' -> '+after+')');
  await page.mouse.up();await page.waitForTimeout(60);
  assert.equal(await page.locator('#flightStickKnob').evaluate(el=>el.style.getPropertyValue('--stick-x')),'0px',orientation.name+': stick failed to self-center on release');
  // Native input keyboard event, not synthetic replacement of the flight engine.
  const slider=page.locator('#flightThrottleRange');await slider.focus();await page.keyboard.press('End');
  await page.waitForTimeout(100);
  assert.equal((await page.locator('#flightThrottleValue').innerText()).trim(),'100%',orientation.name+': throttle lever is not wired');
  await page.locator('#mobileHudToggle').click();
  assert.equal(await page.locator('#mobileHudToggle').getAttribute('aria-pressed'),'true');
  await page.locator('#mobileHudToggle').click();
  assert.equal(await page.locator('#mobileHudToggle').getAttribute('aria-pressed'),'false');
  await page.locator('#mobileMoreToggle').click();
  assert.equal(await page.locator('#mobileMoreToggle').getAttribute('aria-expanded'),'true');
  assert.equal(await page.locator('#planeType').isVisible(),true,orientation.name+': More must expose aircraft selection');
  await page.locator('#mobileMoreToggle').click();
  await page.locator('#pauseToggle').click();
  assert.equal(await page.locator('#pauseToggle').getAttribute('data-paused'),'true');
  await page.locator('#pauseToggle').click();
  assert.equal(await page.locator('#pauseToggle').getAttribute('data-paused'),'false');
  receipts.push({orientation:orientation.name,viewport:orientation.width+'x'+orientation.height,stick_drag:true,aircraft_bank_changes:true,auto_center:true,throttle_to_100:true,hud_toggle:true,more_toggle:true,pause_resume:true,no_overflow:true,scenery_trees_total:scenery.treesTotal,scenery_visible_pines:scenery.treesVisible,scenery_ground_polygons:scenery.terrainPolygons,scenery_clouds:scenery.cloudsVisible,world_color_bins:colors,render_cost_ms:+scenery.renderCostMs.toFixed(1)});
 }
 assert.equal(errors.length,0,'browser JavaScript errors: '+errors.join(' | '));
 console.log(JSON.stringify({schema:'evercraft.aaar.mobile-cockpit-source-e2e.v1',tested_source:'pull_request_branch_local_http',browser:engine,device:'mobile-emulation-not-physical-Safari',passed:true,receipts,physical_iphone_safari_verified:false,hosted_release_verified:false},null,2));
 await context.close();
}catch(e){
 console.log(JSON.stringify({schema:'evercraft.aaar.mobile-cockpit-source-e2e.v1',browser:engine,passed:false,reason:String(e.message||e).slice(0,600),receipts,physical_iphone_safari_verified:false},null,2));
 process.exitCode=1;
}finally{
 if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
}
