import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { EvercraftObjectStore } from '../object-store/object-store.mjs';
import { DurableEntityStore } from '../app-fabric/entity-store.mjs';

export const PLUGNYC_SOURCE_URL='https://data.cityofnewyork.us/resource/kj7g-u4gp.json';
export const PLUGNYC_SOURCE_PAGE='https://data.cityofnewyork.us/Transportation/Electric-Vehicle-EV-Charging-Data-Municipal-Lots-a/kj7g-u4gp';
export const PLUGNYC_SOURCE_ID='nyc-plugnyc';
export const ALIEV_APP_KEY='aliev';
export const SAFE_SOURCE_FIELDS=[
  'date','station_name','location_name','country','charge_box_id','connector_id',
  'connected_time','disconnected_time','charge_duration_min','connected_duration_min',
  'energy_provided_kwh','session_status','invalidity_reason'
];
export const VALID_USAGE_STATUSES=new Set(['PAID','ROAMING','DISCONNECTED']);

const clean=(v)=>String(v??'').trim();
const nullableNumber=(v)=>{
  if(v===null||v===undefined||v==='') return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
};
const shaHex=(value)=>createHash('sha256').update(Buffer.isBuffer(value)?value:String(value)).digest('hex');

function stableValue(value){
  if(Array.isArray(value)) return value.map(stableValue);
  if(value&&typeof value==='object'){
    const out={};
    for(const key of Object.keys(value).sort()) out[key]=stableValue(value[key]);
    return out;
  }
  return value;
}
const stableJson=(value)=>JSON.stringify(stableValue(value));

function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}
function appendJsonl(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  fs.appendFileSync(file,JSON.stringify(value)+'\n',{mode:0o600});
}
function readJson(file,fallback){
  if(!fs.existsSync(file)) return structuredClone(fallback);
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
function rowsFromNdjson(bytes){
  return Buffer.from(bytes).toString('utf8').split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
}
function monthStart(month){
  return month+'-01T00:00:00.000Z';
}
function nextMonthStart(month){
  const [y,m]=month.split('-').map(Number);
  return new Date(Date.UTC(y,m,1)).toISOString();
}
function isPartialSourceMonth(month,maxDate){
  if(clean(maxDate).slice(0,7)!==month) return false;
  const [y,m,d]=clean(maxDate).slice(0,10).split('-').map(Number);
  if(!y||!m||!d) return true;
  const last=new Date(Date.UTC(y,m,0)).getUTCDate();
  return d<last;
}
function endpointUrl(base,params){
  const url=new URL(base);
  for(const [key,value] of Object.entries(params)) url.searchParams.set(key,String(value));
  return url.toString();
}
const RETRYABLE_SOURCE_STATUS=new Set([408,425,429,500,502,503,504]);
const wait=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
function retryDelayMs(response,attempt){
  const raw=clean(response?.headers?.get?.('retry-after'));
  if(raw){
    const seconds=Number(raw);
    if(Number.isFinite(seconds)&&seconds>=0) return Math.min(10000,seconds*1000);
    const at=Date.parse(raw);
    if(Number.isFinite(at)) return Math.max(0,Math.min(10000,at-Date.now()));
  }
  return Math.min(5000,250*(2**attempt));
}
async function jsonFetch(url,fetchImpl){
  let lastError=null;
  for(let attempt=0;attempt<4;attempt+=1){
    let response=null;
    try{
      response=await fetchImpl(url,{
        headers:{
          accept:'application/json',
          'user-agent':'Evercraft-Systemia-AliEV-Session-Corpus/1.0'
        },
        signal:AbortSignal.timeout(45000)
      });
    }catch(error){
      lastError=error instanceof Error?error:new Error(String(error));
      if(attempt===3) throw lastError;
      await wait(Math.min(5000,250*(2**attempt)));
      continue;
    }
    const body=await response.json().catch(()=>null);
    if(response.ok){
      if(body==null) throw new Error('plugnyc_json_required');
      return body;
    }
    lastError=new Error('plugnyc_http_'+response.status);
    if(!RETRYABLE_SOURCE_STATUS.has(response.status)||attempt===3) throw lastError;
    await wait(retryDelayMs(response,attempt));
  }
  throw lastError||new Error('plugnyc_fetch_failed');
}

export function normalizePlugNYCSession(row){
  const sourceDate=clean(row?.date).slice(0,10);
  const station=clean(row?.station_name);
  const location=clean(row?.location_name);
  const connected=clean(row?.connected_time);
  if(!sourceDate||!station||!location||!connected) throw new Error('plugnyc_session_identity_incomplete');
  const disconnected=clean(row?.disconnected_time);
  const chargeBox=clean(row?.charge_box_id);
  const connector=clean(row?.connector_id);
  const status=(clean(row?.session_status)||'UNKNOWN').toUpperCase();
  const invalidityRaw=clean(row?.invalidity_reason);
  const invalidity=!invalidityRaw||invalidityRaw.toUpperCase()==='NULL'?null:invalidityRaw;
  const identity={
    date:sourceDate,
    station_name:station,
    location_name:location,
    charge_box_id:chargeBox,
    connector_id:connector,
    connected_time:connected,
    disconnected_time:disconnected,
    charge_duration_min:nullableNumber(row?.charge_duration_min),
    connected_duration_min:nullableNumber(row?.connected_duration_min),
    energy_provided_kwh:nullableNumber(row?.energy_provided_kwh),
    session_status:status,
    invalidity_reason:invalidity
  };
  const digest=shaHex(stableJson(identity));
  return {
    source_ref:PLUGNYC_SOURCE_ID+':session:'+digest,
    source_dataset:PLUGNYC_SOURCE_ID,
    source_url:PLUGNYC_SOURCE_PAGE,
    source_date:sourceDate,
    source_timezone:'America/New_York',
    station_external_id:PLUGNYC_SOURCE_ID+':'+station,
    station_name:station,
    location_label:location,
    country:clean(row?.country)||'USA',
    charge_box_id:chargeBox||null,
    connector_id:connector||null,
    charger_id:[chargeBox,connector].filter(Boolean).join(':')||station,
    session_start_local:sourceDate+'T'+connected,
    session_end_local:disconnected?sourceDate+'T'+disconnected:null,
    duration_minutes:identity.charge_duration_min,
    connected_duration_minutes:identity.connected_duration_min,
    energy_kwh:identity.energy_provided_kwh,
    source_session_status:status,
    source_invalidity_reason:invalidity,
    observed_usage_valid:VALID_USAGE_STATUSES.has(status),
    data_status:'imported',
    provenance_notes:'NYC DOT PlugNYC public individual charging-session row. Driver ID and ID Tag are neither selected nor persisted. Source-native validity state is preserved.'
  };
}

export async function fetchPlugNYCSourceStats({sourceUrl=PLUGNYC_SOURCE_URL,fetchImpl=fetch}={}){
  const rows=await jsonFetch(endpointUrl(sourceUrl,{
    '$select':'count(*) as rows,min(date) as first_date,max(date) as latest_date,sum(energy_provided_kwh) as energy_kwh'
  }),fetchImpl);
  const row=Array.isArray(rows)?rows[0]:null;
  const count=Number(row?.rows);
  if(!Number.isInteger(count)||count<0) throw new Error('plugnyc_source_count_invalid');
  return {
    rows:count,
    first_date:clean(row?.first_date).slice(0,10)||null,
    latest_date:clean(row?.latest_date).slice(0,10)||null,
    energy_kwh:nullableNumber(row?.energy_kwh)
  };
}

export async function fetchPlugNYCPage({
  sourceUrl=PLUGNYC_SOURCE_URL,
  offset=0,
  limit=5000,
  fetchImpl=fetch
}={}){
  const size=Math.max(1,Math.min(5000,Number(limit)||5000));
  const start=Math.max(0,Number(offset)||0);
  const rows=await jsonFetch(endpointUrl(sourceUrl,{
    '$select':SAFE_SOURCE_FIELDS.join(','),
    '$order':'date ASC,station_name ASC,charge_box_id ASC,connector_id ASC,connected_time ASC,disconnected_time ASC',
    '$limit':size,
    '$offset':start
  }),fetchImpl);
  if(!Array.isArray(rows)) throw new Error('plugnyc_page_array_required');
  return rows;
}

function defaultCheckpoint(){
  return {
    schema:'evercraft.aliev.session-corpus-checkpoint.v1',
    source:PLUGNYC_SOURCE_ID,
    next_offset:0,
    source_rows_seen:null,
    source_first_date:null,
    source_latest_date:null,
    source_energy_kwh:null,
    partition_count:0,
    raw_rows_materialized:0,
    page_size:null,
    complete:false,
    updated_at:null
  };
}

export async function backfillPlugNYCSessionCorpus({
  stateDir,
  appKey=ALIEV_APP_KEY,
  sourceUrl=PLUGNYC_SOURCE_URL,
  pageSize=5000,
  maxPagesPerRun=8,
  refreshOverlapPages=2,
  fetchImpl=fetch,
  now=()=>new Date().toISOString()
}={}){
  if(!stateDir) throw new Error('session_corpus_state_dir_required');
  const root=path.resolve(stateDir);
  const corpusDir=path.join(root,'session-corpus',PLUGNYC_SOURCE_ID);
  const checkpointFile=path.join(corpusDir,'checkpoint.json');
  const receiptsFile=path.join(corpusDir,'receipts.jsonl');
  const objectStore=new EvercraftObjectStore({stateDir:path.join(root,'object-store')});
  const entityStore=new DurableEntityStore({stateDir:path.join(root,'entity-store')});
  const stats=await fetchPlugNYCSourceStats({sourceUrl,fetchImpl});
  const checkpoint=readJson(checkpointFile,defaultCheckpoint());
  if(checkpoint.source!==PLUGNYC_SOURCE_ID) throw new Error('session_checkpoint_source_mismatch');

  const limit=Math.max(1,Math.min(5000,Number(pageSize)||5000));
  const pageCap=Math.max(1,Math.min(100,Number(maxPagesPerRun)||8));
  const overlapPages=Math.max(1,Math.min(20,Number(refreshOverlapPages)||2));
  if(checkpoint.page_size!=null&&Number(checkpoint.page_size)!==limit){
    throw new Error('session_page_size_checkpoint_mismatch');
  }

  const previousRows=checkpoint.source_rows_seen==null?null:Number(checkpoint.source_rows_seen);
  const previousEnergy=checkpoint.source_energy_kwh==null?null:Number(checkpoint.source_energy_kwh);
  if(previousRows!=null && stats.rows<previousRows){
    throw new Error('session_source_shrank_after_checkpoint');
  }

  let offset=Math.max(0,Number(checkpoint.next_offset)||0);
  let refreshReason=null;
  if(checkpoint.complete===true && previousRows!=null){
    const firstChanged=Boolean(checkpoint.source_first_date)&&stats.first_date!==checkpoint.source_first_date;
    const latestChanged=Boolean(checkpoint.source_latest_date)&&stats.latest_date!==checkpoint.source_latest_date;
    const energyChanged=previousEnergy!=null&&stats.energy_kwh!=null&&Math.abs(Number(stats.energy_kwh)-previousEnergy)>0.000001;
    if(stats.rows>previousRows){
      if(!latestChanged){
        // New rows appeared inside an already-scanned date range. Offset-only append
        // would be unsafe because the authoritative ordering may have shifted.
        offset=0;
        refreshReason='source_row_growth_inside_existing_coverage_full_rescan';
      }else{
        const rewindRows=limit*overlapPages;
        offset=Math.max(0,Math.floor(Math.max(0,previousRows-rewindRows)/limit)*limit);
        refreshReason='source_advanced_tail_rewind';
      }
    }else if(firstChanged||latestChanged||energyChanged){
      // Same row count but source facts changed. We cannot prove which historical
      // row moved, so the only truthful repair is a full deterministic rescan.
      offset=0;
      refreshReason='source_revision_without_row_growth_full_rescan';
    }
  }

  const startedOffset=offset;
  let pagesWritten=0;
  let rawRowsWritten=0;
  let validRows=0;
  let validEnergy=0;
  const statusCounts={};
  const partitionReceipts=[];

  for(let i=0;i<pageCap && offset<stats.rows;i+=1){
    const sourceRows=await fetchPlugNYCPage({sourceUrl,offset,limit,fetchImpl});
    if(!sourceRows.length) break;
    const normalized=[];
    for(const row of sourceRows){
      const item=normalizePlugNYCSession(row);
      normalized.push(item);
      statusCounts[item.source_session_status]=(statusCounts[item.source_session_status]||0)+1;
      if(item.observed_usage_valid){
        validRows+=1;
        validEnergy+=Number(item.energy_kwh||0);
      }
    }
    const ndjson=Buffer.from(normalized.map(stableJson).join('\n')+'\n','utf8');
    const pageSha='sha256:'+shaHex(ndjson);
    const partitionKey=PLUGNYC_SOURCE_ID+':offset:'+String(offset).padStart(9,'0');
    const stored=objectStore.put(appKey,ndjson,{
      name:'session-corpus/'+PLUGNYC_SOURCE_ID+'/'+String(offset).padStart(9,'0')+'.ndjson',
      contentType:'application/x-ndjson',
      metadata:{
        source:PLUGNYC_SOURCE_ID,
        source_offset:offset,
        source_rows:sourceRows.length,
        page_sha256:pageSha,
        privacy_fields_excluded:['driver_id','id_tag']
      }
    });
    const partition={
      partition_key:partitionKey,
      source:PLUGNYC_SOURCE_ID,
      source_url:PLUGNYC_SOURCE_PAGE,
      source_offset:offset,
      row_count:normalized.length,
      first_source_date:normalized[0]?.source_date||null,
      last_source_date:normalized.at(-1)?.source_date||null,
      page_sha256:pageSha,
      object_ref:stored.reference.object_ref,
      object_blob_sha256:stored.reference.blob_sha256,
      object_receipt_hash:stored.receipt.receipt_hash,
      source_total_at_write:stats.rows,
      source_latest_date_at_write:stats.latest_date,
      personal_identifiers_persisted:false,
      written_at:now()
    };
    const mutation=entityStore.upsert(appKey,'EVOpsSessionPartition',[partition],{key:'partition_key'});
    partitionReceipts.push({
      partition_key:partitionKey,
      source_offset:offset,
      row_count:normalized.length,
      page_sha256:pageSha,
      object_ref:stored.reference.object_ref,
      object_receipt_hash:stored.receipt.receipt_hash,
      entity_receipt_hash:mutation.receipt.receipt_hash
    });
    offset+=sourceRows.length;
    pagesWritten+=1;
    rawRowsWritten+=normalized.length;
    if(sourceRows.length<limit) break;
  }

  const complete=offset>=stats.rows;
  const partitionState=entityStore.state(appKey,'EVOpsSessionPartition');
  const next={
    ...checkpoint,
    next_offset:offset,
    source_rows_seen:stats.rows,
    source_first_date:stats.first_date,
    source_latest_date:stats.latest_date,
    source_energy_kwh:stats.energy_kwh,
    partition_count:partitionState.records.length,
    raw_rows_materialized:offset,
    page_size:limit,
    complete,
    updated_at:now()
  };
  atomicJson(checkpointFile,next);
  const receipt={
    schema:'evercraft.aliev.session-corpus-run-receipt.v1',
    source:PLUGNYC_SOURCE_ID,
    source_url:PLUGNYC_SOURCE_PAGE,
    started_offset:startedOffset,
    next_offset:offset,
    refresh_reason:refreshReason,
    refresh_overlap_pages:overlapPages,
    source_total:stats.rows,
    source_first_date:stats.first_date,
    source_latest_date:stats.latest_date,
    source_energy_kwh:stats.energy_kwh,
    pages_written:pagesWritten,
    rows_written:rawRowsWritten,
    valid_usage_rows_in_run:validRows,
    valid_energy_kwh_in_run:Number(validEnergy.toFixed(6)),
    source_status_counts:statusCounts,
    partition_count:partitionState.records.length,
    complete,
    privacy:{
      selected_source_fields:SAFE_SOURCE_FIELDS,
      excluded_source_fields:['driver_id','id_tag'],
      personal_identifiers_persisted:false
    },
    partitions:partitionReceipts,
    observed_at:now()
  };
  receipt.receipt_sha256='sha256:'+shaHex(stableJson(receipt));
  appendJsonl(receiptsFile,receipt);
  return {checkpoint:next,receipt};
}

export function compactPlugNYCSessionCorpus({
  stateDir,
  appKey=ALIEV_APP_KEY,
  now=()=>new Date().toISOString()
}={}){
  if(!stateDir) throw new Error('session_corpus_state_dir_required');
  const root=path.resolve(stateDir);
  const objectStore=new EvercraftObjectStore({stateDir:path.join(root,'object-store')});
  const entityStore=new DurableEntityStore({stateDir:path.join(root,'entity-store')});
  const checkpoint=readJson(path.join(root,'session-corpus',PLUGNYC_SOURCE_ID,'checkpoint.json'),defaultCheckpoint());
  const sourceCoverageThrough=clean(checkpoint.source_latest_date)||null;
  const partitions=entityStore.list(appKey,'EVOpsSessionPartition',{sort:'source_offset',limit:10000});
  const groups=new Map();
  const seenRefs=new Set();
  let rawRows=0;
  let validRows=0;
  let duplicateSourceRows=0;
  for(const partition of partitions){
    const stored=objectStore.get(appKey,partition.object_ref);
    if(stored.reference.blob_sha256!==partition.object_blob_sha256) throw new Error('session_partition_blob_mismatch');
    const rows=rowsFromNdjson(stored.data);
    if(rows.length!==Number(partition.row_count)) throw new Error('session_partition_row_count_mismatch');
    rawRows+=rows.length;
    for(const row of rows){
      const sourceRef=clean(row.source_ref);
      if(sourceRef && seenRefs.has(sourceRef)){
        duplicateSourceRows+=1;
        continue;
      }
      if(sourceRef) seenRefs.add(sourceRef);
      const month=clean(row.source_date).slice(0,7);
      const station=clean(row.station_external_id);
      if(!month||!station) continue;
      const key=station+':'+month;
      let group=groups.get(key);
      if(!group){
        group={
          aggregate_key:key,
          station_external_id:station,
          address:clean(row.location_label)||null,
          jurisdiction:'New York City, New York, US',
          period_start:monthStart(month),
          period_end:nextMonthStart(month),
          period_granularity:'month',
          charging_sessions_count:0,
          energy_kwh:0,
          connected_hours:0,
          connector_ids:new Set(),
          source_rows:0,
          status_counts:{},
          source_max_date:null
        };
        groups.set(key,group);
      }
      group.source_rows+=1;
      group.status_counts[row.source_session_status]=(group.status_counts[row.source_session_status]||0)+1;
      if(row.connector_id) group.connector_ids.add(row.connector_id);
      if(!group.source_max_date || row.source_date>group.source_max_date) group.source_max_date=row.source_date;
      if(row.observed_usage_valid===true){
        validRows+=1;
        group.charging_sessions_count+=1;
        group.energy_kwh+=Number(row.energy_kwh||0);
        group.connected_hours+=Number(row.connected_duration_minutes||0)/60;
      }
    }
  }
  const aggregates=[...groups.values()].map(group=>{
    const month=group.period_start.slice(0,7);
    return {
      aggregate_key:group.aggregate_key,
      station_external_id:group.station_external_id,
      address:group.address,
      jurisdiction:group.jurisdiction,
      period_start:group.period_start,
      period_end:group.period_end,
      period_granularity:'month',
      charging_sessions_count:group.charging_sessions_count,
      energy_kwh:Number(group.energy_kwh.toFixed(6)),
      connected_hours:Number(group.connected_hours.toFixed(4)),
      connector_count:group.connector_ids.size,
      source_ref:PLUGNYC_SOURCE_ID,
      source_url:PLUGNYC_SOURCE_PAGE,
      source_vintage:month+(isPartialSourceMonth(month,sourceCoverageThrough)?' partial through '+sourceCoverageThrough:''),
      data_status:isPartialSourceMonth(month,sourceCoverageThrough)?'partial':'verified',
      confidence_pct:100,
      provenance_notes:'Owned Evercraft projection from privacy-minimized PlugNYC individual-session partitions. PAID/ROAMING/DISCONNECTED count as valid observed usage; INVALID/ABORTED remain preserved in raw partitions and excluded from successful-session totals.',
      derived_metrics_json:JSON.stringify({
        source_rows:group.source_rows,
        source_coverage_through:sourceCoverageThrough,
        station_latest_observed_session_date:group.source_max_date,
        status_counts:group.status_counts,
        excluded_invalid_or_aborted:group.source_rows-group.charging_sessions_count,
        semantic_class:'observed_station_month_from_raw_sessions'
      }),
      created_from_schema_version:'EVObservedUsageAggregate-owned-plugnyc-v1'
    };
  });
  const write=entityStore.upsert(appKey,'EVObservedUsageAggregate',aggregates,{key:'aggregate_key'});
  const receipt={
    schema:'evercraft.aliev.session-corpus-compaction-receipt.v1',
    source:PLUGNYC_SOURCE_ID,
    partitions_read:partitions.length,
    raw_rows_read:rawRows,
    valid_usage_rows:validRows,
    unique_event_refs:seenRefs.size,
    duplicate_source_rows_skipped:duplicateSourceRows,
    aggregates_written:write.records.length,
    aggregate_mutation_receipt_hash:write.receipt.receipt_hash,
    observed_at:now()
  };
  receipt.receipt_sha256='sha256:'+shaHex(stableJson(receipt));
  const receiptFile=path.join(root,'session-corpus',PLUGNYC_SOURCE_ID,'compaction-receipts.jsonl');
  appendJsonl(receiptFile,receipt);
  return {receipt,aggregates};
}

export function reconcilePlugNYCSessionCorpus({
  stateDir,
  appKey=ALIEV_APP_KEY,
  now=()=>new Date().toISOString(),
  failOnCompleteMismatch=true
}={}){
  if(!stateDir) throw new Error('session_corpus_state_dir_required');
  const root=path.resolve(stateDir);
  const checkpoint=readJson(path.join(root,'session-corpus',PLUGNYC_SOURCE_ID,'checkpoint.json'),defaultCheckpoint());
  const objectStore=new EvercraftObjectStore({stateDir:path.join(root,'object-store')});
  const entityStore=new DurableEntityStore({stateDir:path.join(root,'entity-store')});
  const partitions=entityStore.list(appKey,'EVOpsSessionPartition',{sort:'source_offset',limit:10000})
    .sort((a,b)=>Number(a.source_offset||0)-Number(b.source_offset||0));

  let expectedOffset=0;
  let rawRows=0;
  let allEnergy=0;
  let validRows=0;
  let validEnergy=0;
  let firstDate=null;
  let latestDate=null;
  const statusCounts={};
  const seenRefs=new Set();
  let duplicateSourceRows=0;

  for(const partition of partitions){
    const offset=Number(partition.source_offset||0);
    if(offset!==expectedOffset) throw new Error('session_partition_offset_gap:'+expectedOffset+':'+offset);
    const stored=objectStore.get(appKey,partition.object_ref);
    if(stored.reference.blob_sha256!==partition.object_blob_sha256) throw new Error('session_partition_blob_mismatch');
    const rows=rowsFromNdjson(stored.data);
    if(rows.length!==Number(partition.row_count)) throw new Error('session_partition_row_count_mismatch');
    expectedOffset+=rows.length;
    rawRows+=rows.length;
    for(const row of rows){
      const date=clean(row.source_date);
      if(date && (!firstDate||date<firstDate)) firstDate=date;
      if(date && (!latestDate||date>latestDate)) latestDate=date;
      const energy=Number(row.energy_kwh||0);
      allEnergy+=energy;
      const status=clean(row.source_session_status)||'UNKNOWN';
      statusCounts[status]=(statusCounts[status]||0)+1;
      const sourceRef=clean(row.source_ref);
      if(sourceRef){
        if(seenRefs.has(sourceRef)) duplicateSourceRows+=1;
        else seenRefs.add(sourceRef);
      }
      if(row.observed_usage_valid===true){
        validRows+=1;
        validEnergy+=energy;
      }
    }
  }

  const sourceRows=checkpoint.source_rows_seen==null?null:Number(checkpoint.source_rows_seen);
  const sourceEnergy=checkpoint.source_energy_kwh==null?null:Number(checkpoint.source_energy_kwh);
  const energyDelta=sourceEnergy==null?null:Number((allEnergy-sourceEnergy).toFixed(6));
  const energyTolerance=sourceEnergy==null?null:Math.max(0.01,Math.abs(sourceEnergy)*1e-9);
  const rowsReconciled=sourceRows==null?false:rawRows===sourceRows;
  const energyReconciled=sourceEnergy==null?false:Math.abs(energyDelta)<=energyTolerance;
  const offsetsReconciled=expectedOffset===rawRows && rawRows===Number(checkpoint.raw_rows_materialized||0);
  const coverageDatesReconciled=checkpoint.complete
    ? firstDate===checkpoint.source_first_date && latestDate===checkpoint.source_latest_date
    : true;
  const completeReconciled=Boolean(
    checkpoint.complete && rowsReconciled && energyReconciled && offsetsReconciled && coverageDatesReconciled
  );

  const receipt={
    schema:'evercraft.aliev.session-corpus-reconciliation-receipt.v1',
    source:PLUGNYC_SOURCE_ID,
    checkpoint_complete:Boolean(checkpoint.complete),
    source_rows:sourceRows,
    raw_rows_materialized:rawRows,
    unique_event_refs:seenRefs.size,
    duplicate_source_rows:duplicateSourceRows,
    source_energy_kwh:sourceEnergy,
    raw_energy_kwh:Number(allEnergy.toFixed(6)),
    energy_delta_kwh:energyDelta,
    energy_tolerance_kwh:energyTolerance,
    valid_usage_rows:validRows,
    valid_usage_energy_kwh:Number(validEnergy.toFixed(6)),
    source_status_counts:statusCounts,
    first_materialized_date:firstDate,
    latest_materialized_date:latestDate,
    rows_reconciled:rowsReconciled,
    energy_reconciled:energyReconciled,
    offsets_reconciled:offsetsReconciled,
    coverage_dates_reconciled:coverageDatesReconciled,
    complete_reconciled:completeReconciled,
    observed_at:now()
  };
  receipt.receipt_sha256='sha256:'+shaHex(stableJson(receipt));
  appendJsonl(path.join(root,'session-corpus',PLUGNYC_SOURCE_ID,'reconciliation-receipts.jsonl'),receipt);

  if(checkpoint.complete && failOnCompleteMismatch && !completeReconciled){
    const error=new Error('session_corpus_reconciliation_failed');
    error.receipt=receipt;
    throw error;
  }
  return receipt;
}

export function sessionCorpusStatus({stateDir,appKey=ALIEV_APP_KEY}={}){
  if(!stateDir) throw new Error('session_corpus_state_dir_required');
  const root=path.resolve(stateDir);
  const checkpoint=readJson(path.join(root,'session-corpus',PLUGNYC_SOURCE_ID,'checkpoint.json'),defaultCheckpoint());
  const entityStore=new DurableEntityStore({stateDir:path.join(root,'entity-store')});
  const partitionCount=entityStore.count(appKey,'EVOpsSessionPartition');
  const aggregateCount=entityStore.count(appKey,'EVObservedUsageAggregate');
  return {
    schema:'evercraft.aliev.session-corpus-status.v1',
    source:PLUGNYC_SOURCE_ID,
    source_url:PLUGNYC_SOURCE_PAGE,
    checkpoint,
    partition_count:partitionCount,
    aggregate_count:aggregateCount,
    percent_materialized:checkpoint.source_rows_seen
      ? Number(((Number(checkpoint.raw_rows_materialized||0)/Number(checkpoint.source_rows_seen))*100).toFixed(3))
      : 0,
    privacy_minimized:true,
    personal_identifiers_persisted:false
  };
}
