import test from 'node:test';
import assert from 'node:assert/strict';
import {priceVisible,evaluateBuyerView,validateCatalog} from './verify-systemia-stripe-seven.mjs';

const base={key:'asset-diagnosis',amount_cents:14900,url:'https://buy.stripe.com/dRm9AU0jYdANdHS72s4AU0a',
  final_url:'https://checkout.stripe.com/c/pay/test',status:200};
test('checks exact amount, not an accidental prefix of a higher price',()=>{
  assert.equal(priceVisible('Total $149.00',14900),true);
  assert.equal(priceVisible('Total $1,490.00',14900),false);
  assert.equal(priceVisible('Total $1000.00',10000),false);
  assert.equal(priceVisible('Total $1,000.00',100000),true);
});
test('only matching service, amount and payment fields constitute buyer-form proof',()=>{
  const r=evaluateBuyerView({...base,visible_text:'Asset Diagnosis\n$149.00\nCard information\nEmail'});
  assert.equal(r.state,'READ_ONLY_BUYER_FORM_VERIFIED');
  assert.deepEqual(r.findings,[]);
});
test('generic Stripe page without exact SKU cannot be declared ready',()=>{
  const r=evaluateBuyerView({...base,visible_text:'Stripe Checkout\n$149.00\nCard information'});
  assert.equal(r.state,'UNVERIFIED');
  assert.ok(r.findings.includes('EXACT_SKU_TITLE_NOT_VERIFIED'));
});
test('a Stripe-looking URL on wrong host or inactive link must fail closed',()=>{
  const a=evaluateBuyerView({...base,final_url:'https://checkout.stripe.com.attacker.test/pay',
    visible_text:'Asset Diagnosis $149.00 Card information'});
  assert.ok(a.findings.includes('PROVIDER_ORIGIN_NOT_VERIFIED'));
  const b=evaluateBuyerView({...base,visible_text:'Asset Diagnosis $149.00 Card information Payment link is no longer active'});
  assert.ok(b.findings.includes('CHECKOUT_BLOCKED_OR_EXPIRED'));
});
test('catalog cannot contain substituted or non-Stripe purchase URLs',()=>{
  const good={schema:'evercraft.payments.existing-provider-links.v1',
    links:['weekly-social','asset-diagnosis','ai-boardroom-standard','ai-boardroom-financial',
      'knowledge-activation','social-intelligence-launch','institutional-memory-system'].map(key=>({
      key,amount_cents:10000,url:'https://buy.stripe.com/4gM3cweaOcwJ1Za1I84AU0d'
    }))};
  assert.equal(validateCatalog(good),true);
  const bad=structuredClone(good);
  bad.links[1].url='https://buy.stripe.com.evil.test/foo';
  assert.throws(()=>validateCatalog(bad),/unapproved_stripe_url/);
});
