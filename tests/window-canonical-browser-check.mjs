import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
const {chromium}=require('/tmp/window-probe/node_modules/playwright-core');
const browser=await chromium.launch({
  executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',
  headless:true,args:['--no-sandbox','--disable-dev-shm-usage']
});
const uri='http://127.0.0.1:18887/';
const issues=[];
async function open(viewport,kind){
  const page=await browser.newPage({viewport});
  page.on('pageerror',e=>issues.push(kind+': '+e.message));
  page.on('console',m=>{if(m.type()==='error')issues.push(kind+': '+m.text());});
  const res=await page.goto(uri,{waitUntil:'domcontentloaded',timeout:45000});
  assert.equal(res.status(),200);
  await page.waitForFunction(()=>{
    const header=document.getElementById('connection')?.textContent;
    return header==='Independent heartbeat' || header==='Heartbeat delayed';
  },null,{timeout:35000});
  assert.equal(await page.locator('.agent').count(),12);
  assert.match(await page.locator('#heartbeat-receipt').innerText(),/Last committed update/);
  assert.match(await page.locator('#viewers').innerText(),/STATE #/);
  return page;
}
try{
  fs.mkdirSync('artifacts',{recursive:true});
  const [desktop,mobile]=await Promise.all([
    open({width:1280,height:900},'desktop'),
    open({width:390,height:844},'mobile')
  ]);
  const a=await desktop.locator('#clock').innerText();
  const b=await mobile.locator('#clock').innerText();
  assert.equal(a,b);
  await desktop.locator('.agent').nth(1).click();
  assert.match(await desktop.locator('#resident-heading').innerText(),/Ivo/);
  assert.match(await desktop.locator('#projects').innerText(),/town council|The first proposals|coins|construction|completed|abandoned/i);
  assert.match(await desktop.locator('#social-arcs').innerText(),/promised|commitment|followed through|relationship|No commitments/i);
  const description=await desktop.locator('.transparency').innerText();
  assert.match(description,/not LLM cognition/i);
  assert.equal(issues.length,0,issues.join('\n'));
  await desktop.screenshot({path:'artifacts/window-canonical-desktop.png',fullPage:true});
  await mobile.screenshot({path:'artifacts/window-canonical-mobile.png',fullPage:true});
  console.log('CANONICAL_BROWSER_PASS '+JSON.stringify({clock:a,agentCount:12,hashChecked:true,receiptShown:true,clickable:true,errors:issues.length}));
}finally{await browser.close();}
