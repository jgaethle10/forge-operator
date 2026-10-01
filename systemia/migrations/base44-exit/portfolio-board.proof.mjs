#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildEvacuationPlan } from './factory/contract.mjs';
import { buildPortfolioMigrationBoard, assertPortfolioBoardPrivacy } from './portfolio-board.mjs';

const plans=[
  buildEvacuationPlan({
    id:'synthetic-command-id',
    name:'Systemia Command Center',
    entity_count:8,
    auth:true,
    function_count:4
  }),
  buildEvacuationPlan({
    id:'synthetic-findmypart-id',
    name:'FindMyPart AI',
    entity_count:3,
    function_count:2
  }),
  buildEvacuationPlan({
    id:'synthetic-private-id',
    name:'Secret Prototype 77',
    entity_count:2,
    connectors:['Gmail'],
    webhooks:['provider-event'],
    storage:true
  })
];

const queue=[
  {product:'Systemia Command Center',wave:1,role:'core',state:'extract_first'},
  {product:'FindMyPart',wave:3,role:'revenue',state:'queued'}
];

const policy={
  landing_implementations:{
    app_fabric_compatibility:{state:'owned_baseline_proved_local'},
    public_edge:{state:'owned'},
    portfolio_sentinel:{state:'owned'},
    yard_runtime:{state:'owned'},
    canonical_data:{state:'owned_baseline_proved_local'},
    identity_boundary:{state:'owned_baseline_proved_local'},
    secret_store:{state:'owned_baseline_proved_local'},
    connector_gateway:{state:'missing'},
    webhook_gateway:{state:'missing'},
    object_storage:{state:'missing'}
  }
};

const board=buildPortfolioMigrationBoard({
  plans,
  queue,
  policy,
  aliasReceipts:[{
    source_name:'FindMyPart AI',
    queue_product:'FindMyPart',
    authority_receipt_ref:'proof:alias:findmypart'
  }]
});

assert.equal(board.counts.plans,3);
assert.equal(board.counts.queued_matches,2);
assert.equal(board.counts.unqueued_private_sources,1);
assert.equal(board.apps.find((row)=>row.queue_product==='FindMyPart').match_mode,'authorized_alias');
assert.equal(board.apps.find((row)=>row.queue_product==='FindMyPart').queue_wave,3);

const privateRow=board.apps.find((row)=>!row.queue_product);
assert.ok(privateRow);
assert.equal(privateRow.source_name_emitted,false);
assert.ok(privateRow.missing_shared_targets.includes('connector_gateway'));
assert.ok(privateRow.missing_shared_targets.includes('webhook_gateway'));
assert.ok(privateRow.missing_shared_targets.includes('object_storage'));
assert.equal(board.missing_shared_target_counts.connector_gateway,1);
assert.ok(board.shared_work_queue.some((row)=>row.kind==='shared_target_missing'&&row.key==='connector_gateway'));

const serialized=JSON.stringify(board);
assert.equal(serialized.includes('synthetic-command-id'),false);
assert.equal(serialized.includes('synthetic-findmypart-id'),false);
assert.equal(serialized.includes('synthetic-private-id'),false);
assert.equal(serialized.includes('Secret Prototype 77'),false);
assert.equal(serialized.includes('FindMyPart AI'),false);
assert.equal(board.authority.traffic_cutover,false);
assert.equal(board.authority.source_decommission,false);
assertPortfolioBoardPrivacy(board);

console.log(JSON.stringify({
  schema:'evercraft.base44.portfolio-migration-board-proof.v1',
  status:'pass',
  queue_matches:board.counts.queued_matches,
  unmatched_private_sources_redacted:true,
  alias_receipts_required:true,
  shared_missing_targets_visible:true,
  per_wave_blockers_visible:true,
  cutover_authority:false
}));
