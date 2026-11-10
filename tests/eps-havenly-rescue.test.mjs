import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const read = p => fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('EPS and Havenly customer routes are present and not tied to legacy infrastructure',()=>{
  const eps=read('public/eps/index.html');
  const havenly=read('public/havenly/index.html');
  for(const marker of ['mailto:jessegaethle10@gmail.com','mailto:evercraftpropertyservices@gmail.com','tel:+15097590440','sms:+15097590440','id="textQuote"','id="emailQuote"','id="copyQuote"']) assert.ok(eps.includes(marker),`Missing EPS marker: ${marker}`);
  assert.doesNotMatch(eps,/509[\s-]*910[\s-]*3256|15099103256|jesse@evercraftpropertyservices\.com/i);
  for(const marker of ['sms:+15095605190','mailto:havenlycleaning@gmail.com','id="textRequest"','Nothing is automatically submitted or booked']) assert.ok(havenly.includes(marker));
  for(const page of [eps,havenly]) assert.doesNotMatch(page,/base44\.app|@base44|base44Client|base44-prod/i);
});
test('recovery ledger does not equate source code with completed migration',()=>{
  const state=JSON.parse(read('systemia/migrations/base44-exit/eps-havenly-recovery-state.json'));
  assert.equal(state.legacy_source_access.exported_customer_data,false);
  assert.equal(state.legacy_source_access.paid_upgrade_authorized,false);
  for(const product of state.public_service_surfaces){
    assert.equal(product.live_owned_domain_cutover,'not_verified');
    assert.equal(product.legacy_records_state,'not_exported');
    assert.equal(product.checkout_state,'not_verified');
  }
});
test('Saban work is redacted, bounded, and non-transactional',()=>{
  const formation=JSON.parse(read('systemia/migrations/base44-exit/eps-havenly-saban-formation.json'));
  const inventory=JSON.parse(read('systemia/migrations/base44-exit/eps-havenly-rescue-inventory.json'));
  assert.equal(formation.nodes.length,1);
  assert.equal(formation.nodes[0].software,'portfolio-archaeology');
  assert.equal(formation.nodes[0].physical_workers,4);
  assert.equal(formation.nodes[0].execution.mode,'local');
  assert.equal(inventory.apps.length,5);
  for(const app of inventory.apps){
    assert.equal(app.id,undefined);
    assert.equal(app.email,undefined);
    assert.equal(app.token,undefined);
  }
});
