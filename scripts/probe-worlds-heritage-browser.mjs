// Evercraft Worlds / Below the Line. Browser-conformance QA for actual new heritage scene.
// Local HTTP + Chromium software rendering only; NOT a public deploy or physical-phone proof.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const origin='http://127.0.0.1:8767', output=resolve('artifacts/worlds-heritage-browser');
await mkdir(output,{recursive:true});
const receipt={schema:'evercraft.worlds.heritage-browser-qa.v1',observed_at_utc:new Date().toISOString(),
  source:'local checked-out source',site_id:'pavlopetri-learning-scene-v1',url_path:'/worlds/heritage/',
  production_deployed:false,physical_device_tested:false,browser_emulation_only:true,
  observed_public_https:false,scenarios:[]};
const server=spawn(process.execPath,['systemia/worlds/worlds-vault-runtime.mjs','--port','8767','--public-root','public','--data-root','artifacts/worlds-heritage-browser/private-vault'],{stdio:'ignore'});
let browser;
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
try{
  let ready=false;
  for(let i=0;i<35;i++){if(server.exitCode!==null)throw Error('Local static server terminated');try{const r=await fetch(origin+'/worlds/heritage/');if(r.ok){ready=true;break;}}catch{}await sleep(200);}
  assert.ok(ready,'Local heritage HTML route did not become ready');
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  receipt.browser_version=browser.version();
  const profiles=[
    {name:'desktop',viewport:{width:1280,height:800},mobile:false},
    {name:'phone',viewport:{width:390,height:844},mobile:true},
    {name:'small-phone',viewport:{width:320,height:640},mobile:true}];
  for(const p of profiles){
    const ctx=await browser.newContext({viewport:p.viewport,hasTouch:p.mobile,isMobile:p.mobile,deviceScaleFactor:1});
    const page=await ctx.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(String(e.message).slice(0,300)));
    await page.addInitScript(()=>{
      window.__heritageTelemetry={frameDraws:0,totalDraws:0,viewMatrix:null,clearCalls:0};
      const proto=WebGL2RenderingContext.prototype;
      const draw=proto.drawArrays,clear=proto.clear,uniform=proto.uniformMatrix4fv;
      proto.drawArrays=function(...args){window.__heritageTelemetry.frameDraws++;window.__heritageTelemetry.totalDraws++;return draw.apply(this,args);};
      proto.clear=function(...args){window.__heritageTelemetry.clearCalls++;window.__heritageTelemetry.frameDraws=0;return clear.apply(this,args);};
      proto.uniformMatrix4fv=function(loc,transpose,matrix){if(matrix?.length===16){const a=Array.from(matrix);if(a[15]===1&&Math.abs(a[12])+Math.abs(a[13])+Math.abs(a[14])>.05){window.__heritageTelemetry.viewMatrix=a;}}return uniform.call(this,loc,transpose,matrix);};
    });
    const start=Date.now();
    const response=await page.goto(origin+'/worlds/heritage/',{waitUntil:'domcontentloaded',timeout:25000});
    assert.equal(response?.status(),200,p.name+': heritage route not found');
    await page.locator('#start').click();
    await page.locator('#hud').waitFor({state:'visible',timeout:10000});
    await page.waitForFunction(()=>window.__heritageTelemetry?.totalDraws>=3,null,{timeout:15000});
    const pre=await page.evaluate(()=>{
      const c=document.getElementById('world'),g=c.getContext('webgl2');
      return {webgl2:!!g,gl_error:g?.getError(),canvas:[c.width,c.height],
        frame_draws:window.__heritageTelemetry.frameDraws,total_draws:window.__heritageTelemetry.totalDraws,
        view:window.__heritageTelemetry.viewMatrix,
        document_width:document.documentElement.scrollWidth,viewport_width:innerWidth,
        disclaimer:document.body.textContent.includes('NOT AN EXACT RECONSTRUCTION')||
          document.body.textContent.includes('all positions and layout here imagined')};
    });
    assert.equal(pre.webgl2,true,p.name+': WebGL2 not created');
    assert.equal(pre.gl_error,0,p.name+': WebGL error');
    assert.ok(pre.canvas[0]>100&&pre.canvas[1]>100,p.name+': empty framebuffer');
    assert.ok(pre.frame_draws>=1,p.name+': no scene mesh drawn');
    assert.ok(pre.view,p.name+': camera matrix missing');
    assert.ok(pre.document_width<=pre.viewport_width+4,p.name+': page overflows horizontally');
    assert.equal(pre.disclaimer,true,p.name+': missing public historical accuracy disclosure');
    await page.screenshot({path:output+'/'+p.name+'-arrival.png',timeout:12000});
    // Toggle must actually cause an additional draw call each rendered frame.
    await page.locator('#toggle').click();
    await page.waitForFunction(()=>window.__heritageTelemetry?.frameDraws===2,null,{timeout:10000});
    assert.equal(await page.locator('#toggle').getAttribute('aria-pressed'),'true');
    await page.screenshot({path:output+'/'+p.name+'-interpretive.png',timeout:12000});
    await page.locator('#toggle').click();
    await page.waitForFunction(()=>window.__heritageTelemetry?.frameDraws===1,null,{timeout:10000});
    assert.equal(await page.locator('#toggle').getAttribute('aria-pressed'),'false');
    // Guided camera tour must render on the same real WebGL canvas.
    await page.locator('#tour').click();
    assert.equal(await page.locator('#tour').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#tourprogress').isVisible(),true);
    await page.waitForTimeout(850);
    assert.ok((await page.locator('#tourchapter').textContent()).length>10);
    assert.notEqual(await page.locator('#tourfill').evaluate(el=>el.style.transform),'scaleX(0)');
    await page.screenshot({path:output+'/'+p.name+'-tour.png',timeout:12000});
    await page.locator('#tour').click();
    assert.equal(await page.locator('#tourprogress').isVisible(),false);
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'world',p.name+': scene keyboard focus not restored');
    const before=await page.evaluate(()=>window.__heritageTelemetry.viewMatrix);
    if(!p.mobile){
      const initial=await page.evaluate(()=>window.__evercraftHeritageQA());
      assert.equal(initial.running,true,p.name+': world not active');
      assert.equal(initial.tourActive,false,p.name+': tour still owns camera');
      assert.ok([initial.x,initial.z,initial.yaw,initial.pitch,initial.move.x,initial.move.y].every(Number.isFinite),
        p.name+': nonfinite tour handoff state '+JSON.stringify(initial));
      await page.keyboard.down('w');
      try{
        const keyState=await page.evaluate(()=>window.__evercraftHeritageQA());
        assert.ok(keyState.keys.includes('w'),p.name+': keyboard event did not reach scene '+JSON.stringify(keyState));
        // Check actual scene coordinates first, then the GL view transform.
        // This separates an input/camera bug from a stale WebGL telemetry sample.
        await page.waitForFunction(previous=>{
          const now=window.__evercraftHeritageQA?.();
          return !!now&&Math.hypot(now.x-previous.x,now.z-previous.z)>.15;
        },initial,{timeout:15000,polling:100});
        await page.waitForFunction(previous=>{
          const view=window.__heritageTelemetry?.viewMatrix;
          return !!view&&Math.hypot(...[12,13,14].map(i=>view[i]-previous[i]))>.15;
        },before,{timeout:15000,polling:100});
      }catch(err){
        const diagnostic=await page.evaluate(()=>({scene:window.__evercraftHeritageQA?.(),view:window.__heritageTelemetry?.viewMatrix,draws:window.__heritageTelemetry?.totalDraws}));
        throw Error(p.name+': camera handoff QA '+JSON.stringify(diagnostic)+'; '+String(err));
      }finally{await page.keyboard.up('w');}
    }else{
      assert.equal(await page.locator('#joystick').isVisible(),true,p.name+': touch stick not visible');
      const stick=await page.locator('#joystick').boundingBox();
      assert.ok(stick&&stick.width>=90,p.name+': touch stick too small');
      const client=await ctx.newCDPSession(page);
      const xx=stick.x+stick.width/2,yy=stick.y+stick.height/2;
      await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:xx,y:yy}]});
      await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:xx,y:yy-32}]});
      await page.waitForTimeout(950);
      await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }
    const after=await page.evaluate(()=>window.__heritageTelemetry.viewMatrix);
    assert.ok(after&&before,p.name+': camera not tracked');
    const movement=Math.hypot(...[12,13,14].map(i=>after[i]-before[i]));
    assert.ok(movement>.15,p.name+': controls did not move the camera (distance '+movement+')');
    await page.locator('#inspect').click();
    await page.locator('#panel').waitFor({state:'visible',timeout:5000});
    assert.ok((await page.locator('#panel-copy').textContent()).length>60,p.name+': missing evidence text');
    assert.ok(await page.locator('#sources a[href^="https://"]').count()>=1,p.name+': no linked research source');
    await page.locator('#close').click();
    await page.locator('#guide').click();
    assert.ok(await page.locator('#sources a[href^="https://"]').count()>=3,p.name+': research guide missing citations');
    await page.locator('#close').click();
    // Actually walk through the same-origin heritage→atlas→heritage navigation
    // using the owned Worlds vault router, not Python's auto-index behavior.
    await page.locator('.back').click();
    await page.waitForURL('**/worlds/heritage/atlas/',{timeout:10000});
    await page.waitForFunction(()=>document.querySelector('#visible-count')?.textContent?.includes('7 displayed'),null,{timeout:10000});
    assert.equal(await page.locator('#cards .site').count(),7,p.name+': canonical atlas data not loaded');
    await page.locator('a[href="../"]').first().click();
    await page.waitForURL('**/worlds/heritage/',{timeout:10000});
    assert.equal(await page.locator('#start').isVisible(),true,p.name+': cannot return to heritage scene');
    assert.deepEqual(errors,[],p.name+': uncaught browser exceptions');
    receipt.scenarios.push({profile:p.name,status:'PASS',elapsed_ms:Date.now()-start,
      render:pre,control_movement_schematic_units:Math.round(movement*100)/100,
      toggle_verified:true,guided_tour_verified:true,source_links_verified:true,page_errors:errors});
    await ctx.close();
  }
  // Explicit no-WebGL fallback, tested separately from the real renderer.
  const fallback=await browser.newContext({viewport:{width:390,height:800}});
  const page=await fallback.newPage(),fallbackErrors=[];
  page.on('pageerror',e=>fallbackErrors.push(String(e.message)));
  await page.addInitScript(()=>{
    const orig=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){if(type==='webgl2')return null;return orig.call(this,type,...args);};
  });
  await page.goto(origin+'/worlds/heritage/',{waitUntil:'domcontentloaded'});
  await page.locator('#unsupported').waitFor({state:'visible'});
  assert.equal(await page.locator('#intro').isVisible(),false);
  assert.deepEqual(fallbackErrors,[],'WebGL unsupported fallback threw');
  receipt.scenarios.push({profile:'no-webgl-fallback',status:'PASS',page_errors:[]});
  await fallback.close();
  receipt.status='PASS';
}catch(e){receipt.status='FAIL';receipt.error=String(e?.stack||e);process.exitCode=1;}
finally{
  await writeFile(output+'/receipt.json',JSON.stringify(receipt,null,2));
  if(browser)await browser.close();
  server.kill('SIGTERM');
  console.log(JSON.stringify(receipt,null,2));
}