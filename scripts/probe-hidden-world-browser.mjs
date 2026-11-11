// Evercraft Hidden World visual regression, local Chromium only, not physical-phone proof.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const origin='http://127.0.0.1:8768';
const output=resolve('artifacts/hidden-world-browser');
const receipt={schema:'evercraft.hidden-world.browser-qa.v1',
  source:'local checked-out source',production_deployed:false,physical_device_tested:false,
  browser_emulation_only:true,scenarios:[]};
await mkdir(output,{recursive:true});
const server=spawn('python3',['-m','http.server','8768','--bind','127.0.0.1','-d','public'],{stdio:'ignore'});
let browser;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
try{
  let ready=false;
  for(let i=0;i<40;i++){
    if(server.exitCode!==null)throw Error('local_server_exited');
    try{const response=await fetch(origin+'/worlds/hidden-world/');if(response.status===200){ready=true;break;}}catch{}
    await delay(200);
  }
  assert.ok(ready,'atlas root unavailable');
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  for(const profile of [
    {name:'desktop',width:1280,height:800,scripts:true},
    {name:'phone',width:390,height:844,scripts:true},
    {name:'phone-no-js',width:390,height:844,scripts:false},
    {name:'small-phone-no-js',width:320,height:640,scripts:false}
  ]){
    const ctx=await browser.newContext({viewport:{width:profile.width,height:profile.height},
      isMobile:profile.width<500,hasTouch:profile.width<500,javascriptEnabled:profile.scripts});
    const page=await ctx.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(String(e.message)));
    const atlas=await page.goto(origin+'/worlds/hidden-world/',{waitUntil:'domcontentloaded',timeout:20000});
    assert.equal(atlas?.status(),200,profile.name+': atlas route');
    assert.equal(await page.locator('a[href="yakima-evidence.html"]').count(),1,profile.name+': evidence link');
    const response=await page.goto(origin+'/worlds/hidden-world/yakima-evidence.html',
      {waitUntil:'domcontentloaded',timeout:20000});
    assert.equal(response?.status(),200,profile.name+': evidence route');
    assert.equal(await page.locator('.p1900').isVisible(),true,'default year must be visible');
    await page.locator('label[for="era-1924"]').click();
    assert.equal(await page.locator('#era-1924').isChecked(),true,profile.name+': CSS year switch');
    assert.equal(await page.locator('.p1924').isVisible(),true,profile.name+': 1924 content hidden');
    assert.equal(await page.locator('a[href="yakima-evidence-ledger.v1.json"]').count(),1,
      profile.name+': research ledger download link missing');
    assert.ok(await page.locator('.event .source a[href^="https://"]').count()>=4,
      profile.name+': missing historical sources');
    assert.ok((await page.locator('body').textContent()).includes('0Connected tunnels established by the records reviewed'),
      profile.name+': missing underground uncertainty');
    const widths=await page.evaluate(()=>[document.documentElement.scrollWidth,innerWidth]);
    assert.ok(widths[0]<=widths[1]+4,profile.name+': horizontal scroll overflows '+widths);
    await page.screenshot({path:output+'/'+profile.name+'.png',timeout:15000});

    const architecture=await page.goto(origin+'/worlds/hidden-world/lund-building.html',
      {waitUntil:'domcontentloaded',timeout:20000});
    assert.equal(architecture?.status(),200,profile.name+': Lund architecture page');
    assert.equal(await page.locator('svg[aria-labelledby="scene-title scene-desc"]').count(),1);
    assert.equal(await page.locator('#y1899').isChecked(),true);
    const originalOpacity=await page.locator('g.original').evaluate(el=>getComputedStyle(el).opacity);
    assert.equal(originalOpacity,'1',profile.name+': 1899 saloon missing');
    await page.locator('label[for="y1910"]').click();
    assert.equal(await page.locator('#y1910').isChecked(),true);
    await page.waitForTimeout(250);
    const retailOpacity=await page.locator('g.original').evaluate(el=>getComputedStyle(el).opacity);
    assert.equal(retailOpacity,'0',profile.name+': 1910 storefront did not switch');
    await page.locator('label[for="y1925"]').click();
    assert.equal(await page.locator('#y1925').isChecked(),true);
    assert.equal(await page.locator('.note1925').isVisible(),true);
    assert.ok((await page.locator('.warning').textContent()).includes('does not identify the connecting doorways as underground'));
    assert.ok(await page.locator('a[href*="npgallery.nps.gov"]').count()>=1,
      profile.name+': missing historic nomination source');
    const archWidths=await page.evaluate(()=>[document.documentElement.scrollWidth,innerWidth]);
    assert.ok(archWidths[0]<=archWidths[1]+4,profile.name+': Lund page horizontal overflow '+archWidths);
    await page.screenshot({path:output+'/'+profile.name+'-lund.png',timeout:15000});

    const titanResponse=await page.goto(origin+'/worlds/hidden-world/titan-i-1962.html',
      {waitUntil:'domcontentloaded',timeout:20000});
    assert.equal(titanResponse?.status(),200,profile.name+': Titan exhibit route');
    assert.equal(await page.locator('svg[aria-labelledby="titan-svg-title titan-svg-desc"]').count(),1);
    assert.equal(await page.locator('#era1962').isChecked(),true);
    assert.equal(await page.locator('.phase1962').isVisible(),true);
    await page.locator('label[for="era1959"]').click();
    assert.equal(await page.locator('#era1959').isChecked(),true);
    assert.equal(await page.locator('.phase1959').isVisible(),true);
    await page.locator('label[for="era1965"]').click();
    assert.equal(await page.locator('#era1965').isChecked(),true);
    assert.equal(await page.locator('.phase1965').isVisible(),true);
    await page.locator('label[for="erapresent"]').click();
    assert.equal(await page.locator('.phasepresent').isVisible(),true);
    await page.locator('label[for="era1962"]').click();
    await page.locator('label[for="fConnections"]').click();
    assert.equal(await page.locator('.connections').isVisible(),true);
    assert.ok((await page.locator('.caution').textContent()).includes('closed to visitors'),
      profile.name+': Titan restricted-access warning absent');
    assert.ok((await page.locator('a[href*="historylink.org"]').count())>0,
      profile.name+': source absent');
    const titanWidths=await page.evaluate(()=>[document.documentElement.scrollWidth,innerWidth]);
    assert.ok(titanWidths[0]<=titanWidths[1]+4,profile.name+': Titan horizontal overflow '+titanWidths);
    await page.evaluate(()=>document.querySelector('.exhibit').scrollIntoView({block:'start'}));
    await page.screenshot({path:output+'/'+profile.name+'-titan.png',timeout:15000});

    const walkResponse=await page.goto(origin+'/worlds/hidden-world/titan-walk/',{waitUntil:'domcontentloaded',timeout:20000});
    assert.equal(walkResponse?.status(),200,profile.name+': Titan gallery homepage');
    assert.equal(await page.locator('a[href="../titan-i-1962.html"]').count()>=1,true,
      profile.name+': lost historical evidence fallback');
    if(profile.scripts){
      await page.waitForFunction(()=>typeof window.__evercraftTitanQA==='function',{timeout:12000});
      await page.locator('#start').click();
      await page.waitForFunction(()=>window.__evercraftTitanQA?.().running===true,{timeout:10000});
      const before=await page.evaluate(()=>window.__evercraftTitanQA());
      await page.keyboard.down('w');await page.waitForTimeout(380);await page.keyboard.up('w');
      const after=await page.evaluate(()=>window.__evercraftTitanQA());
      assert.ok(after.z<before.z-.1,profile.name+': WASD does not move camera');
      await page.locator('#guide').click();
      assert.equal(await page.locator('#panel').isVisible(),true,profile.name+': research panel missing');
      assert.ok((await page.locator('#panel-copy').textContent()).includes('fictional research museum'));
      await page.locator('#close').click();
      await page.locator('#tour').click();
      await page.waitForTimeout(180);
      assert.equal((await page.evaluate(()=>window.__evercraftTitanQA())).tourActive,true,
        profile.name+': guided history tour did not start');
      await page.locator('#tour').click();
      assert.equal((await page.evaluate(()=>window.__evercraftTitanQA())).tourActive,false);
    }else{
      assert.equal(await page.locator('noscript').count(),1);
      assert.ok((await page.locator('body').textContent()).includes('Interactive 3D requires JavaScript'));
    }
    await page.screenshot({path:output+'/'+profile.name+'-titan-walk.png',timeout:15000});
    assert.deepEqual(errors,[],profile.name+': browser errors');
    receipt.scenarios.push({name:profile.name,status:'PASS',viewport:[profile.width,profile.height],
      javascript_enabled:profile.scripts,no_horizontal_overflow:true,sources_visible:true});
    await ctx.close();
  }
  receipt.status='PASS';
}catch(e){receipt.status='FAIL';receipt.error=String(e.stack||e);process.exitCode=1;}
finally{
  await writeFile(output+'/receipt.json',JSON.stringify(receipt,null,2));
  if(browser)await browser.close();
  server.kill('SIGTERM');
  console.log(JSON.stringify(receipt,null,2));
}
