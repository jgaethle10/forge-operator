const clean=(v)=>String(v??'').trim();
const asInt=(v)=>{const n=Number(v);return Number.isInteger(n)&&n>=0?n:null;};

export function reconcileForensicRecordMigration({
  inventory,
  migrationReceipt,
  corpusHealth
}={}){
  if(inventory?.schema!=='evercraft.forensic-record.legacy-inventory.v1') throw new Error('forensic_legacy_inventory_required');
  if(migrationReceipt?.schema!=='evercraft.forensic-record.streaming-migration-receipt.v1') throw new Error('forensic_migration_receipt_required');
  if(corpusHealth?.schema!=='evercraft.forensic-record.corpus-health.v1') throw new Error('forensic_corpus_health_required');

  const migrated=new Map(Object.entries(migrationReceipt.entities||{}));
  const rows=[];
  const blockers=[];
  let sourceRows=0,acceptedRows=0,excludedRows=0,ingestedRows=0;

  for(const source of inventory.entities||[]){
    const entity=clean(source.entity);
    const m=migrated.get(entity);
    if(!m){
      blockers.push(entity+':migration_entity_missing');
      rows.push({entity,state:'blocked'});
      continue;
    }
    const sourceCount=asInt(m.source_rows);
    const accepted=asInt(m.accepted_rows);
    const excluded=asInt(m.excluded_rows);
    const ingested=asInt(m.ingest_submitted);
    if([sourceCount,accepted,excluded,ingested].some(x=>x===null)){
      blockers.push(entity+':migration_counts_invalid');
      rows.push({entity,state:'blocked'});
      continue;
    }
    if(m.exhausted!==true) blockers.push(entity+':terminal_exhaustion_not_verified');
    if(sourceCount!==accepted+excluded) blockers.push(entity+':source_accounting_mismatch');
    if(accepted!==ingested) blockers.push(entity+':accepted_ingest_mismatch');

    let countResolution='terminal_extraction';
    if(source.count_state==='exact'){
      if(asInt(source.rows)!==sourceCount) blockers.push(entity+':preflight_source_count_mismatch');
      countResolution='exact_preflight_plus_terminal_extraction';
    } else if(source.count_state==='conflicted'){
      const observed=[asInt(source.production_connector_rows),asInt(source.app_sdk_shell_rows)].filter(x=>x!==null);
      if(observed.length&&observed.every(x=>x!==sourceCount)){
        blockers.push(entity+':terminal_extraction_matches_neither_observation');
      }
      countResolution='production_surface_conflict_resolved_by_terminal_extraction';
    } else if(source.count_state==='conflicted_lower_bound'){
      const lower=asInt(source.production_connector_rows_at_least);
      if(lower!==null&&sourceCount<lower) blockers.push(entity+':terminal_extraction_below_observed_lower_bound');
      countResolution='production_surface_conflict_and_lower_bound_resolved_by_terminal_extraction';
    } else {
      blockers.push(entity+':inventory_count_state_invalid');
    }

    sourceRows+=sourceCount;
    acceptedRows+=accepted;
    excludedRows+=excluded;
    ingestedRows+=ingested;
    rows.push({
      entity,
      source_rows:sourceCount,
      accepted_rows:accepted,
      excluded_rows:excluded,
      ingest_submitted:ingested,
      exhausted:m.exhausted===true,
      count_resolution:countResolution,
      state:'checked'
    });
  }

  for(const [entity] of migrated){
    if(!(inventory.entities||[]).some(x=>clean(x.entity)===entity)) blockers.push(entity+':unexpected_migration_entity');
  }

  const findingMigration=migrated.get('ForensicFinding');
  const expectedFindingRows=asInt(findingMigration?.accepted_rows);
  if(expectedFindingRows!==null&&asInt(corpusHealth.finding_rows)!==expectedFindingRows){
    blockers.push('ForensicFinding:owned_corpus_row_count_mismatch');
  }
  const sourceFinding=(inventory.entities||[]).find(x=>x.entity==='ForensicFinding');
  if(sourceFinding?.integrity){
    const expectedUnique=asInt(sourceFinding.integrity.unique_finding_numbers);
    const expectedDupExtra=asInt(sourceFinding.integrity.duplicate_number_extra_rows);
    if(expectedUnique!==null&&asInt(corpusHealth.unique_finding_numbers)!==expectedUnique){
      blockers.push('ForensicFinding:unique_number_count_mismatch');
    }
    if(expectedDupExtra!==null&&asInt(corpusHealth.duplicate_number_extra_rows)!==expectedDupExtra){
      blockers.push('ForensicFinding:duplicate_number_shape_mismatch');
    }
  }
  if(corpusHealth.base44_runtime_required!==false) blockers.push('owned_corpus:base44_runtime_dependency_present');
  if(corpusHealth.destructive_dedupe!==false) blockers.push('owned_corpus:destructive_dedupe_not_forbidden');
  if(corpusHealth.prior_versions_preserved!==true) blockers.push('owned_corpus:version_preservation_not_verified');
  if(migrationReceipt.complete!==true) blockers.push('migration:receipt_not_complete');
  if(migrationReceipt.legacy_retirement_authorized!==false) blockers.push('migration:premature_legacy_retirement_authority');

  const complete=
    blockers.length===0 &&
    sourceRows===acceptedRows+excludedRows &&
    acceptedRows===ingestedRows;

  return {
    schema:'evercraft.forensic-record.migration-reconciliation.v1',
    complete,
    counts:{
      source_rows:sourceRows,
      accepted_rows:acceptedRows,
      excluded_rows:excludedRows,
      ingested_rows:ingestedRows,
      entities_checked:rows.length,
      blockers:blockers.length
    },
    entities:rows,
    blockers,
    legacy_retirement_authorized:false,
    public_cutover_authorized:false,
    next_gate:complete
      ? 'yard_live_deployment_then_public_route_and_observation_window'
      : 'resolve_reconciliation_blockers',
    semantics:'Terminal hashed extraction resolves legacy surface-count conflicts. Completion still does not authorize public cutover or legacy retirement; Yard deployment, verified public routing, rollback and observation receipts remain separate gates.',
    reconciled_at:new Date().toISOString()
  };
}
