#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { reconcileEstateCoverage, assertEstateCoveragePrivacy } from './estate-coverage.mjs';

function arg(name){
  const i=process.argv.indexOf(name);
  return i>=0?process.argv[i+1]:'';
}

const inventoryPath=arg('--inventory');
const snapshotPath=arg('--snapshot')||path.resolve('systemia/migrations/base44-exit/estate-snapshot.json');
const aliasesPath=arg('--aliases');
const outputPath=arg('--output')||path.resolve('artifacts/base44-exit/estate-coverage.latest.json');
const listingLimit=Math.max(1,Number(arg('--listing-limit')||100));

if(!inventoryPath) throw new Error('private_inventory_path_required');

const inventory=JSON.parse(fs.readFileSync(path.resolve(inventoryPath),'utf8'));
const snapshot=JSON.parse(fs.readFileSync(path.resolve(snapshotPath),'utf8'));
const aliases=aliasesPath?JSON.parse(fs.readFileSync(path.resolve(aliasesPath),'utf8')):[];

const apps=Array.isArray(inventory)?inventory:(inventory.apps||[]);
const coverage=reconcileEstateCoverage({
  apps,
  queue:snapshot.queue||[],
  listingLimit,
  aliasReceipts:Array.isArray(aliases)?aliases:(aliases.alias_receipts||[])
});
assertEstateCoveragePrivacy(coverage);

fs.mkdirSync(path.dirname(outputPath),{recursive:true});
fs.writeFileSync(outputPath,JSON.stringify(coverage,null,2)+'\n',{mode:0o600});

console.log(JSON.stringify({
  schema:'evercraft.base44.estate-coverage-run.v1',
  output:path.resolve(outputPath),
  observed_apps:coverage.counts.observed_apps,
  listing_ceiling_hit:coverage.listing_ceiling_hit,
  inventory_complete_proven:coverage.inventory_complete_proven,
  matched_observed_apps:coverage.counts.matched_observed_apps,
  unqueued_observed_apps:coverage.counts.unqueued_observed_apps,
  untitled_observed_apps:coverage.counts.untitled_observed_apps,
  raw_source_ids_emitted:false,
  unmatched_source_names_emitted:false
},null,2));
