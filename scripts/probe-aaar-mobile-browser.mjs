// AAAR public-launch smoke test. Browser emulation never substitutes for real iPhone QA.
// Run from repo root: node scripts/probe-aaar-mobile-browser.mjs <owned URL>
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

function checkedTarget(raw) {
  let u;
  try {u = new URL(raw);} catch {throw new Error('aaar_target_url_required');}
  if (u.username || u.password || u.search || u.hash || u.pathname !== '/worlds/flight/') throw new Error('aaar_exact_flight_path_required');
  const local = u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname);
  const owned = u.protocol === 'https:' && u.hostname === 'worlds.systemiacommandcenters.com';
  if (!local && !owned) throw new Error('aaar_owned_or_loopback_origin_required');
  return {url: u.href, target: local ? 'loopback' : 'owned-https'};
}

const target = checkedTarget(process.argv[2] || '');
const receipt = {
  schema: 'evercraft.aaar.mobile-browser-release-probe.v1',
  target: target.target, url: target.url,
  checked_at_utc: new Date().toISOString(),
  browser: 'Playwright Chromium, mobile emulation, NOT actual Safari',
  real_iphone_safari_verified: false,
  worlds_authoritative_flight_integration_verified: false,
  checks: [], passed: false
};
let browser;
try {
  browser = await chromium.launch({headless:true});
  const context = await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const page = await context.newPage(), errors=[];
  page.on('pageerror',err=>errors.push(String(err.message).slice(0,350)));
  const response=await page.goto(target.url,{waitUntil:'domcontentloaded',timeout:20000});
  assert.equal(response?.status(),200,'public flight URL missing');
  assert.match(String(response.headers()['content-type']||''),/text\/html/i,'flight route must be served as HTML');
  receipt.checks.push('owned_or_loopback_http_html');
  await page.locator('#beginFlight').waitFor({state:'visible',timeout:10000});
  await page.waitForFunction(()=>!document.querySelector('#scriptBlocked'),null,{timeout:10000});
  receipt.checks.push('inline_javascript_executed');
  await page.locator('#designFromStart').click();
  await page.locator('#foundryOverlay.open').waitFor({state:'visible',timeout:8000});
  assert.ok((await page.locator('#fStats').innerText()).length>10,'foundry calculations not initialized');
  await page.locator('#foundryClose').click();
  receipt.checks.push('foundry_button_responds');
  await page.locator('#beginFlight').click();
  await page.waitForFunction(()=>document.querySelector('#startScreen')?.style.display==='none',null,{timeout:8000});
  receipt.checks.push('flight_start_button_responds');
  const controls=page.locator('[data-touch]');
  assert.ok(await controls.count()>=4,'touch controls not present');
  await page.locator('#pauseToggle').click();
  assert.equal(await page.locator('#pauseToggle').getAttribute('data-paused'),'true','pause button did not update state');
  await page.locator('#pauseToggle').click();
  receipt.checks.push('touch_controls_present_and_pause_button_works');
  const size=await page.evaluate(()=>({content:document.documentElement.scrollWidth,view:innerWidth}));
  assert.ok(size.content<=size.view+3,'mobile sideways overflow');
  receipt.checks.push('phone_width_no_overflow');
  assert.equal(errors.length,0,'JavaScript errors: '+errors.join(' | '));
  receipt.passed=true;
  receipt.production_release_authorized=false;
  receipt.reason='Physical iPhone Safari test and independently verified owned HTTPS deployment receipt still required.';
} catch(error) {
  receipt.reason=String(error.message||error).slice(0,500);
  process.exitCode=1;
} finally {if(browser) await browser.close();}
console.log(JSON.stringify(receipt,null,2));
