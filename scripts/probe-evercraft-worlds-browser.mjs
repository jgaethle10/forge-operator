// Evercraft Worlds WebGL browser conformance. Synthetic scene, no hosted/real-world data.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const origin='http://127.0.0.1:8766';
const out=resolve('artifacts/evercraft-worlds-browser');
await mkdir(out,{recursive:true});
const server=spawn(process.execPath,['systemia/worlds/worlds-vault-runtime.mjs','--port','8766','--public-root','public','--data-root','artifacts/evercraft-worlds-browser/private-vault'],{stdio:'ignore'});
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
    await page.locator('#publishOnline').waitFor({state:'visible',timeout:8000});
    await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__lastOnlineLink=text;}}})});
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
    // Capture a real, privacy-preserving fragment URL instead of invoking native share UI.
    await page.evaluate(()=>{Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.__worldShare=data;}})});
    await page.locator('#share').click();
    const sharedUrl=await page.evaluate(()=>window.__worldShare?.url||null);
    assert.ok(sharedUrl?.includes('#scene='),profile.name+': share link was not constructed');
    assert.ok(!sharedUrl.includes('memories'),profile.name+': private agent history leaked');
    const guest=await context.newPage();
    const guestErrors=[];guest.on('pageerror',err=>guestErrors.push(String(err.message)));
    const guestResponse=await guest.goto(sharedUrl,{waitUntil:'domcontentloaded',timeout:20000});
    assert.equal(guestResponse?.status(),200,profile.name+': shared scene path unavailable');
    await guest.locator('#sharedInvite').waitFor({state:'visible'});
    const originalLocal=await guest.evaluate(()=>localStorage.getItem('evercraft.worlds.mossmere.v1'));
    await guest.locator('#visitShared').click();
    const preview=await guest.evaluate(async()=>{
      const app=await import('/worlds/world-core.mjs');
      const token=new URLSearchParams(location.hash.slice(1)).get('scene');
      const {decodeSharedScene}=await import('/worlds/share-scene.mjs');
      const s=decodeSharedScene(token);
      return {objects:s.objects.length,sky:s.sky,privateMemories:s.agents.some(a=>a.memories.length)};
    });
    assert.equal(preview.objects,1,profile.name+': guest world did not reconstruct');
    assert.equal(preview.sky,'sunset');
    assert.equal(preview.privateMemories,false);
    await guest.close();
    assert.equal(await page.evaluate(()=>localStorage.getItem('evercraft.worlds.mossmere.v1')),originalLocal,profile.name+': visiting shared scene overwrote saved world');
    assert.deepEqual(guestErrors,[],profile.name+': guest browser exceptions');
    await page.locator('#qualityMode').selectOption('smooth');
    await page.waitForFunction(()=>document.querySelector('#world').width<document.querySelector('#world').clientWidth,null,{timeout:5000});
    const quality=await page.evaluate(()=>({mode:localStorage.getItem('evercraft.worlds.quality.v1'),width:document.querySelector('#world').width,clientWidth:document.querySelector('#world').clientWidth}));
    assert.equal(quality.mode,'smooth',profile.name+': visual quality preference did not persist');
    const routines=await page.evaluate(async()=>{const m=await import('/worlds/world-core.mjs');const w=JSON.parse(localStorage.getItem('evercraft.worlds.mossmere.v1'));return {pip:m.agentActivity(w,'pip').activity,lumi:m.agentActivity(w,'lumi').activity};});
    assert.match(routines.lumi,/sunset/i);
    assert.equal(routines.pip,'Planning a secret garden');
    await page.locator('#publishOnline').click();
    await page.waitForFunction(()=>document.querySelector('#cloudStatus').textContent.includes('Online revision 1'),null,{timeout:10000});
    const owner=await page.evaluate(()=>JSON.parse(localStorage.getItem('evercraft.worlds.owner-capability.v1')));
    assert.match(owner.id,/^[a-f0-9]{32}$/,profile.name+': online world ID missing');
    assert.match(owner.edit_token,/^[a-f0-9]{64}$/,profile.name+': owner capability missing');
    const onlineUrl=await page.evaluate(()=>window.__lastOnlineLink);
    assert.ok(onlineUrl?.includes('#world='+owner.id),profile.name+': online share URL not prepared');
    assert.ok(!onlineUrl.includes(owner.edit_token),profile.name+': edit capability leaked into sharing URL');
    const visitorContext=await browser.newContext({viewport:profile.viewport,isMobile:profile.isMobile,hasTouch:profile.hasTouch,deviceScaleFactor:1});
    const second=await visitorContext.newPage();
    const secondResponse=await second.goto(onlineUrl,{waitUntil:'domcontentloaded',timeout:20000});
    assert.equal(secondResponse?.status(),200,profile.name+': online guest route unavailable');
    await second.locator('#sharedInvite').waitFor({state:'visible',timeout:10000});
    await second.locator('#visitShared').click();
    await second.locator('#start').click();
    await second.locator('#buildToggle').click();
    await second.locator('[data-command="sky night"]').click();
    const beforeCopy=await second.evaluate(()=>({world:localStorage.getItem('evercraft.worlds.mossmere.v1'),owner:localStorage.getItem('evercraft.worlds.owner-capability.v1')}));
    assert.equal(beforeCopy.world,null,profile.name+': online guest wrote local world without consent');
    assert.equal(beforeCopy.owner,null,profile.name+': online guest received owner edit capability');
    await visitorContext.close();
    await page.locator('#publishOnline').click();
    await page.waitForFunction(()=>document.querySelector('#cloudStatus').textContent.includes('Online revision 2'),null,{timeout:10000});
    const persisted=await page.evaluate(async id=>
      (await (await fetch('/worlds/api/worlds/'+id)).json()),owner.id);
    assert.equal(persisted.version,2,profile.name+': published revision did not advance');
    // The creator can revoke the online link without touching the local scene.
    await page.locator('#unpublishOnline').waitFor({state:'visible'});
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('#unpublishOnline').click();
    await page.waitForFunction(()=>document.querySelector('#cloudStatus').textContent.includes('no longer online'),null,{timeout:10000});
    assert.equal(await page.locator('#unpublishOnline').isVisible(),false,profile.name+': unpublish control still visible');
    const revoked=await page.evaluate(async id=>({
      status:(await fetch('/worlds/api/worlds/'+id)).status,
      owner:localStorage.getItem('evercraft.worlds.owner-capability.v1')
    }),owner.id);
    assert.equal(revoked.status,404,profile.name+': revoked public link remains accessible');
    assert.equal(revoked.owner,null,profile.name+': deleted capability remains on device');
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