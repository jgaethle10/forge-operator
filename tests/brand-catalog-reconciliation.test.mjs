import test from 'node:test';
import assert from 'node:assert/strict';
import {loadInputs,reconcileCatalog,markdownReport} from '../scripts/brand/reconcile-product-catalog.mjs';

function fresh(){return structuredClone(loadInputs());}

test('Oct 14 public directory reconciles into review-only categories',()=>{
 const r=reconcileCatalog(fresh());
 assert.equal(r.source_updated_at,'2026-10-14');
 assert.deepEqual(r.counts,{
  primary_directory:69,public_product_index:69,agent_registry:45,
  brand_workstreams:20,linked_review:12,restricted_hold:2,requires_brand_review:55
 });
 assert.equal(r.publication_approved,false);
 assert.equal(r.products.every(x=>x.launch_approved===false&&x.payment_verified===false),true);
 assert.equal(r.products.find(x=>x.product_key==='evercraft-network')?.brand_workstream,'evercraft-network');
 assert.equal(r.products.find(x=>x.product_key==='findmypart')?.brand_workstream,'findmypart');
 assert.equal(r.products.find(x=>x.product_key==='forensiscope')?.brand_workstream,'forensiscope');
 assert.equal(r.products.find(x=>x.product_key==='aliev')?.review_status,'restricted_hold');
 assert.equal(r.products.find(x=>x.product_key==='skyops-parking')?.review_status,'restricted_hold');
 assert.equal(r.products.filter(x=>x.review_status!=='restricted_hold').some(x=>/aliev|skyops|rivet/.test(x.product_key)),false);
 const md=markdownReport(r);
 assert.match(md,/69/);
 assert.match(md,/Not a public launch list/);
});

test('the raw catalog must not automatically approve another brand',()=>{
 const input=fresh();
 const row=input.crosswalk.mappings.find(x=>x.workstream_key==='evercraft-network');
 row.members.push({catalog_key:'roasted',relationship:'canonical_brand'});
 const r=reconcileCatalog(input);
 assert.equal(r.products.find(x=>x.product_key==='roasted')?.launch_approved,false);
 assert.equal(r.products.find(x=>x.product_key==='roasted')?.payment_verified,false);
});

test('partner-held entries cannot be mapped into public brand candidates',()=>{
 const input=fresh();
 input.crosswalk.mappings.find(x=>x.workstream_key==='evercraft-network').members.push({catalog_key:'aliev',relationship:'canonical_brand'});
 assert.throws(()=>reconcileCatalog(input),/Restricted catalog key/);
});

test('crosswalk rejects duplicate and fabricated product relationships',()=>{
 const dup=fresh();
 dup.crosswalk.mappings.find(x=>x.workstream_key==='findmypart').members.push({catalog_key:'evercraft-network',relationship:'canonical_brand'});
 assert.throws(()=>reconcileCatalog(dup),/mapped twice/);
 const phantom=fresh();
 phantom.crosswalk.mappings.find(x=>x.workstream_key==='findmypart').members.push({catalog_key:'imaginary-product',relationship:'canonical_brand'});
 assert.throws(()=>reconcileCatalog(phantom),/not in primary source/);
});

test('the review manifest must cover all workstreams, but never authorize publication',()=>{
 const missing=fresh();
 missing.crosswalk.mappings.pop();
 assert.throws(()=>reconcileCatalog(missing),/Unmapped workstream families/);
 const released=fresh();
 released.crosswalk.publication_approved=true;
 assert.throws(()=>reconcileCatalog(released),/internal-only review manifest/);
});

test('name and key drift is surfaced explicitly, never silently combined',()=>{
 const inputs=fresh();
 inputs.index.products.find(x=>x.product_key==='evercraft-network').name='Another Network';
 inputs.index.products.push({...inputs.index.products[0],product_key:'not-in-primary'});
 const r=reconcileCatalog(inputs);
 assert.deepEqual(r.drift.name_conflicts,['evercraft-network']);
 assert.deepEqual(r.drift.secondary_missing_from_directory,['not-in-primary']);
 assert.equal(r.products.length,69);
});
