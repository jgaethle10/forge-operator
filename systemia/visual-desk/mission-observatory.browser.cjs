#!/usr/bin/env node
/* Browser review of the real Observatory page, NOT production Systemia telemetry. */
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile, mkdir, writeFile } = require('node:fs/promises');
const { resolve, extname, join, sep } = require('node:path');
const { chromium } = require('playwright');

const publicRoot = resolve(process.cwd(), 'public');
const captureRoot = resolve(process.cwd(), '_mission_observatory_review');
const mime = { '.html':'text/html; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.svg':'image/svg+xml' };
const cases = [
  { name:'desktop-1440', viewport:{ width:1440,height:900 }, scale:1 },
  { name:'tablet-820', viewport:{ width:820,height:1050 }, scale:1 },
  { name:'iphone-390', viewport:{ width:390,height:844 }, scale:2 },
  { name:'small-phone-320', viewport:{ width:320,height:740 }, scale:2 }
];

function serve(req,res) {
  const pathname = new URL(req.url,'http://localhost').pathname;
  const mapped = pathname.endsWith('/') ? pathname+'index.html' : pathname;
  const full = resolve(publicRoot, '.'+decodeURIComponent(mapped));
  if (full !== publicRoot && !full.startsWith(publicRoot+sep)) { res.writeHead(403).end();return; }
  readFile(full).then(bytes=>{res.writeHead(200,{'Content-Type':mime[extname(full)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);}).catch(()=>res.writeHead(404).end('Not found'));
}
function waitForCount(page,expected) {
  return page.waitForFunction(expected=>document.getElementById('events-count')?.textContent.trim()===expected,expected);
}
async function run() {
  const server=createServer(serve);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const addr=server.address();
  const url='http://127.0.0.1:'+addr.port+'/visuals/mission-observatory/';
  await mkdir(captureRoot,{recursive:true});
  let browser;
  const reports=[];
  try {
    browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--no-sandbox']});
    for (const setting of cases) {
      const context=await browser.newContext({viewport:setting.viewport,deviceScaleFactor:setting.scale,reducedMotion:'reduce'});
      const page=await context.newPage();
      const errors=[],externalRequests=[];
      page.on('pageerror',e=>errors.push('pageerror: '+e.message));
      page.on('console',message=>{if(message.type()==='error')errors.push('console: '+message.text());});
      page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:'+addr.port+'/'))externalRequests.push(r.url());});
      await page.goto(url,{waitUntil:'networkidle',timeout:30000});
      assert.equal(await page.title(),'Mission Observatory · Evercraft Living Intelligence');
      assert.equal(await page.locator('#stages button').count(),6);
      assert.equal(await page.locator('.mode').innerText(),'● SYNTHETIC REPLAY');
      assert.match(await page.locator('.warning').innerText(),/NO LIVE AGENTS, TRANSFERS OR PAYMENTS/);
      assert.equal(await page.locator('#event-title').innerText(),'Awaiting signal');
      assert.equal(await page.locator('#play').innerText(),'▶ PLAY','reduced motion should start paused');
      await page.locator('#scrub').evaluate(el=>{el.value='27.5';el.dispatchEvent(new Event('input',{bubbles:true}));});
      await waitForCount(page,'12');
      assert.equal(await page.locator('#phase-title').innerText(),'DELIVERY');
      assert.equal(await page.locator('#event-title').innerText(),'Proof required before payment');
      assert.equal(await page.locator('#gates-count').innerText(),'03');
      assert.match(await page.locator('#event-source').innerText(),/SYNTHETIC/);
      assert.equal(await page.locator('button[aria-current="step"]').count(),1);
      const metrics=await page.evaluate(()=>{
        const c=document.getElementById('universe');
        const b=c.getBoundingClientRect();
        const pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
        let lit=0;for(let i=0;i<pixels.length;i+=4*43){if(Math.max(pixels[i],pixels[i+1],pixels[i+2])>35)lit++;}
        return {horizontalOverflow:document.documentElement.scrollWidth-innerWidth,canvasWidth:b.width,canvasHeight:b.height,renderWidth:c.width,renderHeight:c.height,litSamples:lit};
      });
      if(metrics.horizontalOverflow>3){
        const offenders=await page.evaluate(()=>Array.from(document.querySelectorAll('body *')).map(el=>({selector:el.id?'#'+el.id:(el.className&&typeof el.className==='string'?'.'+el.className.split(' ').join('.') :el.tagName.toLowerCase()),right:Math.round(el.getBoundingClientRect().right),width:Math.round(el.getBoundingClientRect().width)})).filter(x=>x.right>innerWidth+3).sort((a,b)=>b.right-a.right).slice(0,15));
        console.error('Horizontal overflow offenders',JSON.stringify(offenders));
      }
      assert.ok(metrics.horizontalOverflow<=3,'Horizontal scroll overflow '+JSON.stringify(metrics));
      assert.ok(metrics.canvasWidth>100&&metrics.canvasHeight>100,'Canvas not sized '+JSON.stringify(metrics));
      assert.ok(metrics.litSamples>=15,'Canvas did not render sufficient visible pixels '+JSON.stringify(metrics));
      await page.screenshot({path:join(captureRoot,setting.name+'.png'),fullPage:true,animations:'disabled'});
      await page.locator('#reset').click();
      await waitForCount(page,'00');
      assert.equal(await page.locator('#event-title').innerText(),'Awaiting signal');
      await page.locator('#speed').click();
      assert.equal(await page.locator('#speed').innerText(),'1.5×');
      await page.locator('#stages button').nth(4).click();
      assert.equal(await page.locator('#phase-title').innerText(),'VERIFICATION');
      assert.equal(errors.length,0,'Browser errors: '+errors.join('; '));
      assert.equal(externalRequests.length,0,'External network used: '+externalRequests.join('; '));
      reports.push({device:setting.name,viewport:setting.viewport,pixelRatio:setting.scale,metrics,screenshot:setting.name+'.png',result:'PASS'});
      await context.close();
    }
  } finally {
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
  const manifest={schema:'evercraft.observatory.browser-review.v1',dataState:'synthetic_only',browser:'chromium',real_iPhone_Safari_verified:false,production_telemetry_verified:false,deviceEmulation:true,results:reports};
  await writeFile(join(captureRoot,'review.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify(manifest,null,2));
}
run().catch(err=>{console.error(err);process.exitCode=1;});
