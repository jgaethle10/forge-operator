// Atlas and RouteTwin smoke checks in a genuine Playwright Chromium browser.
// All fixtures are synthetic; this script never contacts production freight providers.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const origin='http://127.0.0.1:8787';
const out=resolve('artifacts/systemia-atlas-browser');
await mkdir(out,{recursive:true});
const server=spawn('python3',['-m','http.server','8787','--directory','public'],{stdio:'ignore'});
let browser;
const receipt={schema:'evercraft.systemia-atlas.browser-qa.v1',
 observedAt:new Date().toISOString(),source:'local CI branch; NOT publicly deployed',
 syntheticOnly:true,realCarrierData:false,realRoadData:false,physicalPhoneTest:false,scenarios:[]};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{
  await wait(1000);
  browser=await chromium.launch({headless:true,args:[
    '--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader'
  ]});
  receipt.browserVersion=browser.version();
  for(const profile of [
    {name:'desktop',width:1365,height:850,mobile:false},
    {name:'phone-emulation',width:390,height:844,mobile:true}
  ]){
    const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},
      isMobile:profile.mobile,hasTouch:profile.mobile,acceptDownloads:true,deviceScaleFactor:1});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const r=await page.goto(origin+'/apps/systemia-atlas/',{waitUntil:'domcontentloaded',timeout:20000});
    assert.equal(r?.status(),200,profile.name+': Atlas cockpit not served');
    await page.locator('h1').waitFor({state:'visible',timeout:12000});
    await page.getByRole('heading',{name:'Every load. One clear picture.'}).waitFor();
    const layout=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,window:innerWidth}));
    assert.ok(layout.doc<=layout.window+3,profile.name+': Atlas horizontal overflow');
    await page.screenshot({path:out+'/'+profile.name+'-overview.png',timeout:10000});
    await page.locator('nav button[data-tab="loads"]').click();
    await page.locator('button[data-action="open-load"][data-id="SIM-002"]').click();
    await page.locator('button[data-action="advance"][data-id="SIM-002"][data-stage="quoted"]').click();
    await page.locator('button[data-action="advance"][data-id="SIM-002"][data-stage="booked"]').click();
    assert.match(await page.locator('#toast').textContent(),/attestation required/);
    await page.locator('nav button[data-tab="carriers"]').click();
    await page.locator('button[data-action="carrier-review"][data-id="C-02"]').click();
    await page.locator('nav button[data-tab="loads"]').click();
    await page.locator('button[data-action="advance"][data-id="SIM-002"][data-stage="booked"]').click();
    await page.locator('button[data-action="document"][data-id="SIM-002"][data-doc="rate_confirmation"]').click();
    await page.locator('button[data-action="document"][data-id="SIM-002"][data-doc="bill_of_lading"]').click();
    await page.locator('button[data-action="advance"][data-id="SIM-002"][data-stage="in_transit"]').click();
    await page.locator('button[data-action="advance"][data-id="SIM-002"][data-stage="delivered"]').click();
    await page.locator('button[data-action="advance"][data-id="SIM-002"][data-stage="closed"]').click();
    assert.match(await page.locator('#toast').textContent(),/POD and resolved exceptions required/);
    await page.locator('button[data-action="document"][data-id="SIM-002"][data-doc="proof_of_delivery"]').click();
    await page.locator('button[data-action="resolve"][data-id="SIM-002"]').click();
    await page.locator('button[data-action="advance"][data-id="SIM-002"][data-stage="closed"]').click();
    assert.equal(await page.locator('button[data-action="advance"][data-id="SIM-002"]').count(),0);
    await page.screenshot({path:out+'/'+profile.name+'-closed.png',timeout:10000});
    await page.locator('nav button[data-tab="evidence"]').click();
    assert.match(await page.locator('#page').textContent(),/stage transition/);
    assert.equal(await page.evaluate(()=>localStorage.length),0,profile.name+': synthetic data must not persist in localStorage');

    await page.locator('nav button[data-tab="routetwin"]').click();
    const link=page.locator('a[href="../route-twin/"]');
    assert.equal(await link.count(),1);
    await link.click();
    await page.getByRole('heading',{name:'See the risks. Before the miles.'}).waitFor();
    await page.waitForTimeout(1000);
    const canvas=await page.evaluate(()=>{
      const c=document.querySelector('#scene');
      return {webgl2:!!c.getContext('webgl2'),width:c.width,height:c.height,
        errorVisible:getComputedStyle(document.querySelector('#webgl-error')).display!=='none',
        doc:document.documentElement.scrollWidth,window:innerWidth};
    });
    assert.equal(canvas.webgl2,true,profile.name+': RouteTwin WebGL2 missing');
    assert.equal(canvas.errorVisible,false,profile.name+': RouteTwin renderer failed');
    assert.ok(canvas.width>100&&canvas.height>100,profile.name+': 3D viewport too small');
    assert.ok(canvas.doc<=canvas.window+3,profile.name+': RouteTwin horizontal overflow');
    await page.locator('#scenario').selectOption('closure');
    assert.equal(await page.locator('#eta').textContent(),'NO-GO');
    assert.match(await page.locator('#disposition').textContent(),/STOP/);
    await page.locator('#progress').fill('750');
    assert.ok(Number(await page.locator('#progress').inputValue())<=250,profile.name+': blocked scenario allowed driving through');
    await page.screenshot({path:out+'/'+profile.name+'-route-twin.png',timeout:10000});
    assert.deepEqual(errors,[],profile.name+': browser JS exceptions');
    receipt.scenarios.push({profile:profile.name,atlasWorkflow:'pass',routeTwin:'pass',webgl2:canvas.webgl2,
      atlasNoOverflow:true,routeTwinNoOverflow:true,pageErrors:errors,canvasPx:[canvas.width,canvas.height]});
    await context.close();
  }
  receipt.status='PASS';
}catch(err){
  receipt.status='FAIL';receipt.error=String(err?.stack||err);
  throw err;
}finally{
  await writeFile(out+'/receipt.json',JSON.stringify(receipt,null,2));
  await browser?.close();server.kill('SIGTERM');
}
