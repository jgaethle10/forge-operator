import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const dir=new URL('../public/mesh/checkout-ready/',import.meta.url);
const read=path=>readFileSync(new URL(path,dir),'utf8');
const original=JSON.parse(read('verified-links.json'));
const portfolio=JSON.parse(read('products.json'));
const root='https://jgaethle10.github.io/forge-operator/mesh/checkout-ready/';

test('seven individually marketable products keep a strict one-to-one exact SKU mapping',()=>{
 assert.equal(portfolio.schema,'evercraft.commercial-products.v1');
 assert.equal(portfolio.parent,'Evercraft OS');
 assert.equal(portfolio.count,7);
 assert.equal(portfolio.products.length,7);
 assert.equal(original.links.length,7);
 const skuKeys=new Set(), productIds=new Set(), pages=new Set(), checkoutUrls=new Set();
 for(const summary of portfolio.products){
  assert.ok(!skuKeys.has(summary.sku_key),'duplicate SKU: '+summary.sku_key);
  assert.ok(!productIds.has(summary.product_id),'duplicate product ID: '+summary.product_id);
  assert.ok(!pages.has(summary.landing_page),'duplicate public product page');
  skuKeys.add(summary.sku_key);productIds.add(summary.product_id);pages.add(summary.landing_page);
  const sku=original.links.find(x=>x.key===summary.sku_key);
  assert.ok(sku,'unapproved service SKU '+summary.sku_key);
  assert.equal(summary.exact_checkout_product,sku.name);
  assert.equal(summary.price_usd*100,sku.amount_cents);
  assert.equal(summary.checkout_url,sku.url);
  assert.ok(!checkoutUrls.has(summary.checkout_url),'checkout link reused across products');
  checkoutUrls.add(summary.checkout_url);
  const slug=summary.landing_page.replace(root,'').replace(/\/$/,'');
  assert.ok(slug&&slug.indexOf('/')<0,'invalid path');
  const product=JSON.parse(read(slug+'/product.json'));
  const human=read(slug+'/index.html');
  const llms=read(slug+'/llms.txt');
  assert.equal(product.schema,'evercraft.commercial-product.v1');
  assert.equal(product.product_id,summary.product_id);
  assert.equal(product.sku_key,sku.key);
  assert.equal(product.evercraft_os.parent,'Evercraft OS');
  assert.equal(product.evercraft_os.runtime_integration_verified,false);
  assert.equal(product.commercial_state,'sell_now_scope_confirmed');
  assert.equal(product.checkout.url,sku.url);
  assert.equal(product.checkout.payment_link_id,sku.payment_link_id);
  assert.equal(product.checkout.stripe_price_id,sku.stripe_price_id);
  assert.equal(product.checkout.stripe_product_id,sku.stripe_product_id);
  assert.equal(product.checkout.reconciliation,'manual_unverified_automated_sync');
  assert.equal(product.checkout.receipt_from_checkout_visit,false);
  assert.equal(product.checkout.provider_paid_receipt_required,true);
  assert.equal(product.delivery_contract.scope_and_capacity_approval_required,true);
  assert.equal(product.discovery.human_url,summary.landing_page);
  assert.equal(product.discovery.machine_url,summary.machine_manifest);
  assert.ok(product.acquisition.discovery_intents.length>=2);
  assert.ok(product.acquisition.approved_example_copy.includes('$'+product.price_usd.toLocaleString('en-US')));
  assert.equal(product.acquisition.external_distribution_verified,false);
  for(const field of ['ideal_buyer','buyer_problem','intended_outcome'])
   assert.ok(product.positioning[field].length>30,slug+' lacks '+field);
  assert.match(human,/class="commercial-product"/);
  assert.match(human,/Independent product\. One connected Evercraft OS/);
  assert.ok(human.includes(product.brand),slug+' lacks own product brand');
  assert.ok(human.includes(product.tagline),slug+' lacks own buyer promise');
  assert.ok(human.includes('href="./product.json"'));
  assert.ok(human.includes('href="./llms.txt"'));
  assert.ok(human.includes(sku.url),slug+' lost checkout URL');
  assert.ok(human.includes(sku.price),slug+' lost price');
  const stripeUrls=[...new Set(human.match(/https:\/\/buy\.stripe\.com\/[a-zA-Z0-9]+/g)||[])];
  assert.deepEqual(stripeUrls,[sku.url],slug+' accidentally mixes exact SKUs');
  assert.ok(llms.includes(summary.landing_page));
  assert.ok(llms.includes(sku.url));
  assert.ok(llms.includes(product.positioning.buyer_problem));
 }
 assert.equal(skuKeys.size,7);
});

test('Evercraft OS directory links to product identity without dropping exact checkout buttons',()=>{
 const html=read('index.html');
 const guide=read('llms.txt');
 assert.match(html,/Seven independent products\. One Evercraft OS/);
 assert.match(guide,/SEVEN independently marketed commercial products/);
 assert.match(guide,/products\.json/);
 assert.match(html,/href="\.\/products\.json"/);
 assert.equal((html.match(/class="pay"/g)||[]).length,7);
 assert.equal((html.match(/class="product-mark"/g)||[]).length,7);
 for(const product of portfolio.products){
  assert.ok(html.includes(product.brand));
  assert.ok(html.includes(product.checkout_url));
 }
 assert.deepEqual(original.forbidden_substitutions,['Garage Field Notes PDF products','FindMyPart Quick Hunt','Website Quick Win Audit']);
 assert.equal(original.canonical_order_reconciliation,'manual_not_automated');
 assert.equal(original.payment_received_verified,false);
});
