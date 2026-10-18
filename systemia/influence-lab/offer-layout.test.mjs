import test from 'node:test';
import assert from 'node:assert/strict';
import {renderOfferPage} from '../mcp/fabric-public-site.mjs';

const fixture={
  public_id:'audit-center-website-audit-machine-v1',
  name:'Systemia Website Audit',
  pricing:'Free preview. Quick Win Audit $49 one-time. Complete Audit $500 one-time.',
  entry_paid_offer:{name:'Quick Win Audit',price:'$49',price_usd_normalized:49,billing:'one_time'},
};
test('Website Audit moves price and buy form ahead of promotional art in semantic reading order',()=>{
  const html=renderOfferPage(fixture);
  assert.match(html,/<main class="offer-purchase-page">/);
  assert.match(html,/<div class="offer-hero-layout"><div class="offer-buy">/);
  const priceIndex=html.indexOf('<div class="offer-price">');
  const formIndex=html.indexOf('<form class="checkout-form"');
  const visualIndex=html.indexOf('<div class="offer-visual">');
  assert.ok(priceIndex>0&&priceIndex<formIndex&&formIndex<visualIndex);
  assert.match(html,/Paid delivery follows verified settlement/);
  assert.match(html,/<details class="offer-pricing-details">/);
  assert.match(html,/Compare audit options/);
  assert.match(html,/Complete Audit \$500 one-time/);
  assert.match(html,/Illustrative website audit concept, not a finding about your business/);
  assert.match(html,/action="\/api\/offers\/website-audit\/checkout"/);
  assert.match(html,/name="user_confirmed" value="true"/);
  assert.match(html,/type="email"/);
  assert.match(html,/type="url"/);
  assert.match(html,/Continue to checkout · \$49/);
});
test('new compact layout styles remain scoped to purchase-page, not global campaigns',()=>{
  const html=renderOfferPage(fixture);
  assert.match(html,/\.offer-purchase-page \.offer-hero h1\{/);
  assert.match(html,/\.offer-purchase-page \.checkout-form input\{/);
  assert.match(html,/@media\(max-width:780px\)/);
  assert.match(html,/grid-template-columns:minmax\(0,1fr\)/);
});
test('other offer pages remain in default offer page grammar',()=>{
  const ibmi={
    public_id:'ibmi-rescue-v1',
    name:'IBM i Rescue',
    pricing:'IBM i Estate X-Ray $299 one-time',
    entry_paid_offer:{name:'IBM i Estate X-Ray',price:'$299',price_usd_normalized:299},
  };
  const html=renderOfferPage(ibmi);
  assert.doesNotMatch(html,/<main class="offer-purchase-page">/);
  assert.doesNotMatch(html,/Compare audit options/);
  assert.match(html,/action="\/api\/offers\/ibmi-rescue\/checkout"/);
});
