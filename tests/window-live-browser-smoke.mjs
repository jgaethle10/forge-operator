import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {chromium}=require('/tmp/window-probe/node_modules/playwright-core');
const url='https://jgaethle10.github.io/forge-operator/the-window/';
const browser=await chromium.launch({
  headless:true,
  executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',
  args:['--no-sandbox','--disable-dev-shm-usage']
});
fs.mkdirSync('artifacts',{recursive:true});
let errors=[];
try{
  const desktop=await browser.newPage({viewport:{width:1280,height:900}});
  desktop.on('pageerror',e=>errors.push('desktop: '+e.message));
  const response=await desktop.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
  assert.equal(response.status(),200);
  await desktop.waitForFunction(
    () => document.querySelectorAll('.agent').length===12 &&
      document.getElementById('connection')?.textContent==='Clock synchronized',
    null,{timeout:45000}
  );
  assert.equal(await desktop.locator('.agent').count(),12);
  await desktop.locator('.agent').nth(1).click();
  assert.match(await desktop.locator('#resident-heading').innerText(),/Ivo/);
  assert.match(await desktop.locator('#profile').innerText(),/LONG-TERM ASPIRATION/);
  const a=await desktop.locator('#clock').innerText();
  const chronicle=await desktop.locator('#events li').count();
  assert.ok(chronicle>0,'town chronicle should not be empty');
  await desktop.screenshot({path:'artifacts/window-desktop.png',fullPage:true});

  const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  mobile.on('pageerror',e=>errors.push('mobile: '+e.message));
  const second=await mobile.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
  assert.equal(second.status(),200);
  await mobile.waitForFunction(
    () => document.querySelectorAll('.agent').length===12 &&
      document.getElementById('connection')?.textContent==='Clock synchronized',
    null,{timeout:45000}
  );
  assert.equal(await mobile.locator('.agent').count(),12);
  const b=await mobile.locator('#clock').innerText();
  const delta=Math.abs(Number((a.match(/(\d{2}):(\d{2})/)||[])[1])*60+
    Number((a.match(/(\d{2}):(\d{2})/)||[])[2])-
    Number((b.match(/(\d{2}):(\d{2})/)||[])[1])*60-
    Number((b.match(/(\d{2}):(\d{2})/)||[])[2]));
  assert.ok(delta<=15||delta>=1425,'two visitors should see approximately the same shared clock');
  await mobile.screenshot({path:'artifacts/window-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS',url,desktopClock:a,mobileClock:b,agents:12,chronicleEntries:chronicle,
    clickProfile:'Ivo',errors:0}));
}finally{await browser.close();}
