import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { adaptLegacyAliEvEntity } from './aliev-domain-adapter.mjs';

const SOURCE_SCHEMA='evercraft.aliev.base44-exit-batch.v1';
const PURPOSE='aliev-base44-exit-v1';
const DEFAULT_ENTITIES=[
  'EVNationalChargePoint',
  'EVObservedUsageAggregate',
  'EVTrafficProfile',
  'EVOpsTariff',
  'EVStateStockApproxAggregate',
  'RivetMarketEvidence',
  'RivetExternalEvidence',
  'RivetSiteBenchmark',
  'RivetUtilityProgramEvidence',
  'WashingtonNEVIAwardSite',
  'EVOpsSourceRecord',
];

const clean=(v)=>String(v??'').trim();
const sha=(value)=>createHash('sha256').update(
  Buffer.isBuffer(value)?value:Buffer.from(typeof value==='string'?value:JSON.stringify(value))
).digest('hex');

function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}
function loopback(hostname){
  return ['127.0.0.1','localhost','::1'].includes(String(hostname||'').toLowerCase());
}
function assertSourceEndpoint(value){
  const url=new URL(clean(value));
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback(url.hostname))){
    throw new Error('legacy_migration_source_requires_https_or_loopback');
  }
  return url.toString();
}
function assertTargetEndpoint(value){
  const url=new URL(clean(value));
  if(/(^|\.)base44\.app$/i.test(url.hostname)) throw new Error('owned_migration_target_must_not_be_base44');
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback(url.hostname))){
    throw new Error('owned_migration_target_requires_https_or_loopback');
  }
  return url.toString();
}
function safeIso(value){
  const n=Date.parse(clean(value));
  if(!Number.isFinite(n)) throw new Error('migration_cutoff_invalid');
  return new Date(n).toISOString();
}
function checkpointTemplate({runId,sourceEndpoint,targetEndpoint,snapshotCutoff,entities}){
  return {
    schema:'evercraft.aliev.streaming-migration-state.v1',
    run_id:runId,
    source_host:new URL(sourceEndpoint).hostname,
    target_host:new URL(targetEndpoint).hostname,
    snapshot_cutoff:snapshotCutoff,
    source_secret_persisted:false,
    target_secret_persisted:false,
    entities:Object.fromEntries(entities.map(entity=>[entity,{
      snapshot:{cursor:null,offset:0,exhausted:false,pages:{},source_rows:0,accepted_rows:0,excluded_rows:0,ingest_submitted:0},
      deltas:[],
    }])),
    created_at:new Date().toISOString(),
    updated_at:new Date().toISOString(),
  };
}
function loadOrCreateState({stateFile,sourceEndpoint,targetEndpoint,snapshotCutoff,entities}){
  if(fs.existsSync(stateFile)){
    const state=JSON.parse(fs.readFileSync(stateFile,'utf8'));
    if(state?.schema!=='evercraft.aliev.streaming-migration-state.v1') throw new Error('migration_state_schema_invalid');
    if(state.snapshot_cutoff!==snapshotCutoff) throw new Error('migration_snapshot_cutoff_mismatch');
    for(const entity of entities){
      if(!state.entities?.[entity]) throw new Error('migration_state_entity_missing:'+entity);
    }
    return state;
  }
  const state=checkpointTemplate({
    runId:'aliev_migrate_'+randomBytes(12).toString('hex'),
    sourceEndpoint,targetEndpoint,snapshotCutoff,entities
  });
  atomicJson(stateFile,state);
  return state;
}
function withoutKey(object,key){
  const copy={};
  for(const [k,v] of Object.entries(object||{})) if(k!==key) copy[k]=v;
  return copy;
}
function verifyPage(page,{entity,phase,snapshotCutoff,updatedAfter=''}){
  if(page?.schema!==SOURCE_SCHEMA||page?.ok!==true) throw new Error('migration_page_schema_invalid');
  if(clean(page.source_app_id)!=='69b9b64d86a732029ce0db81') throw new Error('migration_source_app_mismatch');
  if(clean(page.source_entity)!==entity) throw new Error('migration_source_entity_mismatch');
  if(clean(page.phase)!==phase) throw new Error('migration_phase_mismatch');
  if(clean(page.snapshot_cutoff)!==snapshotCutoff) throw new Error('migration_snapshot_cutoff_mismatch');
  if(phase==='delta'&&clean(page.updated_after)!==updatedAfter) throw new Error('migration_delta_start_mismatch');
  const expectedPageSha=clean(page.page_sha256);
  if(!/^[a-f0-9]{64}$/i.test(expectedPageSha)) throw new Error('migration_page_sha_missing');
  const actualPageSha=sha(JSON.stringify(withoutKey(page,'page_sha256')));
  if(actualPageSha!==expectedPageSha) throw new Error('migration_page_sha_mismatch');

  for(const row of page.rows||[]){
    const expected=clean(row?._migration_row_sha256);
    if(!/^[a-f0-9]{64}$/i.test(expected)) throw new Error('migration_row_sha_missing');
    const actual=sha(JSON.stringify(withoutKey(row,'_migration_row_sha256')));
    if(actual!==expected) throw new Error('migration_row_sha_mismatch');
  }
  if(Number(page.page_row_count)!==(page.rows||[]).length) throw new Error('migration_page_count_mismatch');
  return true;
}
async function jsonFetch(url,options={}){
  const response=await fetch(url,options);
  const body=await response.json().catch(()=>null);
  if(!response.ok){
    const error=new Error(body?.error||('migration_http_'+response.status));
    error.status=response.status;
    error.body=body;
    throw error;
  }
  return body;
}
async function pullPage({
  sourceEndpoint,sourceKey,entity,phase,snapshotCutoff,updatedAfter='',
  cursor=null,offset=0,limit=100,
}){
  return await jsonFetch(sourceEndpoint,{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-systemia-machine-key':sourceKey,
      'x-evercraft-migration-purpose':PURPOSE,
    },
    body:JSON.stringify({
      entity,phase,snapshot_cutoff:snapshotCutoff,
      updated_after:phase==='delta'?updatedAfter:undefined,
      cursor:phase==='snapshot'?cursor:undefined,
      offset,
      limit,
    })
  });
}
async function pushDomainPage({targetEndpoint,targetToken,adapted,entity,pageSha}){
  return await jsonFetch(targetEndpoint,{
    method:'POST',
    headers:{
      'content-type':'application/json',
      authorization:'Bearer '+targetToken,
    },
    body:JSON.stringify({
      domain:adapted.domain,
      records:adapted.records,
      source:{
        name:'AliEV legacy Base44 migration',
        evidence_state:'MIGRATED_VERIFIED',
        data_status:'imported',
        migration_source_entity:entity,
        migration_page_sha256:pageSha,
      }
    })
  });
}
function phaseKey({phase,updatedAfter='',cutoff}){
  return phase==='snapshot'?'snapshot':'delta:'+updatedAfter+'..'+cutoff;
}
function phaseState(entityState,{phase,updatedAfter='',cutoff}){
  if(phase==='snapshot') return entityState.snapshot;
  const key=phaseKey({phase,updatedAfter,cutoff});
  let existing=entityState.deltas.find(x=>x.key===key);
  if(!existing){
    existing={
      key,updated_after:updatedAfter,cutoff,cursor:null,offset:0,exhausted:false,pages:{},
      source_rows:0,accepted_rows:0,excluded_rows:0,ingest_submitted:0
    };
    entityState.deltas.push(existing);
  }
  return existing;
}
function aggregatePhaseReceipts(phase){
  return {
    source_rows:Number(phase.source_rows||0),
    accepted_rows:Number(phase.accepted_rows||0),
    excluded_rows:Number(phase.excluded_rows||0),
    ingest_submitted:Number(phase.ingest_submitted||0),
    page_count:Object.keys(phase.pages||{}).length,
    exhausted:phase.exhausted===true,
  };
}

export async function migrateAliEvPhase({
  sourceEndpoint,
  sourceKey,
  targetDomainIngestEndpoint,
  targetIngestToken,
  stateDir,
  snapshotCutoff,
  phase='snapshot',
  updatedAfter='',
  cutoff='',
  entities=DEFAULT_ENTITIES,
  pageLimit=100,
  maxPagesPerEntity=10000,
}={}){
  const source=assertSourceEndpoint(sourceEndpoint);
  const target=assertTargetEndpoint(targetDomainIngestEndpoint);
  if(!clean(sourceKey)) throw new Error('migration_source_key_required');
  if(!clean(targetIngestToken)) throw new Error('migration_target_token_required');
  if(!stateDir) throw new Error('migration_state_dir_required');
  if(!['snapshot','delta'].includes(phase)) throw new Error('migration_phase_invalid');
  const snapshot=safeIso(snapshotCutoff);
  const phaseCutoff=phase==='delta'?safeIso(cutoff):snapshot;
  const deltaStart=phase==='delta'?safeIso(updatedAfter):'';
  if(phase==='delta'&&Date.parse(deltaStart)>=Date.parse(phaseCutoff)) throw new Error('migration_delta_window_invalid');

  const root=path.resolve(stateDir);
  fs.mkdirSync(root,{recursive:true,mode:0o700});
  const stateFile=path.join(root,'migration-state.json');
  const state=loadOrCreateState({
    stateFile,sourceEndpoint:source,targetEndpoint:target,snapshotCutoff:snapshot,entities
  });

  for(const entity of entities){
    const entityState=state.entities[entity];
    const current=phaseState(entityState,{phase,updatedAfter:deltaStart,cutoff:phaseCutoff});
    let pageAttempts=0;
    while(!current.exhausted){
      if(pageAttempts++>=maxPagesPerEntity) throw new Error('migration_page_limit_exceeded:'+entity);
      const page=await pullPage({
        sourceEndpoint:source,sourceKey,entity,phase,
        snapshotCutoff:phaseCutoff,
        updatedAfter:deltaStart,
        cursor:current.cursor,
        offset:current.offset,
        limit:pageLimit,
      });
      verifyPage(page,{
        entity,phase,snapshotCutoff:phaseCutoff,updatedAfter:deltaStart
      });

      const pageSha=clean(page.page_sha256);
      if(current.pages[pageSha]){
        current.cursor=page.next_cursor??current.cursor;
        current.offset=page.next_offset??current.offset;
        current.exhausted=page.exhausted===true;
        continue;
      }

      const adapted=adaptLegacyAliEvEntity({entityName:entity,rows:page.rows||[]});
      let ingest={
        submitted:0,inserted:0,updated:0,stale:0,deduped:0,active_records:null
      };
      if(adapted.records.length){
        ingest=await pushDomainPage({
          targetEndpoint:target,targetToken:targetIngestToken,
          adapted,entity,pageSha
        });
        if(ingest?.ok!==true) throw new Error('migration_domain_ingest_not_ok:'+entity);
        if(Number(ingest.submitted)!==adapted.accepted) throw new Error('migration_ingest_submitted_mismatch:'+entity);
        const accounted=['inserted','updated','stale','deduped'].reduce((n,k)=>n+Number(ingest[k]||0),0);
        if(accounted!==Number(ingest.submitted||0)) throw new Error('migration_ingest_outcome_mismatch:'+entity);
      }

      current.pages[pageSha]={
        page_sha256:pageSha,
        row_count:Number(page.page_row_count||0),
        accepted:Number(adapted.accepted||0),
        excluded:Number(adapted.excluded||0),
        ingest_submitted:Number(ingest.submitted||0),
        ingest_outcomes:{
          inserted:Number(ingest.inserted||0),
          updated:Number(ingest.updated||0),
          stale:Number(ingest.stale||0),
          deduped:Number(ingest.deduped||0),
        },
        observed_at:new Date().toISOString(),
      };
      current.source_rows+=Number(page.page_row_count||0);
      current.accepted_rows+=Number(adapted.accepted||0);
      current.excluded_rows+=Number(adapted.excluded||0);
      current.ingest_submitted+=Number(ingest.submitted||0);
      current.cursor=page.next_cursor??null;
      current.offset=page.next_offset??(page.exhausted?current.offset:current.offset+Number(page.page_row_count||0));
      current.exhausted=page.exhausted===true;
      state.updated_at=new Date().toISOString();
      atomicJson(stateFile,state);
    }
  }

  const entitySummary=Object.fromEntries(entities.map(entity=>{
    const p=phaseState(state.entities[entity],{phase,updatedAfter:deltaStart,cutoff:phaseCutoff});
    return [entity,aggregatePhaseReceipts(p)];
  }));
  const totals=Object.values(entitySummary).reduce((acc,row)=>{
    acc.source_rows+=row.source_rows;
    acc.accepted_rows+=row.accepted_rows;
    acc.excluded_rows+=row.excluded_rows;
    acc.ingest_submitted+=row.ingest_submitted;
    acc.page_count+=row.page_count;
    if(!row.exhausted)acc.unexhausted_entities++;
    return acc;
  },{source_rows:0,accepted_rows:0,excluded_rows:0,ingest_submitted:0,page_count:0,unexhausted_entities:0});

  const complete=
    totals.unexhausted_entities===0 &&
    totals.source_rows===totals.accepted_rows+totals.excluded_rows &&
    totals.accepted_rows===totals.ingest_submitted;

  const receipt={
    schema:'evercraft.aliev.streaming-migration-phase-receipt.v1',
    run_id:state.run_id,
    phase,
    snapshot_cutoff:snapshot,
    phase_cutoff:phaseCutoff,
    updated_after:deltaStart||null,
    complete,
    totals,
    entities:entitySummary,
    source_secret_persisted:false,
    target_secret_persisted:false,
    runtime_dependency_created:false,
    completed_at:new Date().toISOString(),
  };
  atomicJson(path.join(root,phase==='snapshot'?'snapshot-receipt.json':'delta-'+sha(phaseKey({phase,updatedAfter:deltaStart,cutoff:phaseCutoff})).slice(0,16)+'.json'),receipt);
  return receipt;
}

export function migrationState({stateDir}={}){
  const file=path.join(path.resolve(stateDir),'migration-state.json');
  return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
}

export { DEFAULT_ENTITIES };
