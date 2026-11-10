import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../public/mesh/checkout-ready/',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const directory=JSON.parse(read('products.json'));
const verified=JSON.parse(read('verified-links.json'));
const slugs=directory.products.map(p=>p.landing_page.replace(/\/$/,'').split('/').at(-1));

test('each existing SKU carries one independent purpose, story, tone, palette and signature',()=>{
 assert.equal(directory.products.length,7);
 const imprints=new Set(), purposes=new Set(), marks=new Set(), palettes=new Set(), stories=new Set();
 for(const slug of slugs){
  const brand=JSON.parse(read(slug+'/brand.json'));
  const product=JSON.parse(read(slug+'/product.json'));
  const sku=verified.links.find(x=>x.key===product.sku_key);
  assert.ok(sku,'unapproved checkout '+slug);
  assert.equal(brand.schema,'evercraft.product-brand-identity.v1');
  assert.equal(brand.product_slug,slug);
  assert.equal(brand.governance.trademark_cleared,false);
  assert.equal(brand.governance.paid_sale_claim,false);
  assert.equal(brand.relationship.parent,'Evercraft OS');
  assert.ok(brand.story.origin_narrative.length>120);
  assert.ok(brand.story.core_belief.length>20);
  assert.ok(brand.purpose.length>50);
  assert.ok(brand.signature_phrase.length>12);
  assert.ok(brand.personality.principles.length>=3);
  assert.ok(brand.personality.tone.length>25);
  assert.match(brand.design_system.accent,/^#[0-9a-fA-F]{6}$/);
  assert.match(brand.design_system.background,/^#[0-9a-fA-F]{6}$/);
  assert.equal(product.identity.customer_facing_imprint,brand.imprint);
  assert.equal(product.identity.purpose,brand.purpose);
  assert.equal(product.identity.signature_phrase,brand.signature_phrase);
  assert.equal(product.identity.brand_manifest,product.discovery.human_url+'brand.json');
  assert.equal(product.identity.creative_status,'working_brand_direction_not_trademark_cleared');
  assert.equal(product.checkout.url,sku.url);
  assert.equal(product.checkout.payment_link_id,sku.payment_link_id);
  assert.equal(product.checkout.stripe_price_id,sku.stripe_price_id);
  assert.equal(product.checkout.stripe_product_id,sku.stripe_product_id);
  assert.equal(product.checkout.provider_paid_receipt_required,true);
  assert.equal(product.evercraft_os.runtime_integration_verified,false);
  assert.equal(product.acquisition.external_distribution_verified,false);
  imprints.add(brand.imprint);purposes.add(brand.purpose);marks.add(brand.design_system.mark);
  palettes.add(brand.design_system.accent+'|'+brand.design_system.background);
  stories.add(brand.story.origin_narrative);
 }
 assert.equal(imprints.size,7);
 assert.equal(purposes.size,7);
 assert.equal(marks.size,7);
 assert.equal(palettes.size,7);
 assert.equal(stories.size,7);
});

test('seven branded pages show their own story and original correct checkout',()=>{
 for(const slug of slugs){
  const brand=JSON.parse(read(slug+'/brand.json'));
  const sku=verified.links.find(x=>x.key===JSON.parse(read(slug+'/product.json')).sku_key);
  const html=read(slug+'/index.html');
  assert.match(html,/class="brand-stage"/);
  assert.ok(html.includes(brand.imprint),slug+' brand absent');
  assert.ok(html.includes(brand.signature_phrase),slug+' signature absent');
  assert.ok(html.includes(brand.purpose),slug+' purpose absent');
  assert.ok(html.includes('class="brand-emblem"'),slug+' mark absent');
  assert.ok(html.includes('class="brand-intro"'),slug+' story absent');
  assert.ok(html.includes('href="../brand-world.css"'),slug+' theme missing');
  assert.ok(html.includes('href="./brand.json"'),slug+' brand metadata missing');
  assert.ok(html.includes('identity-'+slug),slug+' unique visual CSS not selected');
  assert.ok(html.includes('<meta name="theme-color" content="'+brand.design_system.background+'">'));
  assert.ok(html.includes('<title>'+brand.imprint+' | '));
  assert.ok(html.includes(sku.price));
  const stripeUrls=[...new Set(html.match(/https:\/\/buy\.stripe\.com\/[a-zA-Z0-9]+/g)||[])];
  assert.deepEqual(stripeUrls,[sku.url],slug+' cannot use another product price');
 }
});

test('portfolio distinguishes the brands while preserving all real service checks',()=>{
 const page=read('index.html');
 const styles=read('brand-world.css');
 assert.equal((page.match(/class="brand-card"/g)||[]).length,7);
 assert.equal((page.match(/class="product-mark"/g)||[]).length,7);
 assert.equal((page.match(/class="pay"/g)||[]).length,7);
 assert.ok(styles.includes('prefers-reduced-motion'));
 for(const p of directory.products){
  assert.ok(p.creative_imprint&&p.signature_phrase&&p.product_purpose);
  assert.ok(p.brand_story_url.endsWith('/brand.json'));
  assert.equal(p.creative_name_clearance,'unverified');
  assert.ok(page.includes(p.creative_imprint));
  assert.ok(page.includes(p.signature_phrase));
  assert.ok(page.includes(p.brand));
  assert.ok(page.includes(p.checkout_url));
  assert.ok(styles.includes('identity-'+p.landing_page.replace(/\/$/,'').split('/').at(-1)));
 }
 assert.equal(verified.canonical_order_reconciliation,'manual_not_automated');
 assert.equal(verified.payment_received_verified,false);
});
