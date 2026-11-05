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
