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
    {name:'phone-emulation',viewport:{width:390,height:844},isMobile:true,hasTouch:true}
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
        viewport_width:innerWidth,
        document_width:document.documentElement.scrollWidth,
        navigation_ms:performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd||null,
        heap_bytes:performance.memory?.usedJSHeapSize||null
      };
    });
    assert.equal(pre.webgl2,true,profile.name+': no WebGL2 context');
    assert.ok(pre.width>100&&pre.height>100,profile.name+': canvas has no framebuffer');
    assert.equal(pre.error,0,profile.name+': WebGL error during scene render');
    assert.ok(pre.document_width<=pre.viewport_width+3,profile.name+': horizontal page overflow');
    if(profile.hasTouch){
      assert.equal(await page.locator('#joystick').isVisible(),true,'phone joystick missing');
      assert.equal(await page.locator('#touchhint').isVisible(),true,'phone look hint missing');
    }else{
      await page.keyboard.down('w');
      await page.waitForTimeout(2300);
      await page.keyboard.up('w');
      await page.locator('#save').click();
      const location=await page.evaluate(()=>JSON.parse(localStorage.getItem('evercraft.worlds.mossmere.v1'))?.player?.z);
      assert.ok(location<7.99,'keyboard movement did not update world position; position='+location+'; frame='+pre.fps);
    }
    await page.locator('#buildToggle').click();
    await page.locator('[data-command="add tree"]').click();
    const change=await page.evaluate(()=>JSON.parse(localStorage.getItem('evercraft.worlds.mossmere.v1')));
    assert.equal(change.objects.length,1,profile.name+': adding tree did not persist');
    await page.locator('[data-command="sky sunset"]').click();
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('evercraft.worlds.mossmere.v1')));
    assert.equal(saved.sky,'sunset',profile.name+': sky change not stored');
    await page.locator('#closeEditor').click();
    await page.screenshot({path:out+'/'+profile.name+'.png',timeout:10000});
    await page.reload({waitUntil:'domcontentloaded'});
    const loaded=await page.evaluate(()=>JSON.parse(localStorage.getItem('evercraft.worlds.mossmere.v1')));
    assert.equal(loaded.objects.length,1,profile.name+': world object missing after reload');
    assert.equal(loaded.sky,'sunset',profile.name+': environment edit missing after reload');
    assert.deepEqual(errors,[],profile.name+': browser exceptions');
    receipt.scenarios.push({profile:profile.name,status:'PASS',elapsed_wall_ms:Date.now()-start,initial_canvas:pre,scene_revision:loaded.revision,objects:loaded.objects.length,saved_document_bytes:JSON.stringify(loaded).length,page_errors:errors,screenshot:profile.name+'.png'});
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