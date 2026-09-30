import assert from 'node:assert/strict';
import fs from 'node:fs';
import { reconcileAliEvMigration } from './aliev-migration-reconciler.mjs';

const inventory=JSON.parse(fs.readFileSync(
  new URL('./aliev-legacy-inventory.json',import.meta.url),
  'utf8'
));

const adapters=[];
const ingests=[];
for(const source of inventory.entities){
  const excluded=source.entity==='EVNationalChargePoint'?2:0;
  const accepted=source.rows-excluded;
  adapters.push({
    schema:'evercraft.aliev.legacy-domain-adapter.v1',
    source_entity:source.entity,
    submitted:source.rows,
    accepted,
    excluded,
  });
  ingests.push({
    source_entity:source.entity,
    submitted:accepted,
    inserted:accepted,
    updated:0,
    stale:0,
    deduped:0,
  });
}

const complete=reconcileAliEvMigration({inventory,adapterReceipts:adapters,ingestReceipts:ingests});
assert.equal(complete.complete,true);
assert.equal(complete.counts.source_rows,31600);
assert.equal(complete.counts.excluded_rows,2);
assert.equal(complete.counts.accepted_rows,31598);
assert.equal(complete.counts.ingested_rows,31598);
assert.equal(complete.counts.blockers,0);

const noTerminal=structuredClone(inventory);
noTerminal.entities.find(x=>x.entity==='EVObservedUsageAggregate').pagination.terminal_exhaustion_verified=false;
const terminalFailure=reconcileAliEvMigration({inventory:noTerminal,adapterReceipts:adapters,ingestReceipts:ingests});
assert.equal(terminalFailure.complete,false);
assert.ok(terminalFailure.blockers.includes('EVObservedUsageAggregate:keyset_terminal_exhaustion_not_verified'));

const missingBatch=reconcileAliEvMigration({
  inventory,
  adapterReceipts:adapters,
  ingestReceipts:ingests.filter(x=>x.source_entity!=='EVOpsTariff')
});
assert.equal(missingBatch.complete,false);
assert.ok(missingBatch.blockers.includes('EVOpsTariff:ingest_receipt_missing'));
assert.ok(missingBatch.blockers.includes('EVOpsTariff:accepted_vs_ingest_submitted_mismatch'));

const partialAdapters=structuredClone(adapters);
partialAdapters.find(x=>x.source_entity==='EVObservedUsageAggregate').submitted=10000;
const partial=reconcileAliEvMigration({inventory,adapterReceipts:partialAdapters,ingestReceipts:ingests});
assert.equal(partial.complete,false);
assert.ok(partial.blockers.includes('EVObservedUsageAggregate:source_vs_adapter_count_mismatch'));
assert.ok(partial.blockers.includes('EVObservedUsageAggregate:accepted_excluded_do_not_reconcile'));

const unsafe=structuredClone(inventory);
const observed=unsafe.entities.find(x=>x.entity==='EVObservedUsageAggregate');
observed.pagination={mode:'offset',page_size:500};
const unsafeResult=reconcileAliEvMigration({inventory:unsafe,adapterReceipts:adapters,ingestReceipts:ingests});
assert.equal(unsafeResult.complete,false);
assert.ok(unsafeResult.blockers.includes('EVObservedUsageAggregate:unsafe_offset_pagination_for_large_table'));

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.aliev.migration-reconciliation-proof.v1',
  inventoried_source_rows:complete.counts.source_rows,
  accepted_rows:complete.counts.accepted_rows,
  excluded_rows:complete.counts.excluded_rows,
  exact_row_accounting_required:true,
  keyset_terminal_exhaustion_required:true,
  large_table_offset_pagination_rejected:true,
  missing_ingest_receipt_blocks_completion:true,
  partial_source_export_blocks_completion:true
},null,2));
