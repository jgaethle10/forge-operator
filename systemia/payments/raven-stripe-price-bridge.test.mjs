import test from 'node:test';
import assert from 'node:assert/strict';
import {URLSearchParams} from 'node:url';
import {
  STRIPE_FIXED_PRICE_BINDINGS,inspectStripeFixedPriceBinding,
  buildRavenStripeCheckoutPlan,inspectCreatedStripeCheckoutSession,
} from './raven-stripe-price-bridge.mjs';

const account={
  schema:'systemia.payments.stripe-connection-reference.v1',
  connection_key:'evercraft-primary-stripe',
  provider_boundary:'raven_nexus',
  stripe_context:'acct_1TESTIDENTITYONLY12345',
  livemode:true,
  systemia_runtime_authorized:false,
};
const provider={
  source:'raven_nexus_authenticated_stripe_api',
  account_id:account.stripe_context,livemode:true,
  authorization_valid:true,price_retrieved_via_api:true,
};
const order=slug=>({
  slug,offer_key:STRIPE_FIXED_PRICE_BINDINGS[slug].offer_key,
  amount_cents:STRIPE_FIXED_PRICE_BINDINGS[slug].amount_cents,
  currency:'usd',order_truth:'evercraft_payments',
  provider_boundary:'raven_nexus',confirmation_state:'buyer_confirmed',
  order_persisted:true,payment_state:'unpaid',synthetic:false,
  order_key:'buyer-01234567-89ab-cdef-0123-456789abcdef',
  customer_email:'buyer@example.com',
});
const price=slug=>({
  id:STRIPE_FIXED_PRICE_BINDINGS[slug].stripe_price,
  product:STRIPE_FIXED_PRICE_BINDINGS[slug].stripe_product,
  active:true,livemode:true,currency:'usd',
  unit_amount:STRIPE_FIXED_PRICE_BINDINGS[slug].amount_cents,
  type:'one_time',recurring:null,
});
const build=slug=>buildRavenStripeCheckoutPlan({
  order:order(slug),providerPrice:price(slug),account,authenticatedProvider:provider,
});
test('only exact re-fetched live one-time prices approved for two existing offers',()=>{
  assert.deepEqual(Object.keys(STRIPE_FIXED_PRICE_BINDINGS).sort(),['findmypart','website-audit']);
  for(const slug of Object.keys(STRIPE_FIXED_PRICE_BINDINGS)){
    assert.equal(inspectStripeFixedPriceBinding(slug,price(slug)).ok,true);
    for(const p of [
      {...price(slug),active:false},
      {...price(slug),livemode:false},
      {...price(slug),unit_amount:1},
      {...price(slug),currency:'eur'},
      {...price(slug),id:'price_mismatch'},
      {...price(slug),product:'prod_mismatch'},
      {...price(slug),type:'recurring',recurring:{interval:'month'}},
    ])assert.equal(inspectStripeFixedPriceBinding(slug,p).ok,false);
  }
  assert.equal(inspectStripeFixedPriceBinding('unknown',price('website-audit')).ok,false);
  assert.equal(inspectStripeFixedPriceBinding('website-audit',null).ok,false);
});

test('canonical paid offers build Stripe Checkout requests with exact price/order bindings but never grant payment',()=>{
  for(const slug of Object.keys(STRIPE_FIXED_PRICE_BINDINGS)){
    const plan=build(slug);
    const p=new URLSearchParams(plan.request.body);
    assert.equal(plan.schema,'evercraft.payments.raven-stripe-checkout-plan.v1');
    assert.equal(plan.state,'authorized_session_request_plan_not_checkout');
    assert.equal(plan.request.method,'POST');
    assert.equal(plan.request.path,'/v1/checkout/sessions');
    assert.equal(p.get('mode'),'payment');
    assert.equal(p.get('line_items[0][price]'),STRIPE_FIXED_PRICE_BINDINGS[slug].stripe_price);
    assert.equal(p.get('line_items[0][quantity]'),'1');
    assert.equal(p.get('client_reference_id'),order(slug).order_key);
    assert.equal(p.get('customer_email'),'buyer@example.com');
    assert.equal(p.get('metadata[evercraft_offer_key]'),order(slug).offer_key);
    assert.equal(p.get('payment_intent_data[metadata][evercraft_order_key]'),order(slug).order_key);
    assert.match(p.get('success_url'),/stripe_session_id=\{CHECKOUT_SESSION_ID\}/);
    assert.match(p.get('cancel_url'),/^https:\/\/fabric\.systemiacommandcenters\.com\/offers\//);
    assert.match(plan.request.idempotency_key,/^evercraft-checkout-[a-f0-9]{44}$/);
    assert.equal(plan.checkout_url,null);
    assert.equal(plan.session_created,false);
    assert.equal(plan.checkout_verified,false);
    assert.equal(plan.payment_verified,false);
    assert.equal(plan.entitlement_granted,false);
    assert.equal(plan.fulfillment_released,false);
    assert.doesNotMatch(JSON.stringify(plan),/sk_live_|rk_live_|access_token|client_secret/i);
    assert.equal(plan.request.idempotency_key,build(slug).request.idempotency_key);
  }
});

test('registered account identity alone never authorizes a provider request',()=>{
  const slug='website-audit';
  const input={order:order(slug),providerPrice:price(slug),account,authenticatedProvider:provider};
  for(const mutated of [
    {...input,authenticatedProvider:null},
    {...input,authenticatedProvider:{...provider,authorization_valid:false}},
    {...input,authenticatedProvider:{...provider,source:'user_body'}},
    {...input,authenticatedProvider:{...provider,account_id:'acct_wrong_account'}},
    {...input,authenticatedProvider:{...provider,price_retrieved_via_api:false}},
    {...input,account:{...account,livemode:false}},
    {...input,account:{...account,connection_key:'unknown'}},
  ])assert.throws(()=>buildRavenStripeCheckoutPlan(mutated));
});

test('invalid orders, mismatch prices and pre-paid states fail closed before any checkout plan',()=>{
  const slug='findmypart';
  const input={order:order(slug),providerPrice:price(slug),account,authenticatedProvider:provider};
  for(const patch of [
    {amount_cents:1},{offer_key:'another_offer'},{currency:'eur'},
    {confirmation_state:'not_confirmed'},{order_persisted:false},
    {payment_state:'paid'},{synthetic:true},
    {order_key:'qa-forged'},{customer_email:'not an email'},
    {provider_boundary:'stripe_direct'},{order_truth:'stripe'},
  ])assert.throws(()=>buildRavenStripeCheckoutPlan({...input,order:{...input.order,...patch}}),/canonical_order_not_eligible/);
  assert.throws(()=>buildRavenStripeCheckoutPlan({...input,providerPrice:price('website-audit')}),/provider_price_mismatch/);
  assert.throws(()=>buildRavenStripeCheckoutPlan({...input,providerPrice:null}),/provider_price_not_refetched/);
});

test('only exact open unpaid Stripe-hosted sessions match an Evercraft order',()=>{
  const plan=build('website-audit');
  const session={
    id:'cs_live_ABC123',url:'https://checkout.stripe.com/c/pay/cs_live_ABC123',
    livemode:true,mode:'payment',status:'open',payment_status:'unpaid',
    client_reference_id:plan.order_key,currency:plan.currency,
    amount_total:plan.amount_cents,
    metadata:{evercraft_order_key:plan.order_key,evercraft_offer_key:plan.offer_key},
  };
  const ok=inspectCreatedStripeCheckoutSession(plan,session);
  assert.equal(ok.ok,true);
  assert.equal(ok.state,'checkout_prepared_unpaid');
  assert.equal(ok.payment_verified,false);
  assert.equal(ok.fulfillment_released,false);
  for(const p of [
    {url:'https://evil.example/pay'},
    {id:'cs_test_ABC123'}, {livemode:false},
    {payment_status:'paid'}, {status:'complete'},
    {amount_total:100},{client_reference_id:'buyer-other'},
    {metadata:{...session.metadata,evercraft_offer_key:'wrong'}},
  ])assert.equal(inspectCreatedStripeCheckoutSession(plan,{...session,...p}).ok,false);
});
