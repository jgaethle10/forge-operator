// Offline pixel acceptance of a synthetic Saban work-state visual specimen.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');

const base=path.resolve(process.argv[2]||'artifacts/saban-work-visual-specimen');
const html=path.join(base,'saban-state-synthetic.html');
const digest=filename=>crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    for(const width of [1280,390]){
      const page=await browser.newPage({viewport:{width,height:840},deviceScaleFactor:1});
      const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('request',request=>{
        if(!request.url().startsWith('file:'))errors.push('External request: '+request.url());
      });
      await page.goto(pathToFileURL(html).href,{waitUntil:'load'});
      const metrics=await page.evaluate(()=>({
        scrollWidth:document.documentElement.scrollWidth,
        clientWidth:document.documentElement.clientWidth,
        markCount:document.querySelectorAll('.mark').length,
        boardWidth:document.querySelector('.frame').getBoundingClientRect().width,
        h1:document.querySelector('h1')?.textContent
      }));
      assert.ok(metrics.scrollWidth<=metrics.clientWidth+1,'Horizontal overflow on '+width+': '+JSON.stringify(metrics));
      assert.equal(metrics.markCount,20);
      assert.ok(metrics.boardWidth<=width,'Board exceeds '+width+'px viewport');
      assert.match(metrics.h1,/See the work/);
      assert.deepEqual(errors,[]);
      const name='saban-'+width+'px.png';
      const target=path.join(base,name);
      await page.screenshot({path:target,fullPage:true,animations:'disabled'});
      console.log(JSON.stringify({width,height:840,rendered_png:name,sha256:digest(target),bytes:fs.statSync(target).size,status:'passed'}));
      await page.close();
    }
    // Separate, source-bound time-series specimen from canonical synthetic transitions.
    // It is a finite sequence of sampled states, never fictional real-time telemetry.
    for(const width of [1280,390]){
      const page=await browser.newPage({viewport:{width,height:840},deviceScaleFactor:1});
      const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('request',request=>{
        if(!request.url().startsWith('file:'))errors.push('External request: '+request.url());
      });
      await page.goto(pathToFileURL(path.join(base,'saban-observations-synthetic.html')).href,{waitUntil:'load'});
      const metrics=await page.evaluate(()=>({
        scrollWidth:document.documentElement.scrollWidth,
        clientWidth:document.documentElement.clientWidth,
        count:document.querySelectorAll('.observation').length,
        rows:[...document.querySelectorAll('.observation')].map(e=>e.querySelectorAll('.metric').length),
        text:document.body.textContent
      }));
      assert.ok(metrics.scrollWidth<=metrics.clientWidth+1,
        'Synthetic observations overflow on '+width+': '+JSON.stringify(metrics));
      assert.equal(metrics.count,3);
      assert.deepEqual(metrics.rows,[4,4,4]);
      assert.match(metrics.text,/SYNTHETIC TEST DATA/);
      assert.match(metrics.text,/SOURCE BYTES CHANGED/);
      assert.match(metrics.text,/not proven per-job events/);
      assert.deepEqual(errors,[],'Observation browser errors or external network requests');
      const name='saban-observations-'+width+'px.png';
      const target=path.join(base,name);
      await page.screenshot({path:target,fullPage:true,animations:'disabled'});
      console.log(JSON.stringify({width,rendered_png:name,sha256:digest(target),
        bytes:fs.statSync(target).size,status:'passed',synthetic_test:true}));
      await page.close();
    }
    // Verified synthetic scheduler events, not an invented animated timeline.
    for(const width of [1280,390]){
      const page=await browser.newPage({viewport:{width,height:840},deviceScaleFactor:1});
      const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('request',request=>{
        if(!request.url().startsWith('file:'))errors.push('Unexpected network request: '+request.url());
      });
      await page.goto(pathToFileURL(path.join(base,'saban-transitions-synthetic.html')).href,{waitUntil:'load'});
      const metrics=await page.evaluate(()=>({
        scrollWidth:document.documentElement.scrollWidth,
        width:document.documentElement.clientWidth,
        recent:document.querySelectorAll('.recent-event').length,
        all:document.querySelectorAll('.history-event').length,
        historyOpen:document.querySelector('details.history')?.open,
        height:document.documentElement.scrollHeight,
        summary:[...document.querySelectorAll('.metric strong')].map(e=>e.textContent),
        text:document.body.textContent
      }));
      assert.ok(metrics.scrollWidth<=metrics.width+1,
        'Scheduler timeline exceeds viewport '+width+': '+JSON.stringify(metrics));
      assert.equal(metrics.recent,4);
      assert.equal(metrics.all,25);
      assert.equal(metrics.historyOpen,false,'Full log must be collapsed by default');
      assert.ok(metrics.height<(width===390?1900:1500),
        'At-a-glance view is still an unreadable skyscraper: '+JSON.stringify(metrics));
      assert.deepEqual(metrics.summary,['10','2','0','0']);
      assert.match(metrics.text,/SYNTHETIC TEST/);
      assert.match(metrics.text,/WHAT TO DO NEXT/);
      assert.match(metrics.text,/2 jobs need review/);
      assert.match(metrics.text,/Local SHA-256 chain only/);
      assert.deepEqual(errors,[],'Timeline browser errors or external requests');
      const disclosure=page.locator('details.history');
      await disclosure.locator('summary').click();
      assert.equal(await disclosure.getAttribute('open'),'');
      assert.equal(await disclosure.locator('.history-event').count(),25);
      await disclosure.locator('summary').click();
      assert.equal(await disclosure.getAttribute('open'),null);
      const filename='saban-transitions-'+width+'px.png';
      const target=path.join(base,filename);
      await page.screenshot({path:target,fullPage:true,animations:'disabled'});
      console.log(JSON.stringify({width,rendered_png:filename,sha256:digest(target),
        bytes:fs.statSync(target).size,status:'passed',synthetic_test:true}));
      await page.close();
    }
  }finally{await browser.close();}
})().catch(err=>{console.error(err.stack||err);process.exitCode=1;});
