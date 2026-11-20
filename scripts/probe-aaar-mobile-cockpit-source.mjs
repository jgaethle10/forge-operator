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

 // Seattle loads in a fresh page: changing only the URL fragment cannot reinitialize
 // the current game world, because the flight engine is intentionally page-local.
 const cityPage=await context.newPage();
 cityPage.on('pageerror',e=>errors.push('seattle:'+String(e.message||e)));
 const cityResponse=await cityPage.goto(base+'#seattle',{waitUntil:'domcontentloaded',timeout:25000});
 assert.equal(cityResponse?.status(),200,'Seattle direct fragment URL missing');
 await cityPage.waitForFunction(()=>document.documentElement.classList.contains('seattle-mode')&&!!window.AAARSeattle?.enabled,null,{timeout:10000});
 const geo=await cityPage.evaluate(()=>({
  source:window.AAARSeattle.source.name,footprints:window.AAARSeattle.buildings.length,
  landmarks:window.AAARSeattle.landmarks.map(l=>l.name),
  firstGate:window.AAARFlight.gates[0].title,spawn:window.AAARFlight.start('trainer'),
  cityIsActive:window.AAARSeattle.enabled
 }));
 assert.equal(geo.cityIsActive,true);
 assert.ok(geo.footprints>500,'City GIS footprints did not load into flight');
 assert.ok(geo.landmarks.includes('Space Needle')&&geo.landmarks.includes('Columbia Center'),'grounded landmarks missing');
 assert.match(geo.firstGate,/PIKE PLACE/,'Seattle landmarks were not initialized before flight core');
 assert.ok(geo.spawn.x< -1200&&geo.spawn.y>200,'Seattle waterfront starting position missing');
 assert.ok(await cityPage.locator('#basinStart').isVisible(),'Return to Cedar Basin missing');
 await cityPage.locator('#beginFlight').click();
 await cityPage.waitForFunction(()=>document.querySelector('#startScreen')?.style.display==='none',null,{timeout:10000});
 await cityPage.waitForFunction(()=>{
  const m=window.AAARSceneMetrics?.();return m&&m.frames>2&&m.city?.source>500;
 },null,{timeout:12000});
 const cityMetrics=await cityPage.evaluate(()=>window.AAARSceneMetrics());
 assert.ok(cityMetrics.terrainPolygons>300,'Seattle synthetic terrain not painted');
 assert.ok(cityMetrics.city.visible>=3,'city buildings not visible in flight camera');
 assert.ok(cityMetrics.renderCostMs<550,'Seattle Canvas2D was too expensive even in browser emulation');
 // Compare every sampled indexed contact with the former full-city scan.
 // This checks both missed buildings and accidental hits, including cell edges.
 const collisionQA=await cityPage.evaluate(()=>{
  const city=window.AAARSeattle;
  const targets=city.buildings.concat(city.landmarks.filter(l=>l.type!=='wheel'));
  const reference=(x,y,z)=>targets.find(b=>{
   const g=city.ground(b.x,b.z);
   return Math.abs(x-b.x)<b.w/2+3&&Math.abs(z-b.z)<b.d/2+3&&
     y<g+b.h+2&&y>g-10;
  })||null;
  let checks=0,maxCandidates=0,totalCandidates=0;
  const sample=(x,y,z)=>{
   const got=city.collisionAt(x,y,z);
   const expected=reference(x,y,z);
   const candidates=city.collisionCandidates(x,z);
   maxCandidates=Math.max(maxCandidates,candidates.length);
   totalCandidates+=candidates.length;
   checks++;
   if(got!==expected)throw Error('indexed_collision_mismatch_'+checks);
  };
  for(let i=0;i<targets.length;i+=3){
   const b=targets[i],g=city.ground(b.x,b.z);
   sample(b.x,g+b.h*.50,b.z);
   sample(b.x+b.w/2+2.9,g+b.h*.5,b.z);
   sample(b.x+b.w/2+3.1,g+b.h*.5,b.z);
   sample(b.x,g+b.h+2.1,b.z);
  }
  for(let i=0;i<500;i++){
   const x=Math.sin(i*82.3)*1900,z=Math.cos(i*51.7)*2000;
   sample(x,Math.abs(i*53)%390,z);
  }
  return {checked:checks,total:targets.length,maxCandidates,
   avgCandidates:totalCandidates/checks,gridMeters:city.collisionCellSize,
   distantCandidates:city.collisionCandidates(9000,9000).length};
 });
 assert.ok(collisionQA.checked>1000,'insufficient collision parity samples');
 assert.ok(collisionQA.avgCandidates<collisionQA.total*.20,'grid index failed to reduce candidate scans');
 assert.ok(collisionQA.maxCandidates<collisionQA.total*.45,'hotspot cell still scans most city buildings');
 assert.equal(collisionQA.distantCandidates,0,'empty map regions should not scan city obstacles');
 const physics=await cityPage.evaluate(()=>{
  const core=window.AAARFlight,s=core.start('trainer');
  for(let i=0;i<20;i++)core.step(s,{bank:1,pitch:0,throttle:0,rudder:0},.05);
  return {g:s.aeroFlight?.gLoad,density:s.aeroFlight?.densityRatio,
   stallMps:s.aeroFlight?.acceleratedStallMps,
   basicStall:core.aircraft.trainer.stall,model:s.aeroFlight?.model};
 });
 assert.equal(physics.model,'LOW_ORDER_GAMEPLAY');
 assert.ok(physics.g>1.1&&physics.g<=3,'bank-derived load factor not used');
 assert.ok(physics.density<1&&physics.density>0,'air-density approximation invalid');
 assert.ok(physics.stallMps>physics.basicStall,'bank-dependent stall speed not applied');
 receipts.push({city:'Seattle stylized GIS scene',official_footprints:geo.footprints,
  landmarks:geo.landmarks.length,canvas_buildings_visible:cityMetrics.city.visible,
  city_terrain_polygons:cityMetrics.terrainPolygons,city_render_ms:+cityMetrics.renderCostMs.toFixed(1),
  city_opened_direct_url:true,flight_started:true,bank_load_factor:physics.g,collision_parity_checks:collisionQA.checked,collision_average_candidates:+collisionQA.avgCandidates.toFixed(1),collision_total_targets:collisionQA.total,collision_grid_meters:collisionQA.gridMeters,city_is_not_validated:true});
 await cityPage.close();
 // Laptop flight must initialize Seattle without silently disabling Start.
 const desktopContext=await browser.newContext({viewport:{width:1366,height:768},isMobile:false,hasTouch:false});
 const laptopPage=await desktopContext.newPage();
 laptopPage.on('pageerror',e=>errors.push('seattle-desktop:'+String(e.message||e)));
 const laptopResponse=await laptopPage.goto(base+'#seattle',{waitUntil:'domcontentloaded',timeout:25000});
 assert.equal(laptopResponse?.status(),200);
 await laptopPage.locator('#beginFlight').waitFor({state:'visible',timeout:15000});
 assert.equal(await laptopPage.locator('#beginFlight').isEnabled(),true,'Seattle desktop WebGL engine failed initialization');
 await laptopPage.locator('#beginFlight').click();
 await laptopPage.waitForFunction(()=>document.querySelector('#startScreen')?.style.display==='none',null,{timeout:15000});
 assert.equal(await laptopPage.locator('#speedOut').innerText()==='—',false,'desktop Seattle telemetry missing');
 const graphics=await laptopPage.evaluate(()=>{
  const g=window.AAARGraphicsMetrics?.();
  const canvas=document.getElementById('flightCanvas');
  const gl=g?.renderer==='webgl2'?canvas.getContext('webgl2'):null;
  return {...g,gl_program_linked:gl?!!gl.getParameter(gl.CURRENT_PROGRAM):false,
    webgl_error:gl?gl.getError():null};
 });
 assert.equal(graphics.lighting_pipeline,'seattle-vista-v11','Seattle Vista laptop pipeline missing');
 const relief=await laptopPage.evaluate(()=>({
  central:window.AAARSeattle.ground(0,0),
  highland:window.AAARSeattle.ground(5700,0),
  isStylized:window.AAARGraphicsMetrics().terrain_model==='STYLIZED_GAMEPLAY_HIGHLANDS'
 }));
 assert.equal(relief.isStylized,true,'relief provenance missing');
 assert.ok(relief.highland>relief.central+180,'distant synthetic terrain relief not being generated');
 assert.ok(graphics.seattle_building_count>500,'Seattle GIS geometry missing');
 if(graphics.renderer==='webgl2'){
  assert.equal(graphics.shading_active,true,'3D shader not linked');
  assert.ok(graphics.world_triangles>25000,'city world geometry unexpectedly empty');
  assert.ok(graphics.cloud_triangles>1500,'3D cloud volume unexpectedly missing');
  assert.equal(graphics.cloud_anchors,28,'deterministic cloud anchor count changed');
  assert.equal(graphics.gl_program_linked,true,'WebGL program inactive');
  assert.equal(graphics.webgl_error,0,'WebGL renderer reports a GPU error');
 }
 if(process.env.AAAR_REQUIRE_WEBGL==='1')assert.equal(graphics.renderer,'webgl2','WebGL2 was unexpectedly replaced by fallback');
 receipts.push({city:'Seattle laptop',viewport:'1366x768',flight_started:true,init_errors:0,
  rendering_engine:graphics.renderer,shading_active:graphics.shading_active,
  triangles:graphics.world_triangles,webgl_program_linked:graphics.gl_program_linked});

 await desktopContext.close();
 assert.equal(errors.length,0,'browser JavaScript errors: '+errors.join(' | '));
 console.log(JSON.stringify({schema:'evercraft.aaar.mobile-cockpit-source-e2e.v1',tested_source:'pull_request_branch_local_http',browser:engine,device:'mobile-emulation-not-physical-Safari',passed:true,receipts,physical_iphone_safari_verified:false,hosted_release_verified:false},null,2));
 await context.close();
}catch(e){
 console.log(JSON.stringify({schema:'evercraft.aaar.mobile-cockpit-source-e2e.v1',browser:engine,passed:false,reason:String(e.message||e).slice(0,600),receipts,physical_iphone_safari_verified:false},null,2));
 process.exitCode=1;
}finally{
 if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
}
