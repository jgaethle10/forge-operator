function clean(v){return String(v??'').trim();}
function asInt(v){const n=Number(v);return Number.isInteger(n)&&n>=0?n:null;}

export function reconcileAliEvMigration({
  inventory,
  adapterReceipts=[],
  ingestReceipts=[],
  requiredEntities=[],
}={}){
  if(inventory?.schema!=='evercraft.aliev.legacy-inventory.v1') throw new Error('legacy_inventory_required');
  const adapters=new Map(adapterReceipts.map(r=>[clean(r?.source_entity),r]));
  const ingests=new Map();
  for(const row of ingestReceipts||[]){
    const entity=clean(row?.source_entity);
    if(!entity) continue;
    if(!ingests.has(entity)) ingests.set(entity,[]);
    ingests.get(entity).push(row);
  }

  const expectedEntities=new Set(
    requiredEntities.length
      ? requiredEntities.map(clean)
      : (inventory.entities||[]).map(x=>clean(x.entity))
  );
  const rows=[];
  let sourceTotal=0,acceptedTotal=0,excludedTotal=0,ingestedTotal=0;
  const blockers=[];

  for(const source of inventory.entities||[]){
    const entity=clean(source.entity);
    if(!expectedEntities.has(entity)) continue;
    const expected=asInt(source.rows);
    if(expected===null){
      blockers.push(entity+':source_count_invalid');
      continue;
    }
    sourceTotal+=expected;
    const adapter=adapters.get(entity);
    if(!adapter){
      blockers.push(entity+':adapter_receipt_missing');
      rows.push({entity,expected,state:'blocked'});
      continue;
    }
    const submitted=asInt(adapter.submitted),accepted=asInt(adapter.accepted),excluded=asInt(adapter.excluded);
    if(submitted===null||accepted===null||excluded===null){
      blockers.push(entity+':adapter_counts_invalid');
      rows.push({entity,expected,state:'blocked'});
      continue;
    }
    if(submitted!==expected) blockers.push(entity+':source_vs_adapter_count_mismatch');
    if(accepted+excluded!==submitted) blockers.push(entity+':accepted_excluded_do_not_reconcile');

    const pagination=source.pagination||{};
    if(pagination.mode==='keyset'&&pagination.terminal_exhaustion_verified!==true){
      blockers.push(entity+':keyset_terminal_exhaustion_not_verified');
    }
    if(pagination.mode==='offset'&&source.rows>=10000){
      blockers.push(entity+':unsafe_offset_pagination_for_large_table');
    }

    const receipts=ingests.get(entity)||[];
    const ingestSubmitted=receipts.reduce((n,r)=>n+(asInt(r.submitted)||0),0);
    const ingestAccounted=receipts.reduce((n,r)=>n+
      (asInt(r.inserted)||0)+(asInt(r.updated)||0)+(asInt(r.stale)||0)+(asInt(r.deduped)||0),0);
    if(accepted>0&&!receipts.length) blockers.push(entity+':ingest_receipt_missing');
    if(ingestSubmitted!==accepted) blockers.push(entity+':accepted_vs_ingest_submitted_mismatch');
    if(ingestAccounted!==ingestSubmitted) blockers.push(entity+':ingest_outcomes_do_not_reconcile');

    acceptedTotal+=accepted;
    excludedTotal+=excluded;
    ingestedTotal+=ingestSubmitted;
    rows.push({
      entity,
      expected_source_rows:expected,
      adapter_submitted:submitted,
      accepted,
      excluded,
      ingest_batches:receipts.length,
      ingest_submitted:ingestSubmitted,
      ingest_accounted:ingestAccounted,
      terminal_exhaustion_verified:pagination.mode==='keyset'?pagination.terminal_exhaustion_verified===true:true,
      state:'checked',
    });
  }

  for(const entity of expectedEntities){
    if(!(inventory.entities||[]).some(x=>clean(x.entity)===entity)){
      blockers.push(entity+':inventory_entity_missing');
    }
  }

  const complete=blockers.length===0&&
    sourceTotal===acceptedTotal+excludedTotal&&
    acceptedTotal===ingestedTotal;

  return {
    schema:'evercraft.aliev.migration-reconciliation.v1',
    complete,
    counts:{
      source_rows:sourceTotal,
      accepted_rows:acceptedTotal,
      excluded_rows:excludedTotal,
      ingested_rows:ingestedTotal,
      entities_checked:rows.length,
      blockers:blockers.length,
    },
    entities:rows,
    blockers,
    semantics:'Completion requires terminal source pagination and exact row accounting. Excluded rows remain explicit. Stale and deduplicated destination writes are accounted outcomes, not silent loss.',
    reconciled_at:new Date().toISOString(),
  };
}
