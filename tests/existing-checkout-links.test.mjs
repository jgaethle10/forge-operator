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
test('no unrelated $19, $49 or PDF product is passed through existing service links',()=>{
 assert.deepEqual(manifest.forbidden_substitutions,['Garage Field Notes PDF products','FindMyPart Quick Hunt','Website Quick Win Audit']);
 assert.ok(manifest.links.every(x=>![700,900,1900,4900].includes(x.amount_cents)));
 assert.equal(manifest.canonical_order_reconciliation,'manual_not_automated');
 assert.equal(manifest.payment_received_verified,false);
});
test('customer-facing page requires deliberate human confirmation and honest payment facts',()=>{
 const html=get('checkout-ready/index.html');
 assert.equal((html.match(/class="pay"/g)||[]).length,7);
 assert.ok(Object.values(expected).every(x=>html.includes(x.url)));
 assert.match(html,/id="accept" type="checkbox"/);
 assert.match(html,/aria-disabled/);
 assert.match(html,/manually reconcile provider-verified receipts/i);
 assert.match(html,/does not itself place an order/i);
 assert.match(html,/no matching reusable payment link/i);
 assert.doesNotMatch(html,/(pornhub|onlyfans|fansly|nsfw)/i);
 const code=html.match(/<script>([\s\S]+?)<\/script>/)?.[1];
 assert.ok(code);
 assert.doesNotThrow(()=>new vm.Script(code));
});
test('main Evercraft storefront links to the new processor-verified service page',()=>{
 const html=get('index.html');
 assert.ok(html.includes('href="./checkout-ready/"'));
});
