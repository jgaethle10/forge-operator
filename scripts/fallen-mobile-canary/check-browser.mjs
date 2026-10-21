import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const playwright = require(process.env.FALLEN_QA_PLAYWRIGHT_MODULE || 'playwright');
const manifest = JSON.parse(await readFile(new URL('../../systemia/media-studio/hosted-mobile/rc102.staging.json', import.meta.url), 'utf8'));
const results = [];
for (const browserName of ['chromium', 'webkit']) {
  const errors = [];
  const checks = [];
  const check = (name, value) => {
    checks.push({ name, passed: Boolean(value) });
    assert.ok(value, browserName + ': ' + name);
  };
  let browser;
  try {
    browser = await playwright[browserName].launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2
    });
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(manifest.site_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    check('live HTTP 200', response?.status() === 200);
    await page.waitForFunction(() => document.body.classList.contains('fallen-ready'), null, { timeout: 20000 });
    check('JavaScript engine initialized', await page.evaluate(() => document.body.classList.contains('fallen-ready')));
    check('blocked preview fallback hidden', !(await page.getByText('JavaScript has not started in this viewer.').isVisible()));
    const canvas = await page.locator('canvas').first().evaluate(c => {
      const pixels = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
      let nonblack = 0;
      for (let i = 0; i < pixels.length; i += 320) {
        if (pixels[i] > 12 || pixels[i+1] > 12 || pixels[i+2] > 12) nonblack++;
      }
      return nonblack;
    });
    check('actual nonblack canvas content', canvas > 100);
    check('Watch mode initially active', await page.locator('#mobilePreview').getAttribute('aria-pressed') === 'true');
    check('Watch mode hides inspector', await page.locator('.rail').first().evaluate(el => getComputedStyle(el).display === 'none'));
    check('mobile preview is large', await page.locator('#stageFrame').evaluate(el => el.getBoundingClientRect().width > 320));
    check('three authored beat controls', await page.locator('#mobileBeats button').count() === 3);
    await page.locator('#mobilePlay').click();
    await page.waitForTimeout(700);
    check('mobile play changes to pause', (await page.locator('#mobilePlay').innerText()).includes('Pause'));
    await page.locator('#mobilePlay').click();
    check('pause returns play label', (await page.locator('#mobilePlay').innerText()).includes('Play'));
    await page.locator('#mobileEdit').click();
    check('Edit reveals inspector', await page.locator('.rail').first().evaluate(el => getComputedStyle(el).display !== 'none'));
    await page.locator('#mobileBeats button').nth(1).click();
    check('story beat advances time', await page.evaluate(() => window.__fallenStudio.getState().time > 3));
    await page.locator('#mobileScene').selectOption('cell');
    await page.waitForTimeout(1000);
    check('scene change commits to engine state', await page.evaluate(() => window.__fallenStudio.getState().scene === 'cell'));
    await page.locator('#mobilePreview').click();
    check('Watch mode restored', await page.locator('.rail').first().evaluate(el => getComputedStyle(el).display === 'none'));
    check('no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2));
    check('no uncaught JavaScript errors', errors.length === 0);
    results.push({ browser: browserName, passed: checks.length, checks, errors });
  } finally {
    await browser?.close();
  }
}
console.log(JSON.stringify({
  schema: 'evercraft.fallen.browser-canary.v1',
  status: 'passed',
  stage: manifest.status,
  results,
  physical_iphone_verified: false
}, null, 2));
