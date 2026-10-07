import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

export const FORENSIC_DOMAINS=new Set([
  'findings',
  'sources',
  'coverage',
  'candidates',
  'rejections',
  'audits',
  'archive_meta',
  'chunks',
  'page_index',
  'document_sets',
  'media'
]);

const clean=(v)=>String(v??'').trim();
const safeKey=(v)=>clean(v).replace(/[^a-zA-Z0-9._:-]/g,'_').slice(0,220);
const stable=(v)=>{
  if(Array.isArray(v)) return v.map(stable);
  if(v&&typeof v==='object') return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));
  return v;
};
const sha256=(v)=>createHash('sha256').update(
  Buffer.isBuffer(v)?v:Buffer.from(typeof v==='string'?v:JSON.stringify(stable(v)))
).digest('hex');

function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o750});
  const tmp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}
function indexPath(stateDir){ return path.join(stateDir,'index.json'); }
function blobPath(stateDir,domain,digest){ return path.join(stateDir,'records',domain,digest+'.json'); }
function emptyIndex(){
  return {
    schema:'evercraft.forensic-record.corpus-index.v1',
    entries:{},
    finding_numbers:{},
    source_documents:{},
    finding_number_collisions:{},
    updated_at:null
  };
}
function loadIndex(stateDir){
  const file=indexPath(stateDir);
  if(!fs.existsSync(file)) return emptyIndex();
  const parsed=JSON.parse(fs.readFileSync(file,'utf8'));
  if(parsed?.schema!=='evercraft.forensic-record.corpus-index.v1') throw new Error('forensic_corpus_index_schema_invalid');
  parsed.entries=parsed.entries||{};
  parsed.finding_numbers=parsed.finding_numbers||{};
  parsed.source_documents=parsed.source_documents||{};
  parsed.finding_number_collisions=parsed.finding_number_collisions||{};
  return parsed;
}
function assertDomain(domain){
  const normalized=clean(domain);
  if(!FORENSIC_DOMAINS.has(normalized)) throw new Error('forensic_domain_invalid:'+normalized);
  return normalized;
}
function assertRecord(domain,record){
  if(!record||typeof record!=='object'||Array.isArray(record)) throw new Error('forensic_record_object_required');
  if(!clean(record.record_key)) throw new Error('forensic_record_key_required');
  if(domain==='findings'){
    if(!clean(record.title)) throw new Error('forensic_finding_title_required');
    const n=Number(record.finding_number);
    if(record.finding_number!==null&&record.finding_number!==undefined&&(!Number.isInteger(n)||n<=0)){
      throw new Error('forensic_finding_number_invalid');
    }
    const truth=clean(record.truth_label);
    if(truth&&!['EVIDENCE','FACT','ASSUMPTION','HYPOTHESIS','OPINION','ALLEGATION','TESTIMONY','COMMENTARY','UNLABELED'].includes(truth)){
      throw new Error('forensic_truth_label_invalid');
    }
    if(!clean(record.evidence_boundary)) throw new Error('forensic_evidence_boundary_required');
  }
  if(domain==='sources'&&!clean(record.title)) throw new Error('forensic_source_title_required');
  return record;
}
function addUnique(map,key,value){
  if(!key)return;
  const current=Array.isArray(map[key])?map[key]:[];
  if(!current.includes(value)) current.push(value);
  map[key]=current;
}
function removeValue(map,key,value){
  const current=Array.isArray(map[key])?map[key]:[];
  const next=current.filter(x=>x!==value);
  if(next.length) map[key]=next;
  else delete map[key];
}
function reindexEntry(index,recordKey,previous,next,domain){
  if(domain!=='findings') return;
  if(previous){
    const prevN=Number(previous.finding_number);
    if(Number.isInteger(prevN)&&prevN>0) removeValue(index.finding_numbers,String(prevN),recordKey);
    const prevSource=clean(previous.source_document).toLowerCase();
    if(prevSource) removeValue(index.source_documents,prevSource,recordKey);
  }
  const n=Number(next.finding_number);
  if(Number.isInteger(n)&&n>0) addUnique(index.finding_numbers,String(n),recordKey);
  const source=clean(next.source_document).toLowerCase();
  if(source) addUnique(index.source_documents,source,recordKey);
}
function refreshCollisions(index){
  const collisions={};
  for(const [number,keys] of Object.entries(index.finding_numbers||{})){
    if(Array.isArray(keys)&&keys.length>1) collisions[number]=[...keys].sort();
  }
  index.finding_number_collisions=collisions;
}
function readEntryRecord(stateDir,entry){
  const file=blobPath(stateDir,entry.domain,entry.active_sha256);
  if(!fs.existsSync(file)) throw new Error('forensic_indexed_record_missing:'+entry.record_key);
  const bytes=fs.readFileSync(file);
  const actual=sha256(bytes);
  if(actual!==entry.active_sha256) throw new Error('forensic_record_digest_mismatch:'+entry.record_key);
  return JSON.parse(bytes.toString('utf8'));
}
function storeBlob(stateDir,domain,record){
  const bytes=Buffer.from(JSON.stringify(stable(record)));
  const digest=sha256(bytes);
  const file=blobPath(stateDir,domain,digest);
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o750});
  if(!fs.existsSync(file)) fs.writeFileSync(file,bytes,{mode:0o600});
  const reopened=fs.readFileSync(file);
  if(sha256(reopened)!==digest||reopened.byteLength!==bytes.byteLength) throw new Error('forensic_record_persistence_verification_failed');
  return {digest,byte_count:bytes.byteLength};
}

export function ingestForensicRecords({stateDir,domain,records=[],source={}}={}){
  if(!stateDir) throw new Error('forensic_state_dir_required');
  const normalizedDomain=assertDomain(domain);
  if(!Array.isArray(records)||!records.length) throw new Error('forensic_records_required');
  if(records.length>5000) throw new Error('forensic_ingest_batch_too_large');
  const root=path.resolve(stateDir);
  fs.mkdirSync(root,{recursive:true,mode:0o750});
  const index=loadIndex(root);
  const outcomes=[];
  let inserted=0,updated=0,deduped=0;
  for(const raw of records){
    const record=assertRecord(normalizedDomain,structuredClone(raw));
    const key=clean(record.record_key);
    const persisted=storeBlob(root,normalizedDomain,record);
    const previousEntry=index.entries[key]||null;
    const previousRecord=previousEntry?readEntryRecord(root,previousEntry):null;
    if(previousEntry?.active_sha256===persisted.digest){
      deduped++;
      outcomes.push({record_key:key,outcome:'deduped',sha256:persisted.digest});
      continue;
    }
    if(previousEntry&&previousEntry.domain!==normalizedDomain) throw new Error('forensic_record_domain_conflict:'+key);
    const versions=previousEntry?.versions?[...previousEntry.versions]:[];
    if(previousEntry?.active_sha256&&!versions.includes(previousEntry.active_sha256)) versions.push(previousEntry.active_sha256);
    index.entries[key]={
      record_key:key,
      domain:normalizedDomain,
      active_sha256:persisted.digest,
      byte_count:persisted.byte_count,
      versions,
      migrated_from:clean(record?.migration_lineage?.source_platform)||null,
      source_entity:clean(record?.migration_lineage?.source_entity)||null,
      finding_number:normalizedDomain==='findings'&&Number.isInteger(Number(record.finding_number))?Number(record.finding_number):null,
      source_document:normalizedDomain==='findings'?clean(record.source_document)||null:null,
      updated_at:new Date().toISOString()
    };
    reindexEntry(index,key,previousRecord,record,normalizedDomain);
    if(previousEntry) updated++; else inserted++;
    outcomes.push({record_key:key,outcome:previousEntry?'versioned_update':'inserted',sha256:persisted.digest});
  }
  refreshCollisions(index);
  index.updated_at=new Date().toISOString();
  atomicJson(indexPath(root),index);
  return {
    ok:true,
    schema:'evercraft.forensic-record.corpus-ingest-receipt.v1',
    domain:normalizedDomain,
    submitted:records.length,
    inserted,
    updated,
    deduped,
    finding_number_collision_keys:Object.keys(index.finding_number_collisions).length,
    source:{
      name:clean(source.name)||null,
      evidence_state:clean(source.evidence_state)||null,
      migration_page_sha256:clean(source.migration_page_sha256)||null
    },
    outcomes,
    stored_at:index.updated_at
  };
}

export function getForensicRecord({stateDir,recordKey}={}){
  const root=path.resolve(stateDir||'.');
  const index=loadIndex(root);
  const entry=index.entries[clean(recordKey)];
  if(!entry) return null;
  return {entry,record:readEntryRecord(root,entry)};
}

export function searchForensicFindings({stateDir,findingNumber=null,sourceDocument='',text='',limit=50}={}){
  const root=path.resolve(stateDir||'.');
  const index=loadIndex(root);
  let keys=null;
  const n=Number(findingNumber);
  if(Number.isInteger(n)&&n>0) keys=[...(index.finding_numbers[String(n)]||[])];
  const source=clean(sourceDocument).toLowerCase();
  if(source){
    const sourceKeys=[...(index.source_documents[source]||[])];
    keys=keys===null?sourceKeys:keys.filter(k=>sourceKeys.includes(k));
  }
  if(keys===null) keys=Object.values(index.entries).filter(e=>e.domain==='findings').map(e=>e.record_key);
  const needle=clean(text).toLowerCase();
  const matched=[];
  for(const key of keys){
    const entry=index.entries[key];
    if(!entry||entry.domain!=='findings') continue;
    const record=readEntryRecord(root,entry);
    if(needle){
      const hay=[record.title,record.quote,record.significance,record.source_document,record.category].map(clean).join(' ').toLowerCase();
      if(!hay.includes(needle)) continue;
    }
    matched.push(record);
  }
  const pageOrder=(value)=>{
    const match=clean(value).match(/\d+/);
    return match?Number(match[0]):Number.MAX_SAFE_INTEGER;
  };
  matched.sort((a,b)=>{
    const an=Number(a.finding_number),bn=Number(b.finding_number);
    if(Number.isFinite(an)&&Number.isFinite(bn)&&an!==bn) return an-bn;
    const sourceCmp=clean(a.source_document).localeCompare(clean(b.source_document));
    if(sourceCmp) return sourceCmp;
    const pageCmp=pageOrder(a.page_reference)-pageOrder(b.page_reference);
    if(pageCmp) return pageCmp;
    const titleCmp=clean(a.title).localeCompare(clean(b.title));
    if(titleCmp) return titleCmp;
    return clean(a.record_key).localeCompare(clean(b.record_key));
  });
  const boundedLimit=Math.max(1,Math.min(Number(limit)||50,200));
  const results=matched.slice(0,boundedLimit);
  return {
    schema:'evercraft.forensic-record.search-results.v1',
    finding_number:Number.isInteger(n)&&n>0?n:null,
    source_document:sourceDocument||null,
    text:text||null,
    count:results.length,
    results
  };
}

export function forensicCorpusHealth({stateDir}={}){
  const root=path.resolve(stateDir||'.');
  const index=loadIndex(root);
  const findingEntries=Object.values(index.entries).filter(e=>e.domain==='findings');
  let missingPageReference=0,missingSourceUrl=0,missingTruthLabel=0;
  const canonicalSources=new Set();
  for(const entry of findingEntries){
    const record=readEntryRecord(root,entry);
    if(!clean(record.page_reference)) missingPageReference++;
    if(!clean(record.source_url)) missingSourceUrl++;
    if(!clean(record.truth_label)) missingTruthLabel++;
    if(clean(record.source_document)) canonicalSources.add(clean(record.source_document));
  }
  const collisionRows=Object.values(index.finding_number_collisions||{}).reduce((n,keys)=>n+Math.max(0,keys.length-1),0);
  return {
    schema:'evercraft.forensic-record.corpus-health.v1',
    ok:true,
    canonical_store:'content-addressed-forensic-corpus-v1',
    total_records:Object.keys(index.entries).length,
    finding_rows:findingEntries.length,
    unique_finding_numbers:Object.keys(index.finding_numbers||{}).length,
    duplicate_number_keys:Object.keys(index.finding_number_collisions||{}).length,
    duplicate_number_extra_rows:collisionRows,
    missing_page_reference:missingPageReference,
    missing_source_url:missingSourceUrl,
    missing_truth_label:missingTruthLabel,
    canonical_source_documents:canonicalSources.size,
    base44_runtime_required:false,
    destructive_dedupe:false,
    prior_versions_preserved:true,
    updated_at:index.updated_at
  };
}
