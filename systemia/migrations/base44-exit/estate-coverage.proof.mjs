#!/usr/bin/env node
import assert from 'node:assert/strict';
import { reconcileEstateCoverage, assertEstateCoveragePrivacy } from './estate-coverage.mjs';

const apps=[];
for(let i=0;i<100;i+=1){
  apps.push({
    id:'synthetic-source-id-'+String(i).padStart(3,'0'),
    name:i<10?'Untitled':'Private App '+i,
    git_remote_source:'s3'
  });
}
apps[10].name='Systemia Command Center';
apps[11].name='Evercraft AI Suite';
apps[12].name='RIVET';
apps[13].name='FindMyPart AI';
apps[14].name='Duplicate Private';
apps[15].name='Duplicate Private';

const queue=[
  {product:'Systemia Command Center',wave:1},
  {product:'Evercraft AI Suite',wave:2},
  {product:'RIVET',wave:3},
  {product:'FindMyPart',wave:3},
  {product:'Never Seen Product',wave:7}
];

const coverage=reconcileEstateCoverage({
  apps,
  queue,
  listingLimit:100,
  aliasReceipts:[{
    source_name:'FindMyPart AI',
    queue_product:'FindMyPart',
    authority_receipt_ref:'proof:alias:findmypart:001'
  }]
});

assert.equal(coverage.counts.observed_apps,100);
assert.equal(coverage.listing_ceiling_hit,true);
assert.equal(coverage.inventory_complete_proven,false);
assert.equal(coverage.counts.untitled_observed_apps,10);
assert.equal(coverage.counts.matched_observed_apps,4);
assert.equal(coverage.counts.unqueued_observed_apps,86);
assert.equal(coverage.counts.queue_products_observed_exactly_once,4);
assert.equal(coverage.counts.queue_products_not_observed_on_current_page,1);
assert.equal(coverage.counts.queue_products_with_ambiguous_sources,0);
assert.equal(coverage.source_types.s3,100);
assert.match(coverage.page_fingerprint,/^sha256:[a-f0-9]{64}$/);

const command=coverage.queue_coverage.find((row)=>row.product==='Systemia Command Center');
assert.equal(command.state,'observed_exactly_once');
const findMyPart=coverage.observed.find((row)=>row.queue_product==='FindMyPart');
assert.equal(findMyPart.match_mode,'authorized_alias');
assert.equal(findMyPart.alias_authority_receipt_ref,'proof:alias:findmypart:001');

const untitled=coverage.observed.filter((row)=>row.untitled);
assert.equal(untitled.length,10);
assert.ok(untitled.every((row)=>row.disposition==='classify_before_migrate'));
assert.ok(untitled.every((row)=>row.queue_product===null));

const serialized=JSON.stringify(coverage);
for(let i=0;i<100;i+=1){
  assert.equal(serialized.includes('synthetic-source-id-'+String(i).padStart(3,'0')),false);
}
assert.equal(serialized.includes('Private App 99'),false);
assert.equal(serialized.includes('Duplicate Private'),false);
assert.equal(serialized.includes('FindMyPart AI'),false);
assert.equal(coverage.duplicate_normalized_name_groups.length,2);
assert.ok(coverage.duplicate_normalized_name_groups.some((row)=>row.normalized_name==='Untitled'));
assert.ok(coverage.duplicate_normalized_name_groups.some((row)=>row.normalized_name===null));
assertEstateCoveragePrivacy(coverage);

assert.throws(
  ()=>reconcileEstateCoverage({
    apps:[{id:'dup',name:'A'},{id:'dup',name:'B'}],
    queue:[]
  }),
  /estate_coverage_duplicate_source_id/
);

assert.throws(
  ()=>reconcileEstateCoverage({
    apps:[{id:'one',name:'Alias Source'}],
    queue:[{product:'Known Product',wave:1}],
    aliasReceipts:[{
      source_name:'Alias Source',
      queue_product:'Not In Queue',
      authority_receipt_ref:'proof:alias:bad'
    }]
  }),
  /estate_coverage_alias_target_not_in_queue/
);

console.log(JSON.stringify({
  schema:'evercraft.base44.estate-coverage-proof.v1',
  status:'pass',
  observed_apps:coverage.counts.observed_apps,
  listing_ceiling_hit:true,
  inventory_complete_proven:false,
  untitled_classification_required:true,
  unmatched_names_redacted:true,
  raw_source_ids_redacted:true,
  aliases_require_authority_receipts:true,
  duplicate_sources_rejected:true,
  cutover_authority:false
}));
