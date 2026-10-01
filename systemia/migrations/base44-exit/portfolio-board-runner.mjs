#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { buildEvacuationPlan, assertNoSecretValues } from './factory/contract.mjs';
import { buildPortfolioMigrationBoard, assertPortfolioBoardPrivacy } from './portfolio-board.mjs';

function arg(name,fallback=''){
  const i=process.argv.indexOf(name);
  return i>=0?process.argv[i+1]||fallback:fallback;
}
function readJson(file){
  return JSON.parse(fs.readFileSync(path.resolve(file),'utf8'));
}
function rows(payload){
  if(Array.isArray(payload)) return payload;
  return payload?.apps||payload?.items||payload?.products||[];
}

const inventoryPath=arg('--inventory');
if(!inventoryPath) throw new Error('private_inventory_path_required');
const snapshotPath=arg('--snapshot','systemia/migrations/base44-exit/estate-snapshot.json');
const policyPath=arg('--policy','systemia/migrations/base44-exit/policy.json');
const aliasesPath=arg('--aliases','');
const outputPath=path.resolve(arg('--out','artifacts/base44-exit/portfolio-board.latest.json'));

const inventory=rows(readJson(inventoryPath));
const snapshot=readJson(snapshotPath);
const policy=readJson(policyPath);
const aliases=aliasesPath?readJson(aliasesPath):[];
const aliasReceipts=Array.isArray(aliases)?aliases:(aliases.alias_receipts||[]);

const plans=inventory.map(buildEvacuationPlan);
const board=buildPortfolioMigrationBoard({
  plans,
  queue:snapshot.queue||[],
  policy,
  aliasReceipts
});
assertNoSecretValues(board);
assertPortfolioBoardPrivacy(board);

fs.mkdirSync(path.dirname(outputPath),{recursive:true});
fs.writeFileSync(outputPath,JSON.stringify(board,null,2)+'\n',{mode:0o600});

console.log(JSON.stringify({
  schema:'evercraft.base44.portfolio-migration-board-run.v1',
  output:outputPath,
  plans:board.counts.plans,
  queued_matches:board.counts.queued_matches,
  unqueued_private_sources:board.counts.unqueued_private_sources,
  cutover_ready:board.counts.cutover_ready,
  blocked:board.counts.blocked,
  top_shared_work:board.shared_work_queue.slice(0,10),
  raw_source_ids_emitted:false,
  unmatched_source_names_emitted:false
},null,2));
