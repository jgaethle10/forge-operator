import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const machine=JSON.parse(fs.readFileSync('public/.well-known/evercraft-machine-catalog.json','utf8'));
const capabilities=JSON.parse(fs.readFileSync('public/chum/capabilities.json','utf8'));
const sellNow=JSON.parse(fs.readFileSync('public/chum/sell-now.json','utf8'));

test('every public machine surface has one canonical capability mirror',()=>{
  const expected=(machine.offers||[]).filter(x=>x?.public_id);
  assert.equal(capabilities.count,expected.length);
  assert.equal(capabilities.capabilities.length,expected.length);
  const got=new Set(capabilities.capabilities.map(x=>x.public_id));
  for(const offer of expected) assert.equal(got.has(offer.public_id),true,offer.public_id);
});

test('every capability mirror has HTML, llms, JSON and JSON-LD',()=>{
  for(const capability of capabilities.capabilities){
    const base='public/chum/capabilities/'+capability.public_id;
    for(const file of ['index.html','llms.txt','capability.json','schema.jsonld']){
      assert.equal(fs.existsSync(base+'/'+file),true,base+'/'+file);
    }
  }
});

test('ROASTED preserves payment-ready 99c state',()=>{
  const row=capabilities.capabilities.find(x=>x.public_id==='roasted-text-pressure-test-machine-v1');
  assert.ok(row);
  assert.equal(row.commercial_state,'sell_now');
  assert.equal(row.machine_state,'payment_ready');
  assert.match(String(row.pricing||''),/0\.99/);

  const record=JSON.parse(fs.readFileSync('public/chum/capabilities/roasted-text-pressure-test-machine-v1/capability.json','utf8'));
  assert.equal(record.commercial_state,'sell_now');
  assert.equal(record.machine_state,'payment_ready');
  assert.match(String(record.pricing||''),/0\.99/);
});

test('mirror generation never upgrades commercial or machine state',()=>{
  const live=new Map((machine.offers||[]).map(x=>[x.public_id,x]));
  for(const row of capabilities.capabilities){
    const source=live.get(row.public_id);
    assert.ok(source,row.public_id);
    assert.equal(row.commercial_state,source.commercial_state,row.public_id);
    assert.equal(row.machine_state,source.machine_state,row.public_id);
  }
});

test('SELL NOW directory count equals live catalog',()=>{
  const expected=(machine.offers||[]).filter(x=>x.commercial_state==='sell_now');
  assert.equal(sellNow.count,expected.length);
  assert.equal(sellNow.offers.length,expected.length);
  assert.equal(fs.existsSync('public/chum/sell-now.html'),true);
});


test('SELL NOW mirrors expose one human Start corridor',()=>{
  for(const row of sellNow.offers){
    assert.match(String(row.start_url||''),/^https:\/\//,row.public_id);
    assert.match(String(row.machine_review_url||''),/^https:\/\//,row.public_id);
    if(row.start_url_state==='machine_commerce_review_fallback'){
      assert.equal(row.start_url,row.machine_review_url,row.public_id);
    }
    assert.equal(String(row.start_url||'').startsWith('/api/chum/go/'),false,row.public_id);
    const source=(machine.offers||[]).find(x=>x.public_id===row.public_id);
    assert.ok(source,row.public_id);
    const hasPaid=(source.offers||[]).some((tier)=>{
      const numeric=Number(tier?.price_usd);
      if(Number.isFinite(numeric)&&numeric>0) return true;
      const match=String(tier?.price||'').match(/^\$([0-9][0-9,]*(?:\.[0-9]+)?)/);
      return Boolean(match&&Number(match[1].replace(/,/g,''))>0);
    });
    if(hasPaid) assert.ok(row.entry_paid_offer,'entry offer '+row.public_id);

    const record=JSON.parse(fs.readFileSync('public/chum/capabilities/'+row.public_id+'/capability.json','utf8'));
    assert.equal(record.start_url,row.start_url,row.public_id);
    assert.equal(record.start_url_state,row.start_url_state,row.public_id);
    assert.equal(record.machine_review_url,row.machine_review_url,row.public_id);
    const page=fs.readFileSync('public/chum/capabilities/'+row.public_id+'/index.html','utf8');
    assert.match(page,/Start here/,row.public_id);
  }
});
