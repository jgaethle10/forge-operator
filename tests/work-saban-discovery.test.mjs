import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = new URL('../public/', import.meta.url);
const body = fs.readFileSync(new URL('chum/products/work-saban/ai-discovery.json',root), 'utf8');
const cfg = JSON.parse(body);
const txt = fs.readFileSync(new URL('chum/products/work-saban/llms.txt',root), 'utf8');
const site = fs.readFileSync(new URL('chum/index.html',root), 'utf8');
const llms = fs.readFileSync(new URL('llms.txt',root), 'utf8');
test('Work Saban is discoverable but cannot accidentally route to a paid product',()=>{
  assert.equal(cfg.product_key,'work-saban');
  assert.equal(cfg.commercial.status,'discovery_only');
  assert.equal(cfg.commercial.price,null);
  assert.equal(cfg.machine_commerce_handoff,null);
  assert.equal(cfg.commercial.payment_state,'no_checkout_no_paid_receipt');
  assert.equal(cfg.human_confirmation_required,true);
  assert.ok(cfg.canonical_url.startsWith('https://jgaethle10.github.io/forge-operator/work-saban/'));
  assert.ok(cfg.intents.length>=4);
});
test('public entrypoints surface Work Saban without a fabricated sales promise',()=>{
  assert.match(site, /\/chum\/products\/work-saban\//);
  assert.match(llms, /## Work Saban \/ founding-pilot discovery only/);
  assert.match(txt, /no approved public price/i);
  assert.match(txt, /not live agent execution/i);
  assert.doesNotMatch(txt, /buy\.stripe\.com/i);
});
