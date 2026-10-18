import test from 'node:test';
import assert from 'node:assert/strict';
import { PUBLIC_PAYMENT_OFFERS } from '../systemia/mcp/public-payment-offers.mjs';
import { PORTFOLIO_OFFER_COPY, approvedPortfolioOfferCopy } from '../systemia/mcp/portfolio-offer-copy.mjs';
import { offerCapabilityForSlug, offerPurchaseKeyForSlug, renderOfferPage, renderOffers } from '../systemia/mcp/fabric-public-site.mjs';

const six = ['browser-diagnosis','payments-pilot','legacy-xray','ibmi-xray','sign-pilot','towi-evidence'];
test('six existing products get genuinely specific pages while the exact approved SKU stays unchanged', () => {
  const directory=renderOffers([]);
  for(const slug of six) {
    const canonical=PUBLIC_PAYMENT_OFFERS[slug];
    assert.ok(canonical,'Missing approved checkout product '+slug);
    assert.equal(approvedPortfolioOfferCopy(slug,canonical),PORTFOLIO_OFFER_COPY[slug]);
    const item=offerCapabilityForSlug(slug,[]);
    assert.equal(item.public_id,'payment-offer-'+slug);
    assert.equal(offerPurchaseKeyForSlug(slug),canonical.offer_key);
    assert.equal(Math.round(item.entry_paid_offer.price_usd_normalized*100),canonical.amount_cents);
    const copy=PORTFOLIO_OFFER_COPY[slug];
    const html=renderOfferPage(item);
    assert.match(html,new RegExp('/api/offers/'+slug+'/checkout'));
    assert.match(html,/name="user_confirmed" value="true"/);
    assert.match(html,/name="customer_ref" type="email"/);
    assert.match(html,/Continue to checkout/);
    assert.match(html,/Nothing is marked paid until settlement is verified/);
    assert.ok(html.includes(copy.eyebrow));
    assert.ok(html.includes(copy.headline.replaceAll('&','&amp;').replaceAll("'",'&#39;')));
    for (const section of ['What you are buying','What you send us','What you get back','How it works']) assert.ok(html.includes(section),slug+': '+section);
    assert.ok(directory.includes('/offers/'+slug),slug);
    assert.ok(directory.includes(copy.headline.replaceAll('&','&amp;').replaceAll("'",'&#39;')),slug+': directory title');
    assert.ok(html.includes('$'+canonical.amount_cents/100),slug+': fixed price');
    assert.ok(copy.send.length>=3 && copy.get.length>=3 && copy.steps.length===3);
    assert.ok(copy.promise.length>35,'specific scope too thin');
    assert.doesNotMatch(html,/The scope and supporting information requested during intake/i);
    assert.doesNotMatch(html,/The bounded deliverable described in the approved offer/i);
    assert.doesNotMatch(copy.lede,/guaranteed increase in sales|automatic production launch/i);
  }
});
test('scope copy never confers authority to run an agent, handle secrets or mark payments fulfilled', () => {
  for(const slug of six) {
    const offer=PUBLIC_PAYMENT_OFFERS[slug];
    const page=renderOfferPage(offerCapabilityForSlug(slug,[]));
    assert.doesNotMatch(page,/type="password"/);
    assert.doesNotMatch(page,/name="sk_live_"/);
    assert.match(page,/Evercraft Payments prepares the checkout/);
    assert.match(page,/Nothing is marked paid until settlement is verified/);
    assert.equal(approvedPortfolioOfferCopy(slug,{...offer,currency:'eur'}),null);
    assert.equal(approvedPortfolioOfferCopy(slug,{...offer,amount_cents:0}),null);
    assert.equal(approvedPortfolioOfferCopy(slug,{...offer,amount_cents:offer.amount_cents+1}),null);
    assert.equal(approvedPortfolioOfferCopy(slug,{...offer,offer_key:'unapproved.'+offer.offer_key}),null);
  }
  assert.equal(approvedPortfolioOfferCopy('rivet',{currency:'usd',amount_cents:1000,offer_key:'invented'}),null);
});
test('the other existing ten-offer group and five native specialist pages are not re-priced or remapped',()=>{
  assert.equal(Object.keys(PORTFOLIO_OFFER_COPY).length,6);
  for(const slug of ['workflow-xray','part-deep','part-rescue','event-boost']) {
    const approved=PUBLIC_PAYMENT_OFFERS[slug];
    assert.ok(offerCapabilityForSlug(slug,[]));
    assert.equal(approvedPortfolioOfferCopy(slug,approved),null);
    assert.equal(offerPurchaseKeyForSlug(slug),approved.offer_key);
    assert.ok(renderOfferPage(offerCapabilityForSlug(slug,[])).includes('$'+approved.amount_cents/100));
  }
});
