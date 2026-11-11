// Synthetic House 001 3D browser QA through the actual owned Worlds vault route.
// Playwright Chromium software graphics are NOT evidence of a physical GPU/device.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const port=8863,origin='http://127.0.0.1:'+port;
const out=resolve('artifacts/living-worlds-house-3d');
await mkdir(out,{recursive:true});
const server=spawn(process.execPath,[
  'systemia/worlds/worlds-vault-runtime.mjs','--host','127.0.0.1',
  '--port',String(port),'--public-root','public',
  '--data-root','artifacts/living-worlds-house-3d/private-vault','--enable-house-001'
],{stdio:'ignore'});
const receipt={schema:'evercraft.living-worlds.3d-browser-qa.v1',source:'local PR code',
  browser:'Playwright Chromium with software WebGL2, not a physical phone',
  production_deployed:false,hardware_gpu_verified:false,llm_connected:false,
  autonomous_server_running:false,scenarios:[]};
let browser;
try{
  let ready=false;
  for(let i=0;i<40;i++){
    try{const r=await fetch(origin+'/worlds/api/health');if(r.ok){ready=true;break;}}catch{}
    await new Promise(r=>setTimeout(r,170));
  }
  assert.equal(ready,true,'Owned Worlds vault not ready');
  browser=await chromium.launch({headless:true,
    args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
  receipt.browser_version=browser.version();
  for(const profile of [
    {name:'desktop',viewport:{width:1280,height:800},isMobile:false,hasTouch:false},
    {name:'phone-emulation',viewport:{width:390,height:844},isMobile:true,hasTouch:true}
  ]){
    const ctx=await browser.newContext({viewport:profile.viewport,isMobile:profile.isMobile,
      hasTouch:profile.hasTouch,deviceScaleFactor:1});
    const page=await ctx.newPage(),errors=[];
    page.on('pageerror',err=>errors.push(err.message.slice(0,200)));
    const r=await page.goto(origin+'/worlds/?house=001',{waitUntil:'domcontentloaded',timeout:20000});
    assert.equal(r?.status(),200,'Worlds house route failed');
    assert.equal((await page.request.get(origin+'/worlds/house-mode.bundle.mjs')).status(),200,
      'Worlds-hosted viewer bundle missing');
    assert.equal((await page.request.get(origin+'/living-worlds/house-core.mjs')).status(),404,
      'Worlds Vault unexpectedly exposed the separate House source route');
    await page.locator('#start').click();
    await page.waitForFunction(()=>document.querySelector('#weather')?.textContent?.includes('3D visual preview'),null,
      {timeout:20000});
    await page.waitForFunction(()=>{
      try{return JSON.parse(localStorage.getItem('evercraft.living-worlds.house001.v1'))?.tick>0;}catch{return false;}
    },null,{timeout:20000});
    await page.waitForFunction(()=>document.querySelector('#metrics')?.textContent?.includes('fps'),
      null,{timeout:15000});
    const before=await page.evaluate(()=>{
      const canvas=document.querySelector('#world'),gl=canvas.getContext('webgl2');
      const metrics=document.querySelector('#metrics').textContent;
      return {webgl2:!!gl,glError:gl.getError(),width:canvas.width,height:canvas.height,
        draws:Number(metrics.match(/(\d+) draws/)?.[1]||0),
        instanceCount:Number(metrics.match(/(\d+) instanced/)?.[1]||-1),
        worldTick:JSON.parse(localStorage.getItem('evercraft.living-worlds.house001.v1')).tick,
        overflow:document.documentElement.scrollWidth>innerWidth+3};
    });
    assert.equal(before.webgl2,true,'WebGL2 missing');
    assert.equal(before.glError,0,'House GL error');
    assert.ok(before.width>100&&before.height>100,'No framebuffer');
    assert.ok(before.draws>40,'House meshes not submitted through Worlds renderer');
    assert.equal(before.instanceCount,0,'Mossmere instances were counted in House mode');
    assert.ok(before.worldTick>0,'House simulation not ticking');
    assert.equal(before.overflow,false,'Horizontal mobile overflow');
    await page.screenshot({path:out+'/'+profile.name+'-house.png',timeout:15000});
    await page.locator('#buildToggle').click();
    await page.locator('#house-kind').waitFor({state:'visible'});
    await page.locator('#house-kind').selectOption('plant');
    await page.locator('#house-grid .house-cell').nth(53).click(); // Last tile (8,5).
    const after=await page.evaluate(()=>{
      const snapshot=JSON.parse(localStorage.getItem('evercraft.living-worlds.house001.v1'));
      return {hasPlant:snapshot.furniture.some(f=>f.kind==='plant'&&f.x===8&&f.y===5),
        status:document.querySelector('#house-edit-status').textContent};
    });
    assert.equal(after.hasPlant,true,'In-world furnishing not persisted');
    assert.match(after.status,/placed/i);
    await page.screenshot({path:out+'/'+profile.name+'-editor.png',timeout:15000});
    assert.deepEqual(errors,[],profile.name+' runtime errors');
    receipt.scenarios.push({...profile,before,after,passed:true});
    await ctx.close();
  }
  // The owner-run resident clock progresses while the viewing browser is closed.
  const firstRes=await fetch(origin+'/worlds/api/house-001/snapshot');
  assert.equal(firstRes.status,200,'Owner-run resident service was not enabled');
  const firstSnapshot=await firstRes.json();
  assert.equal(firstSnapshot.model_mode,'rules_only_no_llm');
  assert.equal(firstSnapshot.authority,'owner_operated_process');
  const remoteContext=await browser.newContext({viewport:{width:1000,height:700}});
  const remotePage=await remoteContext.newPage();
  const errors=[];
  remotePage.on('pageerror',e=>errors.push(e.message.slice(0,200)));
  await remotePage.goto(origin+'/worlds/?house=001&clock=resident',{waitUntil:'domcontentloaded'});
  await remotePage.waitForFunction(()=>!document.querySelector('#start')?.disabled,null,{timeout:15000});
  await remotePage.locator('#start').click();
  await remotePage.waitForFunction(()=>document.querySelector('#weather')?.textContent?.includes('Owner-run'),null,{timeout:15000});
  assert.equal(await remotePage.locator('#buildToggle').isDisabled(),true,'Remote clock must be read-only');
  const remoteInitial=await remotePage.evaluate(()=>({
    saved:localStorage.getItem('evercraft.living-worlds.house001.v1'),
    metrics:document.querySelector('#metrics')?.textContent||'',
    weather:document.querySelector('#weather')?.textContent||'',
    glError:document.querySelector('#world').getContext('webgl2').getError()
  }));
  assert.equal(remoteInitial.saved,null,'Read-only remote spectator wrote local House state');
  assert.equal(remoteInitial.glError,0);
  assert.match(remoteInitial.weather,/Owner-run rules clock/);
  await remotePage.screenshot({path:out+'/server-clock-house.png',timeout:15000});
  await remotePage.close();
  await new Promise(r=>setTimeout(r,1700)); // No open House spectator; server must still tick.
  const secondSnapshot=await (await fetch(origin+'/worlds/api/house-001/snapshot')).json();
  assert.ok(secondSnapshot.source_tick>firstSnapshot.source_tick,
    'Owned resident clock did not advance while no page was open');
  const returnPage=await remoteContext.newPage();
  await returnPage.goto(origin+'/worlds/?house=001&clock=resident',{waitUntil:'domcontentloaded'});
  await returnPage.waitForFunction(()=>!document.querySelector('#start')?.disabled,null,{timeout:15000});
  assert.equal(await returnPage.locator('#buildToggle').isDisabled(),true);
  assert.deepEqual(errors,[],'Server-clock browser errors');
  receipt.scenarios.push({name:'server-resident-clock-read-only',
    firstTick:firstSnapshot.source_tick,afterNoViewerTick:secondSnapshot.source_tick,
    remoteInitial,passed:true});
  await remoteContext.close();
  receipt.passed=true;
}finally{
  await writeFile(out+'/receipt.json',JSON.stringify(receipt,null,2));
  await browser?.close();
  server.kill('SIGTERM');
}
