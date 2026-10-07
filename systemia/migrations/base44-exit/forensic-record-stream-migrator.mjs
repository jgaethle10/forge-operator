import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { adaptLegacyForensicRecordEntity } from './forensic-record-domain-adapter.mjs';

const SOURCE_SCHEMA='evercraft.forensic-record.base44-exit-batch.v1';
const PURPOSE='forensic-record-base44-exit-v1';

export const FORENSIC_ENTITY_DOMAIN={
  ForensicFinding:'findings',
  Source:'sources',
  CorpusCoverage:'coverage',
  ForensicCandidateFinding:'candidates',
  FindingRejection:'rejections',
  LegacyFindingAudit:'audits',
  ArchiveMeta:'archive_meta',
  Chunk:'chunks',
  CorpusPageIndex:'page_index',
  DocumentSet:'document_sets',
  MediaSource:'media',
};

export const DEFAULT_FORENSIC_ENTITIES=Object.keys(FORENSIC_ENTITY_DOMAIN);

const clean=(v)=>String(v??'').trim();
const stable=(v)=>{
  if(Array.isArray(v)) return v.map(stable);
  if(v&&typeof v==='object') return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));
  return v;
};
const stableJson=(v)=>JSON.stringify(stable(v));
const sha=(value)=>createHash('sha256').update(
  Buffer.isBuffer(value)?value:Buffer.from(typeof value==='string'?value:stableJson(value))
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
    throw new Error('forensic_legacy_source_requires_https_or_loopback');
  }
  return url.toString();
}
function assertTargetEndpoint(value){
  const url=new URL(clean(value));
  if(/(^|\.)base44\.app$/i.test(url.hostname)) throw new Error('forensic_owned_target_must_not_be_base44');
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback(url.hostname))){
    throw new Error('forensic_owned_target_requires_https_or_loopback');
  }
  return url.toString();
}
function safeIso(value){
  const n=Date.parse(clean(value));
  if(!Number.isFinite(n)) throw new Error('forensic_migration_cutoff_invalid');
  return new Date(n).toISOString();
}
function withoutKey(object,key){
  return Object.fromEntries(Object.entries(object||{}).filter(([k])=>k!==key));
}
function verifyPage(page,{entity,snapshotCutoff}){
  if(page?.schema!==SOURCE_SCHEMA||page?.ok!==true) throw new Error('forensic_migration_page_schema_invalid');
  if(clean(page.source_product)!=='forensic-record') throw new Error('forensic_migration_source_product_mismatch');
  if(clean(page.source_entity)!==entity) throw new Error('forensic_migration_source_entity_mismatch');
  if(clean(page.snapshot_cutoff)!==snapshotCutoff) throw new Error('forensic_migration_snapshot_cutoff_mismatch');
  const expectedPageSha=clean(page.page_sha256);
  if(!/^[a-f0-9]{64}$/i.test(expectedPageSha)) throw new Error('forensic_migration_page_sha_missing');
  if(sha(stableJson(withoutKey(page,'page_sha256')))!==expectedPageSha){
    throw new Error('forensic_migration_page_sha_mismatch');
  }
  for(const row of page.rows||[]){
    const expected=clean(row?._migration_row_sha256);
    if(!/^[a-f0-9]{64}$/i.test(expected)) throw new Error('forensic_migration_row_sha_missing');
    if(sha(stableJson(withoutKey(row,'_migration_row_sha256')))!==expected){
      throw new Error('forensic_migration_row_sha_mismatch');
    }
  }
  if(Number(page.page_row_count)!==(page.rows||[]).length) throw new Error('forensic_migration_page_count_mismatch');
  return true;
}
async function jsonFetch(url,options={}){
  const response=await fetch(url,options);
  const body=await response.json().catch(()=>null);
  if(!response.ok){
    const error=new Error(body?.error||('forensic_migration_http_'+response.status));
    error.status=response.status;
    error.body=body;
    throw error;
  }
  return body;
}
async function pullPage({sourceEndpoint,sourceKey,entity,snapshotCutoff,cursor=null,offset=0,limit=100}){
  return await jsonFetch(sourceEndpoint,{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-systemia-machine-key':sourceKey,
      'x-evercraft-migration-purpose':PURPOSE,
    },
    body:JSON.stringify({entity,snapshot_cutoff:snapshotCutoff,cursor,offset,limit})
  });
}
async function pushPage({targetEndpoint,targetToken,domain,records,entity,pageSha}){
  return await jsonFetch(targetEndpoint,{
    method:'POST',
    headers:{'content-type':'application/json',authorization:'Bearer '+targetToken},
    body:JSON.stringify({
      domain,
      records,
      source:{
        name:'The Forensic Record legacy migration',
        evidence_state:'MIGRATED_VERIFIED',
        migration_source_entity:entity,
        migration_page_sha256:pageSha,
      }
    })
  });
}
function stateTemplate({sourceEndpoint,targetEndpoint,snapshotCutoff,entities}){
  return {
    schema:'evercraft.forensic-record.streaming-migration-state.v1',
    run_id:'forensic_migrate_'+randomBytes(12).toString('hex'),
    source_host:new URL(sourceEndpoint).hostname,
    target_host:new URL(targetEndpoint).hostname,
    snapshot_cutoff:snapshotCutoff,
    source_secret_persisted:false,
    target_secret_persisted:false,
    entities:Object.fromEntries(entities.map(entity=>[entity,{
      cursor:null,offset:0,exhausted:false,pages:{},source_rows:0,accepted_rows:0,excluded_rows:0,ingest_submitted:0
    }])),
    created_at:new Date().toISOString(),
    updated_at:new Date().toISOString()
  };
}
function loadState({stateFile,sourceEndpoint,targetEndpoint,snapshotCutoff,entities}){
  if(fs.existsSync(stateFile)){
    const state=JSON.parse(fs.readFileSync(stateFile,'utf8'));
    if(state?.schema!=='evercraft.forensic-record.streaming-migration-state.v1') throw new Error('forensic_migration_state_schema_invalid');
    if(state.snapshot_cutoff!==snapshotCutoff) throw new Error('forensic_migration_state_cutoff_mismatch');
    for(const entity of entities) if(!state.entities?.[entity]) throw new Error('forensic_migration_state_entity_missing:'+entity);
    return state;
  }
  const state=stateTemplate({sourceEndpoint,targetEndpoint,snapshotCutoff,entities});
  atomicJson(stateFile,state);
  return state;
}

export async function migrateForensicRecordSnapshot({
  sourceEndpoint,
  sourceKey,
  targetIngestEndpoint,
  targetIngestToken,
  stateDir,
  snapshotCutoff,
  entities=DEFAULT_FORENSIC_ENTITIES,
  pageLimit=100,
  maxPagesPerEntity=100000
}={}){
  const source=assertSourceEndpoint(sourceEndpoint);
  const target=assertTargetEndpoint(targetIngestEndpoint);
  if(!clean(sourceKey)) throw new Error('forensic_migration_source_key_required');
  if(!clean(targetIngestToken)) throw new Error('forensic_migration_target_token_required');
  if(!stateDir) throw new Error('forensic_migration_state_dir_required');
  const cutoff=safeIso(snapshotCutoff);
  const requested=[...new Set(entities.map(clean).filter(Boolean))];
  for(const entity of requested){
    if(!FORENSIC_ENTITY_DOMAIN[entity]) throw new Error('forensic_migration_entity_not_allowlisted:'+entity);
  }

  const root=path.resolve(stateDir);
  fs.mkdirSync(root,{recursive:true,mode:0o700});
  const stateFile=path.join(root,'migration-state.json');
  const state=loadState({stateFile,sourceEndpoint:source,targetEndpoint:target,snapshotCutoff:cutoff,entities:requested});

  for(const entity of requested){
    const current=state.entities[entity];
    let attempts=0;
    while(!current.exhausted){
      if(attempts++>=maxPagesPerEntity) throw new Error('forensic_migration_page_limit_exceeded:'+entity);
      const page=await pullPage({
        sourceEndpoint:source,sourceKey,entity,snapshotCutoff:cutoff,
        cursor:current.cursor,offset:current.offset,limit:pageLimit
      });
      verifyPage(page,{entity,snapshotCutoff:cutoff});
      const pageSha=clean(page.page_sha256);
      if(current.pages[pageSha]){
        current.cursor=page.next_cursor??current.cursor;
        current.offset=page.next_offset??current.offset;
        current.exhausted=page.exhausted===true;
        continue;
      }

      const adapted=adaptLegacyForensicRecordEntity({entityName:entity,rows:page.rows||[]});
      let ingest={submitted:0,inserted:0,updated:0,deduped:0};
      if(adapted.records.length){
        ingest=await pushPage({
          targetEndpoint:target,targetToken:targetIngestToken,
          domain:FORENSIC_ENTITY_DOMAIN[entity],records:adapted.records,entity,pageSha
        });
        if(ingest?.ok!==true) throw new Error('forensic_migration_ingest_not_ok:'+entity);
        if(Number(ingest.submitted)!==Number(adapted.accepted)) throw new Error('forensic_migration_ingest_submitted_mismatch:'+entity);
      }

      current.pages[pageSha]={
        page_sha256:pageSha,
        source_rows:Number(page.page_row_count||0),
        accepted:Number(adapted.accepted||0),
        excluded:Number(adapted.excluded||0),
        ingest_submitted:Number(ingest.submitted||0),
        ingest_outcomes:{
          inserted:Number(ingest.inserted||0),
          updated:Number(ingest.updated||0),
          deduped:Number(ingest.deduped||0)
        },
        observed_at:new Date().toISOString()
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

  const summary=Object.fromEntries(requested.map(entity=>{
    const x=state.entities[entity];
    return [entity,{
      source_rows:Number(x.source_rows||0),
      accepted_rows:Number(x.accepted_rows||0),
      excluded_rows:Number(x.excluded_rows||0),
      ingest_submitted:Number(x.ingest_submitted||0),
      page_count:Object.keys(x.pages||{}).length,
      exhausted:x.exhausted===true
    }];
  }));
  const totals=Object.values(summary).reduce((acc,x)=>{
    acc.source_rows+=x.source_rows;
    acc.accepted_rows+=x.accepted_rows;
    acc.excluded_rows+=x.excluded_rows;
    acc.ingest_submitted+=x.ingest_submitted;
    acc.page_count+=x.page_count;
    if(!x.exhausted) acc.unexhausted_entities++;
    return acc;
  },{source_rows:0,accepted_rows:0,excluded_rows:0,ingest_submitted:0,page_count:0,unexhausted_entities:0});
  const complete=
    totals.unexhausted_entities===0 &&
    totals.source_rows===totals.accepted_rows+totals.excluded_rows &&
    totals.accepted_rows===totals.ingest_submitted;

  const receipt={
    schema:'evercraft.forensic-record.streaming-migration-receipt.v1',
    run_id:state.run_id,
    snapshot_cutoff:cutoff,
    complete,
    totals,
    entities:summary,
    source_secret_persisted:false,
    target_secret_persisted:false,
    target_base44:false,
    runtime_dependency_created:false,
    legacy_retirement_authorized:false,
    completed_at:new Date().toISOString()
  };
  atomicJson(path.join(root,'snapshot-receipt.json'),receipt);
  return receipt;
}
