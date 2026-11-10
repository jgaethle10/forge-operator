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
  }finally{await browser.close();}
})().catch(err=>{console.error(err.stack||err);process.exitCode=1;});
