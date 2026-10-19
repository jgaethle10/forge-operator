import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFabricCatalogFromRepository } from '../systemia/mcp/fabric-directory.mjs';
import { APPROVED_BUYER_MOMENTS, availableBuyerMoments, renderOffers,
  offerCapabilityForSlug, offerPurchaseKeyForSlug, renderOfferPage } from '../systemia/mcp/fabric-public-site.mjs';
import { PUBLIC_PAYMENT_OFFERS } from '../systemia/mcp/public-payment-offers.mjs';

const catalog=loadFabricCatalogFromRepository();

test('only precisely approved, live-in-catalog buying moments become human offer links',()=>{
  assert.equal(APPROVED_BUYER_MOMENTS.length,6);
  const uniqueIds=new Set(APPROVED_BUYER_MOMENTS.map(x=>x.public_id));
  const uniqueSlugs=new Set(APPROVED_BUYER_MOMENTS.map(x=>x.slug));
  assert.equal(uniqueIds.size,6);
  assert.equal(uniqueSlugs.size,6);
  const approved=availableBuyerMoments(catalog);
  assert.equal(approved.length,6);
  const html=renderOffers(catalog);
  assert.match(html,/What is getting in your way\?/);
  assert.ok(html.indexOf('buyer-moments-title')<html.indexOf('All available offers'));
  for(const m of approved){
    assert.match(html,new RegExp('class="moment" href="/offers/'+m.slug+'"'));
    assert.ok(html.includes(m.problem.replaceAll('&','&amp;').replaceAll("'",'&#39;')));
    assert.equal(offerCapabilityForSlug(m.slug,catalog)?.public_id,m.public_id);
    assert.ok(offerPurchaseKeyForSlug(m.slug));
    assert.ok(renderOfferPage(offerCapabilityForSlug(m.slug,catalog)).includes('/api/offers/'+m.slug+'/checkout'));
    // The navigation surface never requests secrets, creates orders or presents checkout as paid.
    assert.doesNotMatch(m.problem,/guaranteed|verified customer|testimonials|buy now/i);
  }
  assert.doesNotMatch(html,/href="https:\/\/findmypart\.base44\.app/);
});

test('missing and held public capabilities never silently route to similarly named approved products',()=>{
  const withoutLegacy=catalog.filter(x=>x.public_id!=='legacy-rescue-lab-v1');
  const eligible=availableBuyerMoments(withoutLegacy);
  assert.ok(!eligible.some(x=>x.slug==='legacy-rescue'));
  assert.ok(eligible.some(x=>x.slug==='payments-pilot'));
  const noPaymentCatalog=availableBuyerMoments([]);
  assert.ok(noPaymentCatalog.some(x=>x.slug==='payments-pilot'),'fixed human payment offer exists');
  assert.ok(!noPaymentCatalog.some(x=>x.slug==='website-audit'),'missing live catalog is not synthesized');
  assert.ok(!noPaymentCatalog.some(x=>x.slug==='legacy-rescue'),'missing live catalog is not synthesized');
});

test('buyer navigation does not change prices, offer keys, checkout posts or payment evidence',()=>{
  const html=renderOffers(catalog);
  for(const slug of ['payments-pilot','browser-diagnosis','ibmi-xray']){
    const item=offerCapabilityForSlug(slug,catalog);
    const fixed=PUBLIC_PAYMENT_OFFERS[slug];
    assert.ok(fixed);
    assert.equal(offerPurchaseKeyForSlug(slug),fixed.offer_key);
    assert.equal(Math.round(item.entry_paid_offer.price_usd_normalized*100),fixed.amount_cents);
    const page=renderOfferPage(item);
    assert.match(page,/name="user_confirmed" value="true"/);
    assert.match(page,/name="customer_ref" type="email"/);
    assert.match(page,/Nothing is marked paid until settlement is verified/);
    assert.match(html,new RegExp('href="/offers/'+slug+'"'));
    assert.doesNotMatch(html,/Payment verified\. Your work is queued\./);
  }
});
