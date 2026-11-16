import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const parse=path=>JSON.parse(read(path));
const base='public/mesh/checkout-ready/';
const ledger=parse('docs/branding/approvals/ledger.json');
const events=parse('docs/branding/approvals/events.json');
const portfolio=parse(base+'products.json');
const original=parse(base+'verified-links.json');

test('seven brand approvals are independent, ordered and backed by a source revision',()=>{
 assert.equal(ledger.schema,'evercraft.brand-approval-ledger.v1');
 assert.equal(ledger.products.length,7);
 assert.equal(portfolio.products.length,7);
 assert.equal(ledger.current_review_order>=1&&ledger.current_review_order<=7,true);
 const ids=new Set(),revisions=new Set();
 let pendingReview=0,approvedCount=0;
 for(let i=0;i<ledger.products.length;i++){
  const p=ledger.products[i];
  const exact=portfolio.products[i],product=parse(base+p.slug+'/product.json'),brand=parse(base+p.slug+'/brand.json');
  const sku=original.links.find(x=>x.key===product.sku_key);
  assert.equal(p.order,i+1);
  assert.ok(!ids.has(p.product_id),'duplicate product');
  ids.add(p.product_id);
  assert.equal(p.product_id,exact.product_id);
  assert.equal(p.product_id,product.product_id);
  assert.equal(p.working_imprint,brand.imprint);
  assert.equal(exact.price_usd,sku.amount_cents/100);
  assert.equal(product.checkout.url,sku.url);
  assert.equal(product.checkout.payment_link_id,sku.payment_link_id);
  assert.equal(product.checkout.stripe_price_id,sku.stripe_price_id);
  assert.match(p.proposal.source_blob_sha,/^[a-f0-9]{40}$/);
  assert.equal(p.proposal.source_path,base+p.slug+'/brand.json');
  assert.ok(!revisions.has(p.proposal.source_blob_sha),'accidental duplicate review revision');
  revisions.add(p.proposal.source_blob_sha);
  assert.ok(ledger.allowed_decision_statuses.includes(p.decision.status));
  assert.equal(brand.governance.founder_review_status,p.decision.status);
  assert.equal(product.identity.founder_review_status,p.decision.status);
  assert.equal(exact.founder_review_status,p.decision.status);
  if(p.decision.status==='awaiting_founder_review'){
   pendingReview++;
   assert.equal(p.order,ledger.current_review_order);
   assert.ok(p.review_packet);
   assert.match(read(p.review_packet),/AWAITING FOUNDER DECISION/);
  }
  if(p.decision.status==='approved_direction'){
   approvedCount++;
   assert.equal(p.decision.approved,true);
   assert.equal(brand.governance.founder_approved,true);
   assert.equal(product.identity.founder_approved,true);
   assert.equal(exact.founder_brand_approval,'approved_direction');
   assert.ok(p.decision.approval_quote?.trim().length>=8,'missing verbatim approval');
   assert.ok(p.decision.reviewed_by?.trim(),'founder identity missing');
   assert.ok(p.decision.decision_date?.trim(),'decision date missing');
   assert.ok(p.decision.evidence_reference?.trim(),'missing source evidence');
   assert.ok(p.decision.accepted_dimensions?.length>0,'dimensions not specified');
  }else{
   assert.equal(p.decision.approved,false,'pending/rejected brand marked approved');
   assert.equal(brand.governance.founder_approved,false);
   assert.equal(product.identity.founder_approved,false);
   assert.equal(exact.founder_brand_approval,'not_approved');
   assert.equal(product.identity.brand_identity_is_final,false);
  }
 }
 assert.ok(pendingReview<=1,'multiple founder review sessions opened');
 assert.equal(ledger.founder_reviews_approved,approvedCount);
 assert.equal(portfolio.brand_governance.founder_approved_count,approvedCount);
 assert.equal(portfolio.brand_governance.existing_exact_sku_checkout_marketing_unchanged,true);
 assert.equal(original.commercial_marketing_state,'sell_now_exact_sku_scoped_services');
});

test('results ledger cannot claim a decision without a matching append-only evidence event',()=>{
 assert.equal(events.schema,'evercraft.brand-review-events.v1');
 const ids=new Set();
 const decisions=events.entries.filter(e=>e.event_type==='founder_decision');
 assert.equal(events.founder_decision_events,decisions.length);
 for(const event of events.entries){
  assert.ok(!ids.has(event.event_id),'duplicate audit event');
  ids.add(event.event_id);
  assert.ok(ledger.products.some(p=>p.product_id===event.product_id));
  assert.ok(event.date,'missing audit date');
 }
 for(const p of ledger.products){
  if(p.decision.status==='approved_direction'){
   assert.ok(decisions.some(e=>e.product_id===p.product_id&&e.proposal_version===p.proposal.version&&e.founder_decision===true&&e.approval_quote===p.decision.approval_quote),'approval lacks preserved founder decision event');
  }
 }
 assert.ok(read('docs/branding/approvals/README.md').includes('one'));
 assert.ok(read('docs/branding/approvals/DECISION-RESULT-TEMPLATE.md').includes('Exact words of founder decision'));
});
