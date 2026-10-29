// Evercraft Worlds WebGL browser conformance. Synthetic scene, no hosted/real-world data.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const origin='http://127.0.0.1:8766';
const out=resolve('artifacts/evercraft-worlds-browser');
await mkdir(out,{recursive:true});
const server=spawn('python3',['-m','http.server','8766','--bind','127.0.0.1','--directory','public'],{stdio:'ignore'});
const receipt={schema:'evercraft.worlds.browser-qa.v1',observed_at_utc:new Date().toISOString(),origin,source:'local PR branch',browser:'Playwright Chromium, phone emulation is NOT physical device',real_world_data:false,hardware_gpu_verified:false,production_deployed:false,scenarios:[]};
let browser;
try{
  await new Promise(r=>setTimeout(r,900));
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
  receipt.browser_version=browser.version();
  for(const profile of [
    {name:'desktop',viewport:{width:1365,height:860},isMobile:false,hasTouch:false},
    {name:'phone-emulation',viewport:{width:390,height:844},isMobile:true,hasTouch:true},
    {name:'small-phone-emulation',viewport:{width:320,height:640},isMobile:true,hasTouch:true}
  ]){
    const context=await browser.newContext({viewport:profile.viewport,isMobile:profile.isMobile,hasTouch:profile.hasTouch,deviceScaleFactor:1});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',err=>errors.push(String(err.message).slice(0,300)));
    const start=Date.now();
    const response=await page.goto(origin+'/worlds/',{waitUntil:'domcontentloaded',timeout:20000});
    assert.equal(response?.status(),200,profile.name+': static route not served');
    await page.locator('#start').click();
    await page.locator('#hud').waitFor({state:'visible'});
    await page.waitForFunction(()=>document.querySelector('#metrics')?.textContent?.includes('fps'),null,{timeout:15000});
    const pre=await page.evaluate(()=>{
      const canvas=document.querySelector('#world');
      const gl=canvas.getContext('webgl2');
      return {
        webgl2:!!gl,
        width:canvas.width,height:canvas.height,
        error:gl?.getError(),
        fps:document.querySelector('#metrics')?.textContent||'',
        draw_calls:Number((document.querySelector('#metrics')?.textContent||'').match(/(\d+) draws/)?.[1]||0),
        instanced_count:Number((document.querySelector('#metrics')?.textContent||'').match(/(\d+) instanced/)?.[1]||0),
        viewport_width:innerWidth,
        document_width:document.documentElement.scrollWidth,
        navigation_ms:performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd||null,
        heap_bytes:performance.memory?.usedJSHeapSize||null
      };
    });
    assert.equal(pre.webgl2,true,profile.name+': no WebGL2 context');
    assert.ok(pre.width>100&&pre.height>100,profile.name+': canvas has no framebuffer');
    assert.equal(pre.error,0,profile.name+': WebGL error during scene render');
    assert.ok(pre.instanced_count>100,profile.name+': expected real instanced geometry');
    assert.ok(pre.draw_calls>0&&pre.draw_calls<100,profile.name+': opaque batching failed; draws='+pre.draw_calls);
    assert.ok(pre.document_width<=pre.viewport_width+3,profile.name+': horizontal page overflow');
    await page.screenshot({path:out+'/'+profile.name+'-arrival.png',timeout:10000});
    if(profile.hasTouch){
      assert.equal(await page.locator('#joystick').isVisible(),true,'phone joystick missing');
      assert.equal(await page.locator('#touchhint').isVisible(),true,'phone look hint missing');
      // Dispatch genuine Chromium touch input and verify it moves the saved player.
      const stickBox=await page.locator('#joystick').boundingBox();
      const touchX=stickBox.x+stickBox.width/2,touchY=stickBox.y+stickBox.height/2;
      const client=await context.newCDPSession(page);
      await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touchX,y:touchY}]});
      await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touchX+stickBox.width*.32,y:touchY-stickBox.height*.22}]});
      await page.waitForTimeout(700);
      await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await page.locator('#save').click();
      const moved=await page.evaluate(()=>JSON.parse(localStorage.getItem('evercraft.worlds.mossmere.v1')).player);
      assert.ok(Math.hypot(moved.x,moved.z-8)>.04,profile.name+': joystick touch did not move avatar');
    }else{
      await page.keyboard.down('w');
      await page.waitForTimeout(2300);
      await page.keyboard.up('w');
      await page.locator('#save').click();
      const location=await page.evaluate(()=>JSON.parse(localStorage.getItem('evercraft.worlds.mossmere.v1'))?.player?.z);
      assert.ok(location<7.99,'keyboard movement did not update world position; position='+location+'; frame='+pre.fps);
    }
    await page.locator('#buildToggle').click();
    if(profile.hasTouch){
      const builder=await page.evaluate(()=>{
        const rect=document.querySelector('#editor').getBoundingClientRect();
        const buttons=[...document.querySelectorAll('.editor .chips button')].map(b=>b.getBoundingClientRect().height);
        const field=document.querySelector('#command');
        return {top:rect.top,height:rect.height,viewport:innerHeight,buttonHeights:buttons,inputFontSize:parseFloat(getComputedStyle(field).fontSize),focused:document.activeElement===field};
      });
      assert.ok(builder.top>=builder.viewport*.18,profile.name+': builder obscures world preview');
      assert.ok(builder.height<=builder.viewport*.8,profile.name+': builder too tall');
      assert.ok(builder.buttonHeights.every(h=>h>=44),profile.name+': tap targets too small');
      assert.ok(builder.inputFontSize>=16,profile.name+': iOS input zoom risk');
      assert.equal(builder.focused,false,profile.name+': phone keyboard opened without request');
      await page.screenshot({path:out+'/'+profile.name+'-builder.png',timeout:10000});
    }
    const portal=await page.evaluate(async()=>{const m=await import('/worlds/portal-visual.mjs');return {width:m.PORTAL.frameWidth,height:m.PORTAL.frameHeight,near:m.portalEffect(.4,4).opacity,far:m.portalEffect(5,4).opacity};});
    assert.ok(portal.width<2.5&&portal.height<4&&portal.near<.05&&portal.far>.9,profile.name+': portal bounds violated');
    await page.locator('[data-command="add tree"]').click();
    const change=await page.evaluate(()=>JSON.parse(localStorage.getItem('evercraft.worlds.mossmere.v1')));
    assert.equal(change.objects.length,1,profile.name+': adding tree did not persist');
    await page.locator('[data-command="sky sunset"]').click();
    await page.locator('#qualityMode').selectOption('smooth');
    await page.waitForFunction(()=>document.querySelector('#world').width<document.querySelector('#world').clientWidth,null,{timeout:5000});
    const quality=await page.evaluate(()=>({mode:localStorage.getItem('evercraft.worlds.quality.v1'),width:document.querySelector('#world').width,clientWidth:document.querySelector('#world').clientWidth}));
    assert.equal(quality.mode,'smooth',profile.name+': visual quality preference did not persist');
    const routines=await page.evaluate(async()=>{const m=await import('/worlds/world-core.mjs');const w=JSON.parse(localStorage.getItem('evercraft.worlds.mossmere.v1'));return {pip:m.agentActivity(w,'pip').activity,lumi:m.agentActivity(w,'lumi').activity};});
    assert.match(routines.lumi,/sunset/i);
    assert.equal(routines.pip,'Planning a secret garden');
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('evercraft.worlds.mossmere.v1')));
    assert.equal(saved.sky,'sunset',profile.name+': sky change not stored');
    await page.locator('#closeEditor').click();
    await page.screenshot({path:out+'/'+profile.name+'.png',timeout:10000});
    await page.reload({waitUntil:'domcontentloaded'});
    const loaded=await page.evaluate(()=>JSON.parse(localStorage.getItem('evercraft.worlds.mossmere.v1')));
    assert.equal(loaded.objects.length,1,profile.name+': world object missing after reload');
    assert.equal(loaded.sky,'sunset',profile.name+': environment edit missing after reload');
    assert.equal(await page.locator('#qualityMode').inputValue(),'smooth',profile.name+': quality mode did not load after refresh');
    assert.deepEqual(errors,[],profile.name+': browser exceptions');
    receipt.scenarios.push({profile:profile.name,status:'PASS',elapsed_wall_ms:Date.now()-start,initial_canvas:pre,scene_revision:loaded.revision,objects:loaded.objects.length,saved_document_bytes:JSON.stringify(loaded).length,page_errors:errors,quality,routines,screenshot:profile.name+'.png'});
    await context.close();
  }
  receipt.status='PASS';
}catch(error){receipt.status='FAIL';receipt.error=String(error?.stack||error);process.exitCode=1;}
finally{
  await writeFile(out+'/receipt.json',JSON.stringify(receipt,null,2));
  if(browser)await browser.close();
  server.kill('SIGTERM');
  console.log(JSON.stringify(receipt,null,2));
}