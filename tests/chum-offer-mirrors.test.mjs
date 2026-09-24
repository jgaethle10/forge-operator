import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const machine=JSON.parse(fs.readFileSync('public/.well-known/evercraft-machine-catalog.json','utf8'));
const mirrors=JSON.parse(fs.readFileSync('public/chum/offers/index.json','utf8'));

test('every public machine surface has a generated offer/service mirror',()=>{
  const expected=(machine.offers||[]).filter(x=>x?.public_id);
  assert.equal(mirrors.offers.length, expected.length);
  const got=new Set(mirrors.offers.map(x=>x.public_id));
  for(const offer of expected) assert.equal(got.has(offer.public_id),true,offer.public_id);
});

test('every mirror has page, llms, discovery and schema files',()=>{
  for(const offer of mirrors.offers){
    const slug=offer.page_url.split('/').filter(Boolean).pop();
    const base='public/chum/offers/'+slug;
    for(const file of ['index.html','llms.txt','ai-discovery.json','schema.jsonld']){
      assert.equal(fs.existsSync(base+'/'+file),true,base+'/'+file);
    }
  }
});

test('ROASTED mirror preserves the current 99c payment-ready offer',()=>{
  const row=mirrors.offers.find(x=>x.public_id==='roasted-text-pressure-test-machine-v1');
  assert.ok(row);
  assert.equal(row.commercial_state,'sell_now');
  assert.equal(row.machine_state,'payment_ready');
  const discovery=JSON.parse(fs.readFileSync('public/chum/offers/roasted-text-pressure-test-machine-v1/ai-discovery.json','utf8'));
  assert.match(String(discovery.pricing||''),/0\.99/);
  assert.equal(discovery.payment_ready,true);
  assert.equal(discovery.boundaries.checkout_is_payment_proof,false);
});

test('quote-ready and verification-required state is never upgraded by mirror generation',()=>{
  for(const live of machine.offers||[]){
    const slug=String(live.public_id||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,120);
    const discovery=JSON.parse(fs.readFileSync('public/chum/offers/'+slug+'/ai-discovery.json','utf8'));
    assert.equal(discovery.commercial_state,live.commercial_state);
    assert.equal(discovery.machine_state,live.machine_state);
  }
});
