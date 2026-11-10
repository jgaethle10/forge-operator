import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  validateExactSkuRegistry,validateAdditionalExactSkuLinks,resolveExactSkuCheckout,commerceCoverage,
} from '../systemia/payments/exact-sku-checkout.mjs';

const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const products=read('../public/mesh/checkout-ready/products.json');
const manifest=read('../public/mesh/checkout-ready/verified-links.json');
const discovery=read('../registry/public-products.json');
const additional=read('../public/.well-known/evercraft-payments-additional-exact-skus.json');

test('seven existing original Stripe SKUs have one exact individual buyer path each',()=>{
  assert.equal(validateExactSkuRegistry(products,manifest),true);
  assert.equal(products.products.length,7);
  for(const product of products.products){
    const mapped=manifest.links.find(x=>x.key===product.sku_key);
    const handoff=resolveExactSkuCheckout({
      product_id:product.product_id,expected_amount_cents:mapped.amount_cents,
      currency:'USD',scope_approved:true,capacity_approved:true,buyer_confirmed:true,
    },{products,manifest});
    assert.equal(handoff.ok,true,product.product_id);
    assert.equal(handoff.checkout_url,mapped.url);
    assert.equal(handoff.provider_product_name,mapped.name);
    assert.equal(handoff.amount_cents,mapped.amount_cents);
    assert.equal(handoff.payment_authority,'Evercraft Payments');
    assert.equal(handoff.merchant_account,'Systemia');
    assert.equal(handoff.canonical_order_reconciliation,'manual_required');
    assert.equal(handoff.checkout_created,false);
    assert.equal(handoff.paid_verified,false);
    assert.equal(handoff.fulfillment_release,false);
  }
});

test('no checkout URL before scope, capacity and affirmative buyer approval',()=>{
  const product_id=products.products[0].product_id;
  for(const flags of [
    {},
    {scope_approved:true},
    {scope_approved:true,capacity_approved:true},
    {scope_approved:true,capacity_approved:true,buyer_confirmed:'yes'},
  ]){
    const outcome=resolveExactSkuCheckout({product_id,...flags},{products,manifest});
    assert.equal(outcome.ok,false);
    assert.equal(outcome.state,'SCOPE_CAPACITY_AND_BUYER_CONFIRMATION_REQUIRED');
    assert.equal(outcome.checkout_url,null);
  }
});

test('wrong price, currency or unrelated product can never borrow an existing SKU',()=>{
  const product_id=products.products[2].product_id;
  const fields={product_id,scope_approved:true,capacity_approved:true,buyer_confirmed:true};
  for(const [change,reason] of [
    [{expected_amount_cents:10000},'AMOUNT_MISMATCH'],
    [{currency:'cad'},'CURRENCY_MISMATCH'],
    [{product_id:'findmypart.quick_hunt_19.v1'},'EXACT_SKU_NOT_PROVISIONED'],
    [{product_id:'evercraft.fake_product_same_price'},'EXACT_SKU_NOT_PROVISIONED'],
  ]){
    const result=resolveExactSkuCheckout({...fields,...change},{products,manifest});
    assert.equal(result.ok,false);
    assert.equal(result.state,reason);
    assert.equal(result.checkout_url,null);
  }
});

test('catalog identity, amount and processor link drift fail before routing',()=>{
  const variants=[
    m=>{m.links[0].amount_cents=9900;},
    m=>{m.links[0].url=m.links[1].url;},
    m=>{m.links[0].url='https://phishing.example/buy';},
    m=>{m.links[0].name='Different product';},
    m=>{m.links[0].key=m.links[1].key;},
    m=>{m.current_processor_account='unknown';},
  ];
  for(const mutate of variants){
    const m=structuredClone(manifest);mutate(m);
    assert.throws(()=>validateExactSkuRegistry(products,m));
  }
});

test('portfolio counts public discovery separately from exact paid products',()=>{
  const c=commerceCoverage({publicProducts:discovery,products,manifest});
  assert.equal(c.schema,'evercraft.payments.coverage.v1');
  assert.equal(c.owned_discovery_products,discovery.products.length);
  assert.equal(c.independently_linked_commercial_products,7);
  assert.equal(c.exact_provider_checkout_links,7);
  assert.equal(c.other_offers_automatically_reusing_any_of_seven,0);
  assert.equal(c.discovery.length,discovery.products.length);
  assert.equal(c.independently_linked_products.length,7);
  for(const item of c.discovery)assert.equal(item.state,'INVENTORIED_NOT_AUTOMATICALLY_PAYMENT_APPROVED');
});

test('unmapped catalog starts with no invented extra checkout links',()=>{
  assert.equal(validateAdditionalExactSkuLinks(additional,{products,manifest}).length,0);
  assert.equal(additional.offers.length,0);
  const report=commerceCoverage({publicProducts:discovery,products,manifest,additional});
  assert.equal(report.exact_provider_checkout_links,7);
  assert.equal(report.additional_independently_verified_offers,0);
});

test('an additional original SKU can join only through a separate verified identity',()=>{
  const fixture=structuredClone(additional);
  fixture.offers.push({
    product_id:'example.synthetic.new-product',
    sku_key:'example-synthetic-one-time',
    name:'Example Synthetic Service',amount_cents:1900,currency:'usd',
    url:'https://buy.stripe.com/SYNTHETIC123456',
    payment_link_id:'plink_SYNTHETIC_FIXTURE',
    stripe_product_id:'prod_SYNTHETIC_FIXTURE',
    stripe_price_id:'price_SYNTHETIC_FIXTURE',
    landing_page:'https://example.test/fixture/',
    approved_by_owner:true,
    verification_state:'PROVIDER_AND_RENDERED_BUYER_VIEW_VERIFIED',
    browser_checked_at:'2026-11-09T22:00:00Z',
    independent_browser_receipt:'https://github.com/example/synthetic/actions/runs/1234',
  });
  const result=resolveExactSkuCheckout({
    product_id:'example.synthetic.new-product',
    expected_amount_cents:1900,scope_approved:true,capacity_approved:true,buyer_confirmed:true,
  },{products,manifest,additional:fixture});
  assert.equal(result.ok,true);
  assert.equal(result.checkout_url,fixture.offers[0].url);
  assert.equal(result.payment_link_id,fixture.offers[0].payment_link_id);
  assert.equal(result.paid_verified,false);
  assert.equal(result.fulfillment_release,false);

  const malicious=structuredClone(fixture);
  malicious.offers[0].url=manifest.links[0].url;
  assert.throws(()=>validateAdditionalExactSkuLinks(malicious,{products,manifest}),/duplicate_additional_exact_sku/);
  const missing=structuredClone(fixture);
  missing.offers[0].approved_by_owner=false;
  assert.throws(()=>validateAdditionalExactSkuLinks(missing,{products,manifest}),/unverified_additional_exact_sku/);
});
