// Real browser smoke for the Art of Becoming. Uses a temporary local HTTP server.
// npm install --no-save playwright@1.58.2 && npx playwright install chromium
// node scripts/probe-art-of-becoming-browser.mjs
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {STORAGE_KEY,dayKey,shiftDay} from '../public/art-of-becoming/engine.mjs';

const root=fileURLToPath(new URL('../public/art-of-becoming/',import.meta.url));
const out=path.resolve(process.env.ART_OF_BECOMING_QA_OUTPUT || 'artifacts/art-of-becoming-browser-qa');
await fs.mkdir(out,{recursive:true});
const server=createServer(async (request,response)=>{
  try {
    const url=new URL(request.url,'http://127.0.0.1');
    const files={'/':'index.html','/index.html':'index.html','/engine.mjs':'engine.mjs'};
    const filename=files[url.pathname];
    if(!filename){response.writeHead(404);response.end('Not found');return;}
    const buffer=await fs.readFile(path.join(root,filename));
    response.writeHead(200,{'Content-Type':filename.endsWith('.mjs')?'text/javascript; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    response.end(buffer);
  } catch(error) {response.writeHead(500);response.end('Read failure');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const errors=[], externalRequests=[];
let browser;
try {
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({
    viewport:{width:390,height:844},deviceScaleFactor:2,
    isMobile:true,hasTouch:true,acceptDownloads:true,reducedMotion:'reduce'
  });
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(!request.url().startsWith(origin+'/'))externalRequests.push(request.url());});
  await page.goto(origin+'/index.html',{waitUntil:'load'});
  await assertViewport(page,390);
  assert.match(await page.title(),/The Art of Becoming/);
  assert.equal(await page.locator('#days').innerText(),'0');
  assert.equal(await page.locator('#pieces').innerText(),'0');
  assert.equal(await page.locator('#art-status').innerText(),'0 / 7');
  assert.equal(await page.locator('#goals button').count(),6);
  assert.equal(await page.locator('#art-frame svg').count(),1);

  // Every check-in uses the actual phone-facing control, not a synthetic state injection.
  const today=await page.evaluate(()=>{
    const d=new Date(), pad=n=>String(n).padStart(2,'0');
    return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  });
  // Keep the browser date authoritative if the runner happens to cross midnight.
  assert.ok(today===dayKey() || [shiftDay(dayKey(),-1),shiftDay(dayKey(),1)].includes(today));
  for(let daysAgo=6;daysAgo>=0;daysAgo--){
    await page.locator('#check-date').fill(shiftDay(today,-daysAgo));
    await page.locator('#kept').click();
  }
  assert.equal(await page.locator('#days').innerText(),'7');
  assert.equal(await page.locator('#streak').innerText(),'7');
  assert.equal(await page.locator('#pieces').innerText(),'1');
  assert.equal(await page.locator('#gallery .gallery-item').count(),1);
  assert.equal(await page.locator('#art-status').innerText(),'7 / 7');
  await page.screenshot({path:path.join(out,'mobile-390-completed.png'),fullPage:true});

  const [artDownload]=await Promise.all([
    page.waitForEvent('download'),
    page.locator('#save-art').click()
  ]);
  const downloadedSvg=await fs.readFile(await artDownload.path(),'utf8');
  assert.match(downloadedSvg,/^<svg /);
  assert.match(downloadedSvg,/7 of 7 marks/);
  const [galleryDownload]=await Promise.all([
    page.waitForEvent('download'),
    page.locator('#gallery [data-download-art="1"]').click()
  ]);
  assert.match(await fs.readFile(await galleryDownload.path(),'utf8'),/^<svg /);

  // A difficult day does not destroy the completed work.
  await page.locator('#hard').click();
  assert.equal(await page.locator('#streak').innerText(),'0');
  assert.equal(await page.locator('#pieces').innerText(),'1');
  assert.equal(await page.locator('#gallery .gallery-item').count(),1);
  assert.equal(await page.locator('#art-frame.hard').count(),1);
  await page.reload();
  assert.equal(await page.locator('#pieces').innerText(),'1');
  assert.equal(await page.locator('#streak').innerText(),'0');
  assert.equal(await page.locator('#art-frame.hard').count(),1);

  // Goals cannot overwrite each other's progress.
  await page.locator('#goals button[data-goal="reading"]').click();
  assert.equal(await page.locator('#days').innerText(),'0');
  await page.locator('#kept').click();
  assert.equal(await page.locator('#days').innerText(),'1');
  await page.locator('#goals button[data-goal="alcohol-free"]').click();
  assert.equal(await page.locator('#days').innerText(),'7');

  // Styles should all render without exceptions.
  for(const theme of ['mosaic','constellation','garden']){
    await page.locator('#theme').selectOption(theme);
    assert.equal(await page.locator('#art-frame svg').count(),1);
    assert.ok((await page.locator('#art-frame svg').innerHTML()).length>300);
  }
  await page.screenshot({path:path.join(out,'mobile-390-hard-day.png'),fullPage:true});
  await page.setViewportSize({width:320,height:740});
  await assertViewport(page,320);
  await page.screenshot({path:path.join(out,'mobile-320.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});

  // Export, wipe and explicitly restore verified local records.
  const [backup]=await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export').click()
  ]);
  const backupPath=await backup.path();
  const payload=JSON.parse(await fs.readFile(backupPath,'utf8'));
  assert.equal(payload.app,'The Art of Becoming');
  assert.equal(payload.data.entries['alcohol-free'][today],'hard');
  page.on('dialog',dialog=>dialog.accept());
  await page.locator('#erase').click();
  assert.equal(await page.locator('#days').innerText(),'0');
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY),null);
  await page.locator('#import-file').setInputFiles(backupPath);
  assert.equal(await page.locator('#days').innerText(),'7');
  assert.equal(await page.locator('#pieces').innerText(),'1');

  // Corrupt browser storage should not permanently disable saving new progress.
  await page.evaluate(key=>localStorage.setItem(key,'{broken'),STORAGE_KEY);
  await page.reload();
  assert.equal(await page.locator('#days').innerText(),'0');
  await page.locator('#kept').click();
  assert.equal(await page.locator('#days').innerText(),'1');
  const repaired=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),STORAGE_KEY);
  assert.equal(repaired.entries['alcohol-free'][today],'kept');

  // Desktop view should have no clipped sideways content, too.
  const desktopContext=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true,reducedMotion:'reduce'});
  const desktop=await desktopContext.newPage();
  desktop.on('pageerror',error=>errors.push(error.message));
  desktop.on('request',request=>{if(!request.url().startsWith(origin+'/'))externalRequests.push(request.url());});
  await desktop.goto(origin+'/index.html',{waitUntil:'load'});
  await assertViewport(desktop,1440);
  await desktop.screenshot({path:path.join(out,'desktop-1440.png'),fullPage:true});
  await desktopContext.close();

  assert.deepEqual(errors,[],'Uncaught browser exceptions');
  assert.deepEqual(externalRequests,[],'No outbound tracking or third-party requests');
  await fs.writeFile(path.join(out,'receipt.json'),JSON.stringify({
    schema:'evercraft.art-of-becoming.browser-qa.v1',ok:true,
    viewport_checks:[320,390,1440],
    checks:['mobile render','check-in progression','completed SVG download','permanent local gallery','difficult-day preservation','reload','multiple goals','theme selection','backup export','erase','validated restore','corrupt storage recovery','no external requests','no runtime exceptions'],
    tested_at:new Date().toISOString(),external_requests:externalRequests.length,page_errors:errors.length
  },null,2)+'\n');
  console.log('ART_OF_BECOMING_BROWSER_QA_PASS: all mobile, desktop, privacy and retention checks passed');
  await context.close();
} finally {
  if(browser) await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
async function assertViewport(page,width) {
  const dimensions=await page.evaluate(()=>({
    window:window.innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth
  }));
  assert.ok(dimensions.scroll<=width+2,'Horizontal overflow: '+JSON.stringify(dimensions));
  assert.ok(dimensions.body<=width+2,'Body overflow: '+JSON.stringify(dimensions));
}
