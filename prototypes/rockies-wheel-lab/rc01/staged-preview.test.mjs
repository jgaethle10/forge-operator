import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {stageWheelLabMarkup,FINDMYPART_PUBLIC_URL} from './findmypart-referral-stage.mjs';

// Staging source parity. This checks a *draft branch* path, not a deployed URL.
const prototype = fileURLToPath(new URL('.', import.meta.url));
const publicDir = fileURLToPath(new URL('../../../public/wheel-lab-preview/', import.meta.url));
const read = (base, name) => readFileSync(path.join(base, name), 'utf8');

const noindex = '<meta name="robots" content="noindex,nofollow,noarchive">';
function stagedShopperOrDesk(file) {
  return stageWheelLabMarkup(file, read(prototype, file));
}
function stagedLauncher() {
  return read(prototype, 'review.html')
    .replaceAll('./index.html','./shopper.html')
    .replace('PRIVATE REVIEW PACKAGE · NOT LIVE','RESEARCH PREVIEW · NO SALES OR ORDERS');
}

test('staged public-route files are exact, reviewable transforms of the source', () => {
  assert.equal(read(publicDir, 'index.html'), stagedLauncher());
  assert.equal(read(publicDir, 'shopper.html'), stagedShopperOrDesk('index.html'));
  assert.equal(read(publicDir, 'merchant-desk.html'), stagedShopperOrDesk('merchant-desk.html'));
});

test('all three staged pages are explicitly non-indexable and standalone', () => {
  for (const file of ['index.html','shopper.html','merchant-desk.html']) {
    const html = read(publicDir, file);
    assert.ok(html.includes(noindex), 'Missing noindex in ' + file);
    assert.match(html,/<!doctype html>/i);
    assert.doesNotMatch(html,/<script\b[^>]*\bsrc=/i);
    assert.doesNotMatch(html,/<link\b[^>]*href=["']https?:/i);
    assert.doesNotMatch(html,/<form\b/i);
    const inline = html.split('<script>')[1]?.split('</script>')[0];
    assert.ok(inline, file + ' must use a locally reviewable inline script');
    assert.doesNotThrow(() => new Script(inline), 'Script parse: ' + file);
    assert.doesNotMatch(inline,/\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon)\s*\(/);
  }
});

test('the staged launcher connects only the staged same-directory pages', () => {
  const html = read(publicDir,'index.html');
  assert.match(html,/src="\.\/shopper\.html"/);
  assert.match(html,/href="\.\/shopper\.html"/);
  assert.match(html,/'\.\/merchant-desk\.html'/);
  assert.doesNotMatch(html,/'\.\/index\.html'/);
  assert.match(html,/RESEARCH PREVIEW · NO SALES OR ORDERS/);
  assert.match(html,/NOT A LIVE MERCHANT SERVICE/);
});

test('shopper-to-desk packets remain unverified even on the staged route', () => {
  const shopper = read(publicDir,'shopper.html');
  const desk = read(publicDir,'merchant-desk.html');
  for (const signal of [
    'illustrative_only:true', 'fitment_verified:false',
    'inventory_verified:false', 'price_verified:false',
    'shop_contacted:false'
  ]) assert.ok(shopper.includes(signal),signal);
  for (const signal of [
    'INTERNAL_DRAFT_UNVERIFIED','customer_consent_verified:false',
    'checkout_created:false','payment_verified:false',
    'merchant_sku_matched_to_concept:false'
  ]) assert.ok(desk.includes(signal),signal);
});

test('staging is not a live launch, checkout or contact route', () => {
  const launcher = read(publicDir,'index.html');
  assert.ok(launcher.includes('no published buyer URL'));
  assert.ok(launcher.includes('Systemia admission'));
  assert.ok(!launcher.includes('customer-paid'));
  assert.doesNotMatch(launcher,/https:\/\/[^"']+\/checkout/);
});

test('RC09 public-preview referral is exact, user-clicked, private and not in offline prototypes',()=>{
  assert.equal(FINDMYPART_PUBLIC_URL,'https://fabric.systemiacommandcenters.com/findmypart/');
  assert.equal(new URL(FINDMYPART_PUBLIC_URL).search,'');
  assert.equal(new URL(FINDMYPART_PUBLIC_URL).hash,'');
  for(const file of ['shopper.html','merchant-desk.html']){
    const staged=read(publicDir,file);
    const source=read(prototype,file==='shopper.html'?'index.html':'merchant-desk.html');
    assert.equal(staged.split(FINDMYPART_PUBLIC_URL).length,2);
    assert.match(staged, /class="findmypart-referral" href="https:\/\/fabric\.systemiacommandcenters\.com\/findmypart\/" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer"/);
    assert.doesNotMatch(source, /class="findmypart-referral"/);
    assert.doesNotMatch(staged, /findmypart\/\?[^\s"'<>]*/);
  }
  assert.match(read(publicDir,'shopper.html'),/No Wheel Lab choices, notes, files or customer information are transferred/);
  assert.match(read(publicDir,'merchant-desk.html'),/No quote, customer details or concept file is transmitted/);
});

test('RC09 FindMyPart promotion refuses an unknown source or source shape',()=>{
  assert.throws(()=>stageWheelLabMarkup('unknown.html','<head></head>'),/Unsupported/);
  assert.throws(()=>stageWheelLabMarkup('index.html','<body></body>'),/stage anchor mismatch/);
});
