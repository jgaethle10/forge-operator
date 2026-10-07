import test from 'node:test';
import assert from 'node:assert/strict';
import {getEvercraftPaymentOffer,listEvercraftPaymentOffers} from './offer-registry.mjs';
import {offerPurchaseKeyForSlug} from '../mcp/fabric-public-site.mjs';

test('owned payment registry covers every public Fabric checkout slug',()=>{
  const expected={
    'website-audit':['website-audit-quick-win',4900],
    'ibmi-rescue':['ibmi-estate-xray',25000],
    'legacy-rescue':['legacy-rescue-scan',29900],
    'findmypart':['findmypart-quick-hunt',1900],
  };
  for(const [slug,[purchaseKey,amount]] of Object.entries(expected)){
    assert.equal(offerPurchaseKeyForSlug(slug),purchaseKey);
    const offer=getEvercraftPaymentOffer(purchaseKey);
    assert.ok(offer,'missing canonical payment offer for '+slug);
    assert.equal(offer.amount_cents,amount);
    assert.equal(offer.currency,'usd');
    assert.equal(offer.fulfillment_release_requires_verified_payment,true);
  }
  assert.equal(listEvercraftPaymentOffers().length,Object.keys(expected).length);
});

test('unknown purchase keys are not accepted by Evercraft Payments',()=>{
  assert.equal(getEvercraftPaymentOffer('does-not-exist'),null);
});
