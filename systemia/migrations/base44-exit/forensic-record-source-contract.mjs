import { createHash } from 'node:crypto';

const clean=(v)=>String(v??'').trim();
function stable(v){
  if(Array.isArray(v)) return v.map(stable);
  if(v&&typeof v==='object') return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));
  return v;
}
export function forensicStableJson(value){ return JSON.stringify(stable(value)); }
export function forensicSha256(value){
  return createHash('sha256').update(
    Buffer.isBuffer(value)?value:Buffer.from(typeof value==='string'?value:forensicStableJson(value))
  ).digest('hex');
}
function withoutKey(object,key){
  return Object.fromEntries(Object.entries(object||{}).filter(([k])=>k!==key));
}
export function migrationRowEnvelope(row){
  const body=structuredClone(row||{});
  delete body._migration_row_sha256;
  return {...body,_migration_row_sha256:forensicSha256(forensicStableJson(body))};
}
export function migrationPageEnvelope({
  entity,
  rows=[],
  snapshotCutoff,
  nextCursor=null,
  nextOffset=0,
  exhausted=false
}={}){
  if(!clean(entity)) throw new Error('forensic_source_entity_required');
  if(!Array.isArray(rows)) throw new Error('forensic_source_rows_array_required');
  const body={
    schema:'evercraft.forensic-record.base44-exit-batch.v1',
    ok:true,
    source_product:'forensic-record',
    source_entity:entity,
    snapshot_cutoff:new Date(snapshotCutoff).toISOString(),
    page_row_count:rows.length,
    rows:rows.map(migrationRowEnvelope),
    next_cursor:nextCursor,
    next_offset:Number(nextOffset||0),
    exhausted:exhausted===true
  };
  return {...body,page_sha256:forensicSha256(forensicStableJson(body))};
}
export function verifyMigrationPageEnvelope(page){
  if(page?.schema!=='evercraft.forensic-record.base44-exit-batch.v1'||page?.ok!==true){
    throw new Error('forensic_source_page_schema_invalid');
  }
  if(clean(page.source_product)!=='forensic-record') throw new Error('forensic_source_product_invalid');
  if(Number(page.page_row_count)!==(page.rows||[]).length) throw new Error('forensic_source_page_count_mismatch');
  for(const row of page.rows||[]){
    const expected=clean(row?._migration_row_sha256);
    if(!/^[a-f0-9]{64}$/i.test(expected)) throw new Error('forensic_source_row_sha_missing');
    const body=withoutKey(row,'_migration_row_sha256');
    const actual=forensicSha256(forensicStableJson(body));
    if(actual!==expected) throw new Error('forensic_source_row_sha_mismatch');
  }
  const expected=clean(page.page_sha256);
  if(!/^[a-f0-9]{64}$/i.test(expected)) throw new Error('forensic_source_page_sha_missing');
  const actual=forensicSha256(forensicStableJson(withoutKey(page,'page_sha256')));
  if(actual!==expected) throw new Error('forensic_source_page_sha_mismatch');
  return true;
}
export function assertSafeLegacyPagination({entity,countState,pagination}={}){
  const mode=clean(pagination?.mode);
  if(!['keyset','offset'].includes(mode)) throw new Error('forensic_source_pagination_mode_invalid:'+clean(entity));
  if((countState==='conflicted'||countState==='conflicted_lower_bound')&&mode!=='keyset'){
    throw new Error('forensic_conflicted_entity_requires_keyset:'+clean(entity));
  }
  if(mode==='keyset'&&!clean(pagination?.key)) throw new Error('forensic_keyset_key_required:'+clean(entity));
  const size=Number(pagination?.page_size||0);
  if(!Number.isInteger(size)||size<1||size>500) throw new Error('forensic_page_size_invalid:'+clean(entity));
  return true;
}
