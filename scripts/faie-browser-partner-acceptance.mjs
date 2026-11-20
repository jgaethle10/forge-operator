#!/usr/bin/env node
// Real-browser partner UX acceptance. Never sends email, writes customer data, or uses private FAIE APIs.
import { accessSync, constants } from 'node:fs';
import { chromium } from 'playwright-core';

const origin='https://fabric.systemiacommandcenters.com';
const options=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'];
const binary=options.find((path)=>{try{accessSync(path,constants.X_OK);return true}catch{return false}});
if(!binary) throw new Error('chrome_not_installed_on_qa_runner');
const receipt={schema:'evercraft.faie.browser-partner-acceptance.v1',observed_at:new Date().toISOString(),origin,checks:{},passed:false};
let browser;
const mark=(name,condition)=>{if(!condition)throw new Error(name);receipt.checks[name]=true};
try{
  browser=await chromium.launch({headless:true,executablePath:binary,args:['--no-sandbox','--disable-dev-shm-usage']});
  const ctx=await browser.newContext({acceptDownloads:true,viewport:{width:1366,height:900},deviceScaleFactor:1});
  const page=await ctx.newPage();
  const errors=[];
  page.on('pageerror',(err)=>errors.push(String(err)));
  await page.goto(origin+'/faie/agnormal/',{waitUntil:'domcontentloaded',timeout:20000});
  mark('agnormal_primary_button',await page.locator('#heroTryExample').isVisible());
  mark('partner_scope_displayed',await page.locator('.hero-partner-intro').isVisible());
  mark('advanced_fields_collapsed',!(await page.locator('#advancedScope').evaluate((el)=>el.open)));
  await page.locator('#runtimePulse[data-health="ok"]').waitFor({timeout:17000});
  mark('real_health_indicator',true);
  await page.locator('#heroTryExample').click();
  await page.locator('#result .plain-results').waitFor({timeout:30000});
  mark('one_click_real_investigation',true);
  mark('source_links_rendered',(await page.locator('#result .source-links a[href^="http"]').count())>0);
  mark('human_boundary_visible',(await page.locator('#result').innerText()).includes('Human review required'));
  mark('next_proof_rendered',(await page.locator('#result .acquisition').count())>0);
  const download=page.waitForEvent('download',{timeout:10000});
  await page.locator('#downloadPacket').click();
  const downloadEvent=await download;
  mark('packet_download_handoff',downloadEvent.suggestedFilename().endsWith('.json'));
  await page.locator('#compareExample').click();
  await page.locator('#comparisonResult .grid2').waitFor({timeout:30000});
  const compared=await page.locator('#comparisonResult').innerText();
  mark('live_example_comparison',compared.includes('Yakima Valley')&&compared.includes('Tri-Cities'));
  mark('no_automated_site_verdict',compared.includes('not a site-suitability')||compared.includes('not a site'));
  mark('no_browser_errors',errors.length===0);

  const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const m=await mobile.newPage();
  await m.goto(origin+'/faie/',{waitUntil:'domcontentloaded',timeout:20000});
  mark('mobile_primary_button',await m.locator('#heroTryExample').isVisible());
  mark('public_partner_controls_hidden',!(await m.locator('#runAgnormalNow').isVisible()));
  mark('mobile_no_horizontal_overflow',await m.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+4));
  await mobile.close();
  await ctx.close();
  receipt.passed=true;
  receipt.state='BROWSER_UX_ACCEPTED';
}catch(error){
  receipt.error=error instanceof Error?error.message:String(error);
  receipt.state='BROWSER_UX_HOLD';
  process.exitCode=1;
}finally{
  if(browser)await browser.close();
  process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
}
