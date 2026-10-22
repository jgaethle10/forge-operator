import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {URL} from 'node:url';
import {publicPaymentOffer} from '../systemia/mcp/public-payment-offers.mjs';
import {ownedOfferLink} from '../systemia/mcp/owned-offer-links.mjs';
import {renderOfferPage} from '../systemia/mcp/fabric-public-site.mjs';

const read=p=>fs.readFileSync(p,'utf8');
const mesh=read('public/mesh/index.html');
const localRuntime=read('systemia/mcp/fabric-local-runtime.mjs');
const paymentReturn=read('systemia/mcp/payment-return.mjs');
const plugin=JSON.parse(read('plugins/findmypart/plugin.json'));
const sample={
  public_id:'findmypart-paid-hunt-v1',
  name:'FindMyPart Paid Part Hunt',
  commercial_state:'sell_now',
  pricing:'Quick Hunt $19 one-time',
  entry_paid_offer:{name:'Quick Hunt',price:'$19',price_usd_normalized:19,billing:'one_time'}
};

test('FindMyPart public offer and shop inquiry use owned routes only',()=>{
  assert.match(mesh,/https:\/\/fabric\.systemiacommandcenters\.com\/offers\/findmypart/);
  assert.match(mesh,/FindMyPart: difficult-part hunt/);
  assert.doesNotMatch(mesh,/findmypart\.base44\.app|\/functions\/evercraftBuy/i);
  const owned=ownedOfferLink(sample);
  assert.equal(owned?.human_form_url,'https://fabric.systemiacommandcenters.com/offers/findmypart');
  assert.equal(owned?.checkout_created,false);
  assert.equal(owned?.payment_verified,false);
  assert.equal(owned?.fulfillment_verified,false);
});
test('assisted email route asks for a real part problem rather than an empty lead',()=>{
  const match=mesh.match(/href="(mailto:jessegaethle10@gmail\.com\?subject=FindMyPart%20%7C%20One%20stuck%20part[^"]+)"/);
  assert.ok(match,'specific FindMyPart mail route exists');
  const value=match[1].replaceAll('&amp;','&');
  const u=new URL(value);
  assert.equal(u.protocol,'mailto:');
  assert.equal(u.pathname,'jessegaethle10@gmail.com');
  const body=u.searchParams.get('body')||'';
  for(const field of ['What needs replacing','Equipment / make / model','Part or casting number','already tried','Urgency','Photos','authorized payment instructions'])assert.ok(body.includes(field),field);
  assert.doesNotMatch(body,/password|social security number/i);
});
test('three prices map to exact original payment offers without substituting a different SKU',()=>{
  assert.equal(publicPaymentOffer('part-deep')?.offer_key,'findmypart.deep_hunt_49.v1');
  assert.equal(publicPaymentOffer('part-deep')?.amount_cents,4900);
  assert.equal(publicPaymentOffer('part-rescue')?.offer_key,'findmypart.rescue_hunt_99.v1');
  assert.equal(publicPaymentOffer('part-rescue')?.amount_cents,9900);
  assert.match(paymentReturn,/findmypart:'findmypart\.quick_hunt_19\.v1'/);
  assert.match(paymentReturn,/'part-quick':'findmypart\.quick_hunt_19\.v1'/);
});
test('owned checkout is fail closed until configured and requires explicit buyer confirmation and exact price',()=>{
  assert.match(localRuntime,/EVERCRAFT_PURCHASE_INTENT_OWNED_URL/);
  assert.match(localRuntime,/EVERCRAFT_PAYMENT_OPS_OWNED_URL/);
  assert.match(localRuntime,/explicit_user_confirmation_required/);
  assert.match(localRuntime,/owned_evercraft_payments_unavailable/);
  assert.match(localRuntime,/Number\(result\.amount_cents\)===directOffer\.amount_cents/);
  assert.match(localRuntime,/checkout_provider_paid_verified:false/);
  assert.match(localRuntime,/fulfillment_release:false/);
});
test('owned product page does not silently switch to a retired host',()=>{
  const html=renderOfferPage(sample,{checkoutConfigured:false});
  assert.match(html,/Online checkout is temporarily unavailable/);
  assert.match(html,/Request assisted invoicing/);
  assert.doesNotMatch(html,/\.base44\.app|buy\.stripe\.com/i);
  assert.doesNotMatch(html,/payment confirmed|order fulfilled/i);
});
test('specialist plugin is held pending independently verified owned publication',()=>{
  assert.equal(plugin.releaseState,'OWNED_RUNTIME_ROUTE_PENDING');
  assert.equal(plugin.publicOriginState,'legacy_provider_retired_owned_route_pending');
});
