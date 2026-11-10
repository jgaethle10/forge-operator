import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const extensionPath = path.resolve(import.meta.dirname, '../extension');
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-rescue-proof-'));
let context;
try {
  context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    args: [
      '--disable-extensions-except=' + extensionPath,
      '--load-extension=' + extensionPath,
      '--no-first-run',
    ],
  });
  // The worker is deliberately inert. Its URL provides only the ephemeral
  // unpacked extension ID for the disposable test browser.
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 18000 });
  assert.match(worker.url(), /^chrome-extension:\/\/[a-p]{32}\/background\.js$/);
  const extensionId = new URL(worker.url()).hostname;

  // Never contact real campaign servers in this browser test.
  const requests = [];
  await context.route(/https?:\/\/(?:www\.)?voteroman\.com\/.*/, async route => {
    requests.push({ host: new URL(route.request().url()).hostname, resource: route.request().resourceType() });
    await route.fulfill({ status: 402, contentType: 'text/html', body: '<h1>APP UNAVAILABLE</h1>' });
  });
  await context.route('https://donate.voteroman.com/**', async route => {
    requests.push({ host:'donate.voteroman.com', resource:route.request().resourceType() });
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Existing donation site mock (no payment processing)</h1>' });
  });
  await context.route('https://fabric.systemiacommandcenters.com/**', async route => {
    requests.push({ host:'fabric.systemiacommandcenters.com', resource:route.request().resourceType() });
    await route.fulfill({ status: 200, contentType: 'text/html',
      body:'<!doctype html><title>Independent information mirror mock</title><p>Roman Kilinkaridis</p><a href="https://donate.voteroman.com/">Donation link</a>' });
  });

  const page = await context.newPage();
  const settings = await context.newPage();
  await settings.goto('chrome-extension://' + extensionId + '/options.html');
  await settings.locator('#status').filter({ hasText: 'Disabled' }).waitFor();
  assert.equal(await settings.locator('#enable').isDisabled(), true);

  const first = await page.goto('https://voteroman.com/', { waitUntil: 'domcontentloaded' });
  assert.equal(first.status(), 402, 'installing the browser extension must not activate rescue');
  assert.equal(new URL(page.url()).hostname, 'voteroman.com');

  await settings.locator('#consent').check();
  assert.equal(await settings.locator('#enable').isEnabled(), true);
  await settings.locator('#enable').click();
  await settings.locator('#status').filter({ hasText: 'Enabled' }).waitFor();
  await page.goto('https://voteroman.com/', { waitUntil: 'domcontentloaded' });
  assert.equal(page.url(), 'https://fabric.systemiacommandcenters.com/campaigns/roman/');
  assert.match(await page.title(), /Independent information mirror mock/);

  await page.goto('https://www.voteroman.com/', { waitUntil: 'domcontentloaded' });
  assert.equal(page.url(), 'https://fabric.systemiacommandcenters.com/campaigns/roman/');

  await page.goto('https://donate.voteroman.com/', { waitUntil: 'domcontentloaded' });
  assert.equal(new URL(page.url()).hostname, 'donate.voteroman.com');
  assert.match(await page.locator('body').innerText(), /donation site mock/);

  await settings.locator('#disable').click();
  await settings.locator('#status').filter({ hasText: 'Disabled' }).waitFor();
  const final = await page.goto('https://voteroman.com/', { waitUntil: 'domcontentloaded' });
  assert.equal(final.status(), 402);
  assert.equal(new URL(page.url()).hostname, 'voteroman.com');

  const leak=requests.filter(x=>x.host==='donate.voteroman.com');
  assert.equal(leak.length,1,'donation subdomain must not be rewritten');
  assert.equal(requests.filter(x=>x.host==='fabric.systemiacommandcenters.com').length,2);
  console.log(JSON.stringify({
    schema:'evercraft.rescue-resolver.browser-proof.v1',
    chromium:'real_browser_disposable',
    extension_state:'off_by_default_then_opted_in_then_disabled',
    apex_rescue_redirect:true,
    www_rescue_redirect:true,
    donation_route_preserved:true,
    external_sites_contacted:false,
    registrar_dns_changes:false,
    campaign_owner_endorsement_inferred:false,
    global_original_domain_fixed:false,
  },null,2));
} finally {
  if (context) await context.close();
  fs.rmSync(userDataDir, { recursive:true, force:true });
}
