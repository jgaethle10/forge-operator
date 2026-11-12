import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildAssetScopeInquiry} from '../public/mesh/checkout-ready/asset-diagnosis/scope-intake.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const assetPage=read('public/mesh/checkout-ready/asset-diagnosis/index.html');
const intakeSource=read('public/mesh/checkout-ready/asset-diagnosis/scope-intake.mjs');
const freeHub=read('public/try/index.html');
const products=JSON.parse(read('public/mesh/checkout-ready/products.json'));
const verified=JSON.parse(read('public/mesh/checkout-ready/verified-links.json'));

const valid={
  asset:'https://example.org/store',
  issue:'Visitors leave without contacting the business.',
  decision:'Do we need to fix the page or rebuild it?',
  timing:'This month',
  source:'evercraft_try',
  authorized:'yes'
};

test('scope request is plain text and generates a user-initiated mailto for the exact $149 SKU',()=>{
  const x=buildAssetScopeInquiry(valid);
  const service=verified.links.find(x=>x.key==='asset-diagnosis');
  assert.equal(service.amount_cents,14900);
  assert.equal(x.subject,'Asset Diagnosis ($149) | Scope confirmation request');
  assert.match(x.mailto,/^mailto:jessegaethle10@gmail\.com\?subject=/);
  assert.equal(decodeURIComponent(x.mailto.split('&body=')[1]),x.body);
  assert.match(x.body,/This is a scope request, not an order or authorization to charge me/);
  assert.match(x.body,/delivery availability/);
  assert.match(x.body,/Evercraft free tools \(visitor-provided link context\)/);
  assert.ok(x.mailto.length<2200,'mailto kept within practical client length');
});

test('incomplete or blank buyer problems cannot generate vague requests',()=>{
  for(const v of [{...valid,asset:'  '},{...valid,issue:'too short'},{...valid,decision:'nothing'},{...valid,authorized:null}]){
    assert.throws(()=>buildAssetScopeInquiry(v),/asset|working|decision|authorized/i);
  }
});

test('untrusted line breaks and long text remain confined to plain message fields',()=>{
  const x=buildAssetScopeInquiry({
    asset:'Public site\r\nBCC:someone@example.net',
    issue:'The public page is confusing for customers\nSUBJECT:fake',
    decision:'Understand the root problem before a rebuild\r\n',
    timing:'x'.repeat(500),
    source:'untrusted_tag',
    authorized:true
  });
  assert.match(x.body,/Asset or public URL: Public site BCC:someone@example.net/);
  assert.doesNotMatch(x.body,/\r/);
  assert.ok(!x.body.includes('x'.repeat(101)));
  assert.match(x.body,/Where I found this: Asset Diagnosis page/);
  assert.ok(x.mailto.startsWith('mailto:jessegaethle10@gmail.com?subject='));
});

test('free-to-paid link preserves one exact product and does not silently charge',()=>{
  const target=products.products.find(p=>p.sku_key==='asset-diagnosis');
  assert.equal(target.price_usd,149);
  assert.ok(freeHub.includes('../mesh/checkout-ready/asset-diagnosis/?utm_source=evercraft_try'));
  assert.ok(freeHub.includes('before payment'));
  assert.ok(assetPage.includes('id="asset-scope-form"'));
  assert.ok(assetPage.includes('id="asset-scope-output" hidden'));
  assert.ok(assetPage.includes('id="intake-authorized" name="authorized"'));
  assert.ok(assetPage.includes('I own this asset or am authorized to discuss it'));

  assert.ok(assetPage.includes('scope-intake.mjs'));
  assert.ok(assetPage.includes('Nothing is uploaded, saved or sent'));
  assert.ok(assetPage.includes('Scope and delivery availability') || assetPage.includes('scope and delivery availability'));
  assert.ok(assetPage.includes(target.checkout_url));
  assert.deepEqual([...new Set(assetPage.match(/https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+/g)??[])],[target.checkout_url]);
  assert.ok(!assetPage.includes('fetch(') && !assetPage.includes('localStorage'));
});

test('scope intake module never sends, stores, or initiates a charge on behalf of a visitor',()=>{
  for(const forbidden of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'localStorage', 'sessionStorage', 'PaymentIntent', 'checkout.sessions']) assert.ok(!intakeSource.includes(forbidden),forbidden);
  assert.match(intakeSource,/mailto:/);
  assert.match(intakeSource,/authorized !== 'yes'/);
  assert.match(assetPage,/Opening an email draft does not send it/);
  assert.match(assetPage,/No payment, order or service delivery is created/);
});
