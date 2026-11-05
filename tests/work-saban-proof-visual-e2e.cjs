// Work Saban visual QA: exercise ACTUAL browser pixels and recorded playback.
// Own synthetic fixture, no external services, no customers, no fabricated workers.
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const crypto=require('node:crypto');

const root=path.resolve(__dirname,'../public');
const artifacts=path.resolve(__dirname,'../artifacts/work-saban-visual-qa');
fs.mkdirSync(artifacts,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.csv':'text/csv; charset=utf-8','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
  try {
    const route=new URL(req.url,'http://127.0.0.1');
    const suffix=route.pathname.endsWith('/')?'index.html':'';
    const file=path.resolve(root,'.'+decodeURIComponent(route.pathname+suffix));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    const data=fs.readFileSync(file);
    res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream',
      'cache-control':'no-store','x-content-type-options':'nosniff'});
    res.end(data);
  }catch{res.writeHead(404).end();}
});
const sha=(file)=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const expected=['$12,500.50','$12,300.00','$11,500.50'];
async function scenario(type,name,viewport,base,reducedMotion=false){
  const browser=await type.launch({headless:true});
  const context=await browser.newContext({
    viewport, ...(name==='webkit-mobile'?{isMobile:true,hasTouch:true}:{}),
    acceptDownloads:false,
    recordVideo:{dir:artifacts,size:{width:viewport.width,height:viewport.height}}
  });
  const page=await context.newPage();
  const errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',request=>{
    if(!request.url().startsWith(base) && !request.url().startsWith('blob:'))
      external.push(request.url());
  });
  const prefix=name+(reducedMotion?'-reduced':'');
  try{
    if(reducedMotion)await page.emulateMedia({reducedMotion:'reduce'});
    await page.goto(base+'/work-saban/demo/',{waitUntil:'load'});
    assert.equal(await page.locator('#visual-replay').isHidden(),true);
    await page.getByRole('button',{name:'Run the example'}).click();
    const stage=page.locator('#visual-replay');
    await stage.waitFor({state:'visible'});
    await page.waitForFunction(()=>document.querySelector('#vr-scene')?.dataset.phase==='3',
      null,{timeout:10000});
    assert.equal((await page.locator('#vr-total').textContent()).trim(),'$36,301.00');
    assert.deepEqual(await page.locator('.vr-bar-group strong').allTextContents(),expected);
    assert.match(await page.locator('#vr-chart').getAttribute('aria-label'),
      /2026-09 \$11,500\.50/);
    assert.match(await page.locator('#vr-status').textContent(),/verified in this browser/);
    assert.equal(await page.locator('#rows tr').count(),3);
    const proof=await page.locator('#proof').textContent();
    assert.match(proof,/Source: public synthetic CSV \(6 rows\)/);
    assert.match(proof,/Arithmetic second pass: PASSED/);
    assert.match(proof,/AI\/registered workers: NOT USED/);
    assert.match(proof,/SHA-256 source: [a-f0-9]{64}/);
    assert.match(proof,/SHA-256 output: [a-f0-9]{64}/);

    const before=await page.evaluate(()=>({
      view:window.innerWidth,
      scroll:document.documentElement.scrollWidth,
      stage:Math.round(document.querySelector('#visual-replay').getBoundingClientRect().width)
    }));
    assert.ok(before.scroll<=before.view+1,
      'Unexpected horizontal overflow at '+name+': '+JSON.stringify(before));
    assert.ok(before.stage>0 && before.stage<=before.view,'proof stage clipped on '+name);
    assert.deepEqual(errors,[],'Browser JS errors');
    assert.deepEqual(external,[],'Unexpected external requests');

    await page.locator('#vr-play').click();
    if(reducedMotion){
      assert.equal(await page.locator('#vr-scene').getAttribute('data-phase'),'3');
    }else{
      assert.equal(await page.locator('#vr-scene').getAttribute('data-phase'),'0');
      await page.waitForFunction(()=>document.querySelector('#vr-scene')?.dataset.phase==='3',
        null,{timeout:10000});
    }
    const stageShot=path.join(artifacts,prefix+'-proof.png');
    const fullShot=path.join(artifacts,prefix+'-page.png');
    await stage.screenshot({path:stageShot,animations:'disabled'});
    await page.screenshot({path:fullShot,fullPage:true,animations:'disabled'});
    const receipt={browser:name,viewport,reducedMotion,truth:'completed_local_calculation_replay',
      synthetic:true,external_requests:external.length,browser_errors:errors.length,
      horizontal_overflow:false,
      stage_png:{sha256:sha(stageShot),bytes:fs.statSync(stageShot).size},
      full_png:{sha256:sha(fullShot),bytes:fs.statSync(fullShot).size}};
    fs.writeFileSync(path.join(artifacts,prefix+'-receipt.json'),
      JSON.stringify(receipt,null,2)+'\n');
    console.log(JSON.stringify(receipt));
  }finally{
    await context.close();
    if(page.video())await page.video().saveAs(path.join(artifacts,prefix+'-walkthrough.webm'));
    await browser.close();
  }
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  try{
    await scenario(chromium,'chromium-desktop',{width:1280,height:800},base);
    await scenario(webkit,'webkit-mobile',{width:390,height:844},base);
    await scenario(chromium,'chromium-reduced',{width:390,height:844},base,true);
  }finally{await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
