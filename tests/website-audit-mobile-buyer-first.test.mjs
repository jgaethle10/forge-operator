import test from 'node:test';
import assert from 'node:assert/strict';
import {renderOfferPage} from '../systemia/mcp/fabric-public-site.mjs';

const item={
  public_id:'audit-center-website-audit-machine-v1',
  name:'Systemia Website Audit',
  description:'Review a public website for conversion friction.',
  state:'payment_ready',commercial_state:'sell_now',
  pricing:'Free preview. Quick Win Audit $49 one-time. Complete Audit $500 one-time.',
  entry_paid_offer:{name:'Quick Win Audit',price:'$49',price_usd_normalized:49,billing:'one_time'},
};
function assertBuyerFirst(page,cta){
  const title=page.indexOf('See your website through their eyes.');
  const price=page.indexOf('<div class="offer-price">');
  const note=page.indexOf('<div class="offer-price-note">');
  const button=page.indexOf(cta);
  const disclosure=page.indexOf('<details class="audit-more-info">');
  const visual=page.indexOf('<div class="offer-visual">');
  assert.ok(title>0&&title<price&&price<note&&note<button&&button<disclosure&&disclosure<visual,
    'headline, price and action must all precede large illustrative graphic');
  assert.match(page,/<main class="website-audit-mobile-fix">/);
  assert.match(page,/Quick Win Audit · \$49 one-time · five prioritized fixes, no subscription/);
  assert.match(page,/See the example artwork and other audit options/);
  assert.match(page,/Artwork is illustrative, not a finding about your website/);
  assert.match(page,/@media\(max-width:780px\)/);
  assert.match(page,/\.website-audit-mobile-fix \.offer-hero h1/);
}
test('held Website Audit is purchase-first and shows assisted contact, not a broken form',()=>{
  const page=renderOfferPage(item,{checkoutConfigured:false});
  assertBuyerFirst(page,'Request assisted invoicing');
  assert.match(page,/Online checkout is temporarily unavailable/);
  assert.doesNotMatch(page,/action="\/api\/offers\/website-audit\/checkout"/);
  assert.doesNotMatch(page,/Continue to checkout/);
});
test('configured Website Audit keeps exact canonical Evercraft Payments checkout controls',()=>{
  const page=renderOfferPage(item,{checkoutConfigured:true});
  assertBuyerFirst(page,'Continue to checkout');
  assert.match(page,/method="post" action="\/api\/offers\/website-audit\/checkout"/);
  assert.match(page,/name="user_confirmed" value="true"/);
  assert.match(page,/name="idempotency_key"/);
  assert.match(page,/name="customer_ref" type="email"/);
  assert.match(page,/name="website_url" type="url"/);
});
test('other offers retain their original general-purpose layout and checkout state',()=>{
  const other={...item,public_id:'site-survive-rapid-audit-v1',
    name:'Site-Survive Rapid Audit',entry_paid_offer:{name:'Rapid Audit',price:'$250'}};
  const page=renderOfferPage(other,{checkoutConfigured:true});
  assert.doesNotMatch(page,/<main class="website-audit-mobile-fix">/);
  assert.match(page,/method="post" action="\/api\/offers\/site-survive\/checkout"/);
  assert.match(page,/Continue to checkout/);
  const held=renderOfferPage(other,{checkoutConfigured:false});
  assert.match(held,/Request assisted invoicing/);
  assert.doesNotMatch(held,/action="\/api\/offers\/site-survive\/checkout"/);
});
