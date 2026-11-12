import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const parse=path=>JSON.parse(read(path));
const root='public/mesh/checkout-ready/social-media-weekly/';
const review=parse('docs/branding/approvals/BR-001-name-exploration-v1.json');
const ledger=parse('docs/branding/approvals/ledger.json');
const events=parse('docs/branding/approvals/events.json');
const product=parse(root+'product.json');
const brand=parse(root+'brand.json');
const verified=parse('public/mesh/checkout-ready/verified-links.json');
const html=read(root+'brand-review/index.html');

test('three alternative creative directions are versioned without becoming approved names',()=>{
 assert.equal(review.packet,'BR-001');
 assert.equal(review.explicit_founder_approval,false);
 assert.equal(review.approved_candidate,null);
 assert.equal(review.candidates.length,3);
 assert.deepEqual(review.candidates.map(c=>c.name),['Weekkin','Cadencekeep','Weekmorrow']);
 assert.ok(review.excluded.some(e=>e.name==='The Weekly Signal'));
 assert.ok(review.excluded.length>=5);
 const marks=new Set(),purposes=new Set(),colors=new Set();
 for(const item of review.candidates){
  assert.equal(item.screening.trademark_cleared,false);
  assert.equal(item.screening.domain_verified,false);
  assert.equal(item.screening.legal_clearance,'not_performed');
  assert.ok(item.story.length>100);
  assert.ok(item.purpose.length>50);
  assert.ok(item.risk.length>50);
  assert.ok(item.visual.length>40);
  assert.ok(item.mark.length>25);
  assert.ok(!marks.has(item.mark));marks.add(item.mark);
  assert.ok(!colors.has(item.color.bg+'|'+item.color.accent));colors.add(item.color.bg+'|'+item.color.accent);
  assert.ok(!purposes.has(item.purpose));purposes.add(item.purpose);
  assert.ok(html.includes(item.name));
  assert.ok(html.includes(item.purpose));
  assert.ok(html.includes(item.story));
 }
 assert.equal(marks.size,3);
 assert.equal(colors.size,3);
 assert.equal(purposes.size,3);
 assert.match(html,/name="robots" content="noindex,nofollow,noarchive"/);
 assert.equal((html.match(/class="concept variant-/g)||[]).length,3);
 assert.equal((html.match(/https:\/\/buy\.stripe\.com/g)||[]).length,0);
 assert.ok(html.includes('NOT APPROVED'));
});

test('review remains at brand 01 and the original $100 commercial product is unchanged',()=>{
 const first=ledger.products[0];
 assert.equal(ledger.founder_reviews_approved,0);
 assert.equal(first.decision.status,'awaiting_founder_review');
 assert.equal(first.decision.approved,false);
 assert.equal(first.exploration.state,'unapproved_concept_comparison');
 assert.equal(first.exploration.founder_selected_candidate,null);
 assert.equal(ledger.products.slice(1).every(p=>p.decision.status==='not_reviewed'),true);
 assert.equal(brand.imprint,'The Weekly Signal');
 assert.equal(brand.governance.founder_approved,false);
 assert.equal(product.identity.founder_approved,false);
 assert.equal(product.checkout.url,verified.links.find(x=>x.key==='weekly-social').url);
 assert.equal(product.price_usd,100);
 assert.equal(product.exact_checkout_product,'Social Media Management · Weekly');
 assert.equal(events.founder_decision_events,0);
 assert.ok(events.entries.some(e=>e.event_id==='BR-001-E004'&&e.founder_decision===false));
 const originalProductPage=read(root+'index.html');
 assert.ok(originalProductPage.includes(product.checkout.url));
 assert.ok(originalProductPage.includes('$100'));
});
