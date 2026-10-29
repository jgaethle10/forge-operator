// Actual browser acceptance, separate from the existing pure Node/DOM tests.
// Run only against first-party local fixtures. Never submit customer data.
const {chromium,webkit}=require('playwright');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

const root=path.resolve(__dirname,'../public');
const sample=fs.readFileSync(path.join(root,'work-saban/example-sales.csv'));
const invalid=Buffer.from('month,revenue\n2026-07,not-money\n2026-08,250.00\n');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.csv':'text/csv; charset=utf-8','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
  const route=new URL(req.url,'http://127.0.0.1');
  const name=route.pathname.endsWith('/')?route.pathname+'index.html':route.pathname;
  const file=path.resolve(root,'.'+decodeURIComponent(name));
  if(!file.startsWith(root+path.sep)) {res.writeHead(403).end();return;}
  try{
    const bytes=fs.readFileSync(file);
    res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream',
      'cache-control':'no-store','x-content-type-options':'nosniff'});
    res.end(bytes);
  }catch{res.writeHead(404).end();}
});
const listen=()=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const close=()=>new Promise(resolve=>server.close(resolve));

async function checkBrowser(browserType,mode,base){
  const browser=await browserType.launch({headless:true});
  const context=await browser.newContext({
    ...(mode==='mobile'?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}
                     :{viewport:{width:1280,height:800}}),
    acceptDownloads:true
  });
  const page=await context.newPage();
  const errors=[],external=[];
  page.on('pageerror',err=>errors.push(err.message));
  page.on('request',request=>{
    if(!request.url().startsWith(base)&&!request.url().startsWith('blob:'))
      external.push(request.url());
  });
  try {
    // New visitor should reach the actual productive workflow before a planning-only demo.
    await page.goto(base+'/work-saban/',{waitUntil:'load'});
    const primary=page.locator('section.hero .actions .btn');
    assert.equal(await primary.getAttribute('href'),'./report/');
    await primary.click();
    await page.waitForURL('**/work-saban/report/');
    assert.match(await page.title(),/My sales report/);
    assert.equal(await page.locator('#run').isDisabled(),true);

    // File selection alone must not authorize a read.
    await page.locator('#csv-file').setInputFiles({
      name:'customer-sales.csv',mimeType:'text/csv',buffer:sample
    });
    assert.equal(await page.locator('#run').isDisabled(),true);
    assert.equal(await page.locator('#result').isHidden(),true);
    await page.locator('#consent').check();
    assert.equal(await page.locator('#run').isEnabled(),true);
    await page.getByRole('button',{name:'Make my report'}).click();
    await page.locator('#result').waitFor({state:'visible'});
    assert.equal((await page.locator('#total').textContent()).trim(),'$36,301.00');
    assert.match(await page.locator('#change').textContent(),/down \$799\.50/);
    assert.equal(await page.locator('#monthly tr').count(),3);
    assert.match(await page.locator('#proof').textContent(),/Customer file transmitted: NO/);
    assert.equal(await page.locator('#run').isDisabled(),true,'consent resets after processing');

    // Real browser download, not a mock of the button handler.
    const downloadPromise=page.waitForEvent('download');
    await page.getByRole('button',{name:'Save report'}).click();
    const download=await downloadPromise;
    assert.equal(download.suggestedFilename(),'work-saban-monthly-sales-report.md');
    const stream=await download.createReadStream();
    const chunks=[];for await(const chunk of stream)chunks.push(chunk);
    const report=Buffer.concat(chunks).toString('utf8');
    assert.match(report,/Total sales:\*\* \$36,301\.00/);
    assert.match(report,/Arithmetic check: PASSED/);

    // Clipboard permission differs across browsers. Verify either success or explicit fallback.
    await page.getByRole('button',{name:'Copy report'}).click();
    const status=(await page.locator('#status').textContent()).trim();
    assert.match(status,/Report copied|Clipboard access blocked/);
    if(status.includes('blocked')){
      assert.equal(await page.locator('#fallback').isVisible(),true);
      assert.match(await page.locator('#copy-text').inputValue(),/Monthly sales report/);
    }

    // Malformed input must never create a successful result.
    await page.locator('#csv-file').setInputFiles({
      name:'invalid-sales.csv',mimeType:'text/csv',buffer:invalid
    });
    await page.locator('#consent').check();
    await page.getByRole('button',{name:'Make my report'}).click();
    assert.equal(await page.locator('#result').isHidden(),true);
    assert.match(await page.locator('#failure').textContent(),/Invalid revenue/);

    assert.deepEqual(errors,[],'browser JS errors');
    assert.deepEqual(external,[],'unexpected third-party browser network requests');
    console.log(JSON.stringify({browser:browserType.name(),mode,status:'passed',
      report_total:'$36,301.00',download_bytes:Buffer.byteLength(report),
      bad_csv:'rejected',external_requests:0}));
  }finally{await context.close();await browser.close();}
}
(async()=>{
  await listen();
  const base='http://127.0.0.1:'+server.address().port;
  try{
    await checkBrowser(chromium,'desktop',base);
    await checkBrowser(webkit,'mobile',base);
  }finally{await close();}
})().catch(err=>{console.error(err.stack||err.message);process.exitCode=1;});
