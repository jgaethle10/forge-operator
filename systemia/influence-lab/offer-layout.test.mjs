import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderOfferPage} from '../mcp/fabric-public-site.mjs';

const fixture={
  public_id:'audit-center-website-audit-machine-v1',
  name:'Systemia Website Audit',
  pricing:'Free preview. Quick Win Audit $49 one-time. Complete Audit $500 one-time.',
  entry_paid_offer:{name:'Quick Win Audit',price:'$49',price_usd_normalized:49,billing:'one_time'},
};

test('public Website Audit uses a self-contained human editorial page, no fictional diagnosis',()=>{
  const html=renderOfferPage(fixture);
  assert.match(html,/<main class="audit-editorial">/);
  assert.match(html,/See your website/);
  assert.match(html,/through their eyes/);
  assert.match(html,/Public pages only/);
  assert.match(html,/Five priority fixes/);
  assert.match(html,/Illustrative/);
  assert.match(html,/We do not claim access to your private analytics or guarantee more customers/);
  assert.doesNotMatch(html,/Over [0-9,]+ happy customers|Guaranteed [0-9]+%/i);
  assert.doesNotMatch(html,/<!--.*PLACEHOLDER/);
});

test('first-screen price, scope and checkout follow one semantic reading path',()=>{
  const html=renderOfferPage(fixture);
  const title=html.indexOf('id="audit-title"');
  const price=html.indexOf('<div class="audit-card-price">');
  const form=html.indexOf('<form class="checkout-form audit-checkout"');
  const illustrative=html.indexOf('<div class="audit-journey"');
  assert.ok(title>0&&title<price&&price<form&&form<illustrative);
  assert.match(html,/No subscription/);
  assert.match(html,/No mystery deliverables/i);
  assert.match(html,/Other audit options and pricing/);
  assert.match(html,/Complete Audit \$500 one-time/);
  assert.match(html,/You are not charged by this form/);
});

test('actual payment routing and human confirmation contract remains unchanged',()=>{
  const html=renderOfferPage(fixture);
  assert.match(html,/method="post" action="\/api\/offers\/website-audit\/checkout"/);
  assert.match(html,/name="user_confirmed" value="true"/);
  assert.match(html,/name="idempotency_key"/);
  assert.match(html,/name="customer_ref" type="email"/);
  assert.match(html,/name="website_url" type="url"/);
  assert.match(html,/Continue to checkout · \$49/);
  assert.doesNotMatch(html,/fetch\(["']\/api\/offers\/website-audit\/checkout/);
});

test('responsive design has accessible focus, no motion requirement and one target-specific style scope',()=>{
  const html=renderOfferPage(fixture);
  assert.match(html,/\.audit-editorial h1\{/);
  assert.match(html,/@media\(max-width:900px\)/);
  assert.match(html,/@media\(max-width:540px\)/);
  assert.match(html,/prefers-reduced-motion:reduce/);
  assert.match(html,/\.audit-editorial \.audit-cta:focus-visible/);
  assert.match(html,/aria-labelledby="audit-title"/);
  assert.match(html,/autocomplete="email"/);
  assert.match(html,/autocomplete="url"/);
});

test('social artwork is an original scoped SVG, not a simulated result',()=>{
  const html=renderOfferPage(fixture);
  assert.match(html,/property="og:image" content="https:\/\/fabric\.systemiacommandcenters\.com\/visuals\/website-audit-attention\/offer-og-v2\.svg"/);
  const file=new URL('../../public/visuals/website-audit-attention/offer-og-v2.svg',import.meta.url);
  const svg=fs.readFileSync(file,'utf8');
  assert.match(svg,/<svg /);
  assert.match(svg,/Illustrative design/);
  assert.match(svg,/Quick Win · \$49/);
  assert.doesNotMatch(svg,/customer rating|five-star/i);
});

test('other offers keep the original generic page layout and payment rail',()=>{
  const ibmi={
    public_id:'ibmi-rescue-v1',name:'IBM i Rescue',
    pricing:'IBM i Estate X-Ray $299 one-time',
    entry_paid_offer:{name:'IBM i Estate X-Ray',price:'$299',price_usd_normalized:299},
  };
  const html=renderOfferPage(ibmi);
  assert.doesNotMatch(html,/<main class="audit-editorial">/);
  assert.match(html,/action="\/api\/offers\/ibmi-rescue\/checkout"/);
  assert.match(html,/name="user_confirmed" value="true"/);
});
