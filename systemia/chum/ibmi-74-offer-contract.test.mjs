import test from 'node:test';
import assert from 'node:assert/strict';
import {checkIBMi74TierListing,DEADLINE_KEY} from './ibmi-74-offer-contract.mjs';

test('exact published 7.4 SKU and price proves listing only, not checkout',()=>{
 const result=checkIBMi74TierListing([{offer_key:'ibmi_estate_xray_250',amount_cents:25000},{offer_key:DEADLINE_KEY,amount_cents:25000,currency:'usd'}]);
 assert.equal(result.ready,true);
 assert.equal(result.checkout_verified,false);
 assert.equal(result.payment_verified,false);
 assert.equal(result.amount_cents,25000);
});
test('generic Estate X-Ray is not proof of 7.4 availability',()=>{
 assert.equal(checkIBMi74TierListing([{offer_key:'ibmi_estate_xray_250',amount_cents:25000}]).reason,'deadline_tier_not_listed');
});
test('rejects altered pricing, currency, malformed response or duplicate identities',()=>{
 assert.equal(checkIBMi74TierListing([{offer_key:DEADLINE_KEY,amount_cents:150000}]).reason,'deadline_tier_price_mismatch');
 assert.equal(checkIBMi74TierListing([{offer_key:DEADLINE_KEY,amount_cents:25000,currency:'cad'}]).reason,'deadline_currency_mismatch');
 assert.equal(checkIBMi74TierListing([{offer_key:DEADLINE_KEY,amount_cents:25000},{offer_key:DEADLINE_KEY,amount_cents:25000}]).reason,'ambiguous_deadline_tier');
 assert.equal(checkIBMi74TierListing(null).reason,'live_tiers_missing');
});

test('a USD price without an explicit currency is not a verified tier',()=>{
 const result=checkIBMi74TierListing([{offer_key:DEADLINE_KEY,amount_cents:25000}]);
 assert.equal(result.ready,false);
 assert.equal(result.reason,'deadline_currency_missing');
 assert.equal(result.checkout_verified,false);
});
