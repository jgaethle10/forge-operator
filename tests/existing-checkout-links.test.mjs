import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const dir=new URL('../public/mesh/',import.meta.url);
const get=p=>readFileSync(new URL(p,dir),'utf8');
const manifest=JSON.parse(get('checkout-ready/verified-links.json'));
const expected={
'weekly-social':{cents:10000,link:'plink_1U4uEXK4iDjqpECV8jfAriJQ',price:'price_1U4T2MK4iDjqpECVqSxLlBn8',url:'https://buy.stripe.com/4gM3cweaOcwJ1Za1I84AU0d'},
'asset-diagnosis':{cents:14900,link:'plink_1U4QhsK4iDjqpECVRK9Qgbps',price:'price_1U4QhlK4iDjqpECVuUcr2XnI',url:'https://buy.stripe.com/dRm9AU0jYdANdHS72s4AU0a'},
'ai-boardroom-standard':{cents:25000,link:'plink_1U4QhsK4iDjqpECVFswYIOrd',price:'price_1U4QhlK4iDjqpECVH2SFMHx7',url:'https://buy.stripe.com/14AdRaaYC68lcDO0E44AU08'},
'ai-boardroom-financial':{cents:50000,link:'plink_1U4QhsK4iDjqpECVd94vMVSP',price:'price_1U4QhlK4iDjqpECVhOTAtXEK',url:'https://buy.stripe.com/3cIbJ2feSfIVcDO1I84AU09'},
'knowledge-activation':{cents:50000,link:'plink_1U4QhsK4iDjqpECVxTggl5e7',price:'price_1U4QhlK4iDjqpECVwqsB5Aes',url:'https://buy.stripe.com/dRmfZifeS1S59rCdqQ4AU07'},
'social-intelligence-launch':{cents:100000,link:'plink_1U4RelK4iDjqpECVQntZr27T',price:'price_1U4RdoK4iDjqpECVzhUZ5dmB',url:'https://buy.stripe.com/8x24gA1o2eER0V672s4AU0b'},
'institutional-memory-system':{cents:150000,link:'plink_1U4QhsK4iDjqpECVXob9B34R',price:'price_1U4QhlK4iDjqpECVidrwxUxU',url:'https://buy.stripe.com/14AfZid6K54hfQ00E44AU06'},
};
test('seven links match real Systemia service identity and exact Stripe prices',()=>{
 assert.equal(manifest.schema,'evercraft.payments.existing-provider-links.v1');
 assert.equal(manifest.links.length,7);
 assert.equal(manifest.current_processor_account,'Systemia');
 assert.equal(manifest.state,'existing_active_live_processor_links_confirmed_by_provider');
 const ids=new Set();
 for(const item of manifest.links){
  const exp=expected[item.key];
  assert.ok(exp,item.key);
  assert.equal(item.amount_cents,exp.cents);
  assert.equal(item.payment_link_id,exp.link);
  assert.equal(item.stripe_price_id,exp.price);
  assert.equal(item.url,exp.url);
  assert.match(item.url,/^https:\/\/buy\.stripe\.com\//);
  assert.ok(!ids.has(item.payment_link_id));ids.add(item.payment_link_id);
 }
});
test('seven scoped services are marketable now without falsely claiming completed payment',()=>{
 assert.equal(manifest.commercial_marketing_state,'sell_now_exact_sku_scoped_services');
 assert.equal(manifest.owner_approved_promotion,true);
 assert.equal(manifest.no_prior_customer_charge_required_for_marketing,true);
 assert.equal(manifest.scope_confirmation_required_before_customer_payment,true);
 assert.ok(manifest.links.every(x=>x.commercial_state==='sell_now_original_sku'&&x.public_promotion_allowed&&x.checkout_ready));
 assert.ok(manifest.links.every(x=>x.payment_verified_by_checkout_view===false));
 assert.equal(manifest.canonical_order_reconciliation,'manual_not_automated');
 const guide=get('checkout-ready/llms.txt');
 assert.match(guide,/Commercial promotion state: SELL NOW/);
 const page=get('checkout-ready/index.html');
 assert.match(page,/All seven original service checkouts are available for customer inquiries now/);
 assert.equal((page.match(/secure checkout ↗/g)||[]).length,7);
});
test('latest independent browser proof is dated, exact-SKU, and not a paid receipt',()=>{
 const proof=manifest.latest_independent_buyer_browser_check;
 assert.equal(proof.observed_at,'2026-11-10T00:28:13.556Z');
 assert.equal(proof.observed_date_pacific,'2026-11-09');
 assert.equal(proof.state,'ALL_SEVEN_READ_ONLY_FORMS_VERIFIED');
 assert.equal(proof.verified_count,7);
 assert.equal(proof.total,manifest.links.length);
 assert.equal(proof.payment_attempted,false);
 assert.equal(proof.form_submitted,false);
 assert.equal(proof.orders_created,false);
 assert.equal(proof.payment_received_verified,false);
 assert.equal(proof.fulfillment_verified,false);
 assert.equal(proof.manual_reconciliation_required,true);
 assert.match(proof.run_url,/^https:\/\/github\.com\/jgaethle10\/forge-operator\/actions\/runs\/42728476003$/);
 const readiness=JSON.parse(readFileSync(new URL('../public/.well-known/evercraft-commercial-readiness.json',import.meta.url),'utf8'));
 assert.equal(readiness.commercial_checkout_ready,false,'owned rail cannot inherit Stripe proof');
 assert.equal(readiness.separate_systemia_hosted_stripe.automated_browser_checked_at,proof.observed_at);
 assert.equal(readiness.separate_systemia_hosted_stripe.automated_browser_receipt_url,proof.receipt_artifact_url);
 assert.equal(readiness.separate_systemia_hosted_stripe.verified_payment_observed,false);
 const html=get('checkout-ready/index.html');
 assert.match(html,/all seven original Stripe checkouts displayed the exact service name/i);
 assert.ok(html.includes(proof.run_url));
 assert.match(html,/not a completed order, a customer payment/i);
});

test('no unrelated $19, $49 or PDF product is passed through existing service links',()=>{
 assert.deepEqual(manifest.forbidden_substitutions,['Garage Field Notes PDF products','FindMyPart Quick Hunt','Website Quick Win Audit']);
 assert.ok(manifest.links.every(x=>![700,900,1900,4900].includes(x.amount_cents)));
 assert.equal(manifest.canonical_order_reconciliation,'manual_not_automated');
 assert.equal(manifest.payment_received_verified,false);
});
test('customer-facing directory provides one-click exact checkout review with clear payment terms',()=>{
 const html=get('checkout-ready/index.html');
 assert.equal((html.match(/class="pay"/g)||[]).length,7);
 assert.equal((html.match(/Evercraft service · Secure checkout/g)||[]).length,7);
 assert.doesNotMatch(html,/EVERCRAFT PAYMENTS · VERIFIED OFFERS/);
 assert.match(html,/EVERCRAFT \/ SERVICES/);
 assert.match(html,/Payments infrastructure: Evercraft Payments/);
 assert.match(html,/<title>Evercraft Services \| Explore Services & Pricing<\/title>/);
 assert.match(html,/Evercraft Services · Practical help, clear pricing/);
 assert.match(html,/Stripe processes payment under the Systemia settlement account/);
 assert.match(html,/underlying Evercraft Payments ledger is reconciled manually/);
 assert.ok(Object.values(expected).every(x=>html.includes(x.url)));
 assert.match(html,/Ready to review your checkout\?/i);
 assert.match(html,/confirm project scope and delivery availability/i);
 assert.doesNotMatch(html,/id="accept" type="checkbox"/);
 assert.doesNotMatch(html,/aria-disabled/);
 assert.doesNotMatch(html,/e\.preventDefault\(\)/);
 assert.match(html,/provider-verified receipts/i);
 assert.match(html,/does not itself place an order/i);
 assert.match(html,/no matching reusable payment link/i);
 assert.doesNotMatch(html,/(pornhub|onlyfans|fansly|nsfw)/i);
 assert.doesNotMatch(html,/<script>/);
});
test('agent buyer instructions route through Evercraft Payments while declaring the settlement adapter',()=>{
 const guide=get('checkout-ready/llms.txt');
 assert.match(guide,/^# Evercraft Services \|/);
 assert.match(guide,/Payment infrastructure: Evercraft Payments is the canonical order authority/i);
 assert.match(guide,/Stripe is the downstream payment processor/i);
 assert.match(guide,/2026-10-25/);
 assert.match(guide,/manual reconciliation into Evercraft Payments/i);
 assert.match(guide,/automatic synchronization is NOT yet proven/i);
 assert.match(guide,/verified human-facing payment-provider page/i);
 assert.match(guide,/Do not require a first completed paid order/i);
 assert.match(guide,/never claim revenue or fulfillment from checkout visibility alone/i);
});
test('main Evercraft storefront links to the new processor-verified service page',()=>{
 const html=get('index.html');
 assert.ok(html.includes('href="./checkout-ready/"'));
});

test('three higher-priced exact-match offers have indexable scoped buyer pages and gated checkout',()=>{
 const routes={
  'knowledge-activation':'knowledge-activation',
  'social-intelligence-launch':'social-intelligence-launch',
  'institutional-memory-system':'institutional-memory-system'
 };
 const directory=get('checkout-ready/index.html');
 const sitemap=get('checkout-ready/sitemap.xml');
 const llms=get('checkout-ready/llms.txt');
 for(const [key,slug] of Object.entries(routes)){
  const item=manifest.links.find(x=>x.key===key);
  assert.ok(item,'missing '+key);
  const html=get('checkout-ready/'+slug+'/index.html');
  const canonical='https://jgaethle10.github.io/forge-operator/mesh/checkout-ready/'+slug+'/';
  assert.ok(html.includes(item.url),slug);
  assert.ok(html.includes(item.price),slug);
  assert.ok(html.includes('<link rel="canonical" href="'+canonical+'">'),slug);
  assert.match(html,/id="confirm" type="checkbox"/);
  assert.match(html,/authoritative paid receipt/);
  assert.ok(directory.includes('href="./'+slug+'/"'));
  assert.ok(sitemap.includes(canonical));
  assert.ok(llms.includes(canonical));
  const code=html.match(/<script>([\s\S]+?)<\/script>/)?.[1];
  assert.ok(code);
  assert.doesNotThrow(()=>new vm.Script(code));
  const stripeUrls=html.match(/https:\/\/buy\.stripe\.com\/[a-zA-Z0-9]+/g)||[];
  assert.ok(stripeUrls.length>=2);
  assert.deepEqual([...new Set(stripeUrls)],[item.url]);
 }
});
