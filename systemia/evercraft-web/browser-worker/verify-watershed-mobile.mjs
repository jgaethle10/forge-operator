#!/usr/bin/env node
// Evercraft-owned browser QA: source-hashed Watershed preview, no customer data.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';

const url='http://127.0.0.1:8765/watershed/';
const root=process.env.EVERCRAFT_WATERSHED_SCREENSHOTS||'/tmp/evercraft-watershed-visual';
const widths=[320,375,390,430,768,1024,1440];
mkdirSync(root,{recursive:true});
const receipt={
  schema:'evercraft.watershed.mobile-browser-qa.v1',
  checked_at:new Date().toISOString(),
  public_release_approved:false,
  customer_data_sent:false,
  payment_tested:false,
  actual_browser:'Playwright Chromium',
  widths,rows:[],status:'UNVERIFIED'
};
const browser=await chromium.launch({headless:true});
try {
  for(const width of widths){
    const context=await browser.newContext({
      viewport:{width,height:844},deviceScaleFactor:width<=430?2:1,
      isMobile:width<=430,hasTouch:width<=430
    });
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const response=await page.goto(url,{waitUntil:'networkidle',timeout:30000});
    assert.equal(response?.status(),200,'HTML must be served via local public path');
    await page.locator('#dashboard:visible').waitFor();
    assert.equal(await page.locator('.basin').count(),3,'three NRCS basins');
    assert.equal(await page.locator('.basin .caution').count(),3,'all early-season warnings');
    assert.equal(await page.locator('#snow-list .data-tile').count(),6,'six SNOTEL sites');
    assert.equal(await page.locator('#river-list .data-tile').count(),3,'three USGS gauges');
    assert.equal(await page.locator('#reservoir-list .data-tile').count(),5,'five USBR sites');
    assert.match(await page.locator('#source-age').textContent(),/Archived/);
    assert.match(await page.locator('#reservoir-total').textContent(),/147,099.23/);
    assert.match(await page.locator('#basin-note').textContent(),/NRCS.*warning|NRCS cautions/i);
    assert.equal(await page.locator('#request a[href="../research/#start"]').count(),1);
    assert.ok((await page.locator('#evidence .ledger article').count())>=5);
    const layout=await page.evaluate(()=>({
      width:document.documentElement.scrollWidth,
      viewport:innerWidth,
      date:document.querySelector('#source-age')?.textContent,
      checkout:!!document.querySelector('form[action*="stripe"]'),
      authored:document.querySelector('meta[name="robots"]')?.content
    }));
    assert.ok(layout.width<=layout.viewport+1,'horizontal overflow at '+width+': '+JSON.stringify(layout));
    assert.equal(layout.checkout,false);
    assert.equal(layout.authored,'noindex,nofollow');
    assert.deepEqual(errors,[],'browser errors at '+width);
    if([320,390,1440].includes(width))
      await page.screenshot({path:path.join(root,'watershed-'+width+'.png'),fullPage:true});
    receipt.rows.push({width,state:'PASS',overflow:false,cards:14,publication_approved:false});
    await context.close();
  }

  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  const fixture=JSON.parse(readFileSync(new URL('../../../public/watershed/data/yakima-2026-11-09.json',import.meta.url),'utf8'));
  fixture.reservoirs.derived_provisional_sum_af+=400;
  await page.route('**/watershed/data/yakima-2026-11-09.json',route=>
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fixture)})
  );
  await page.goto(url,{waitUntil:'networkidle'});
  await page.locator('#load-error:visible').waitFor();
  assert.equal(await page.locator('#dashboard').isVisible(),false);
  assert.equal(await page.locator('.basin').count(),0);
  receipt.tampered_receipt='REJECTED_BEFORE_DISPLAY';
  await context.close();
  receipt.status='PASS';
}catch(error){
  receipt.status='FAIL';
  receipt.error=String(error?.stack||error).slice(0,1400);
  process.exitCode=1;
}finally{
  await browser.close();
  writeFileSync(path.join(root,'mobile-qa.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(receipt,null,2));
}
