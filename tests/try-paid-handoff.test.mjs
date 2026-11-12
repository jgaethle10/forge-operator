import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../public/try/index.html',import.meta.url),'utf8');
const offers=JSON.parse(readFileSync(new URL('../public/mesh/checkout-ready/products.json',import.meta.url),'utf8'));
const featured=[
  {slug:'asset-diagnosis',price:149},
  {slug:'ai-boardroom-standard',price:250},
  {slug:'social-media-weekly',price:100},
];

test('free hub hands off to the exact independently priced product pages',()=>{
  assert.match(page,/id="services" aria-label="Scoped professional services"/);
  assert.equal((page.match(/class="paid-path"/g)||[]).length,3);
  for(const item of featured){
    const product=offers.products.find(p=>p.landing_page.endsWith('/'+item.slug+'/'));
    assert.ok(product,'product manifest missing '+item.slug);
    assert.equal(product.price_usd,item.price);
    const path='../mesh/checkout-ready/'+item.slug+'/?utm_source=evercraft_try&amp;utm_medium=free_hub&amp;utm_campaign=services_handoff';
    assert.ok(page.includes(path),'missing tagged existing product link '+item.slug);
    assert.ok(page.includes('$'+item.price+' · One-time'),'missing displayed price '+item.price);
  }
});

test('paid-service handoff is scope-gated and does not invent a new checkout',()=>{
  const handoff=page.split('<section class="next" id="services"')[1].split('</section>')[0];
  assert.ok(handoff.includes('before authorizing payment'));
  assert.ok(handoff.includes('not instant digital downloads'));
  assert.ok(handoff.includes('Opening a page is not an order'));
  assert.ok(handoff.includes('do not establish actual visitors or revenue'));
  assert.ok(!handoff.includes('buy.stripe.com'));
  assert.ok(!handoff.includes('Website Quick Win Audit'));
  assert.ok(page.includes('href="../mesh/checkout-ready/">See all seven independently priced Evercraft Services'));
});

test('free tools and existing source attribution are preserved',()=>{
  for(const key of ['boardroom','research','work_saban'])assert.ok(page.includes('utm_campaign='+key));
  assert.ok(page.includes('No account, no credit card, no sales call.'));
  assert.ok(page.includes('Share free tools'));
  assert.ok(page.includes('No signup'));
});
