#!/usr/bin/env node
// Evercraft AIW owned source watcher: official public metadata only.
// Kaidance may observe receipts. It cannot approve source changes, fetch full
// inventories, edit source, replace Caddy releases, or claim fresh bridge data.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const REGISTRY=path.join(ROOT,'systemia/infrastructure-watch/source-registry.v1.json');
const SHA=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const MAX_SOURCES=8;
const INTERVAL=86400*1000;
const MAX_RESPONSE=1000000;

function safeJson(file){
  if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw Error('aiw_symlink_read_refused');
  const size=fs.statSync(file).size;
  if(size>256000)throw Error('aiw_receipt_too_large');
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
function writeJson(file,obj){
  const parent=path.dirname(file);
  fs.mkdirSync(parent,{recursive:true,mode:0o700});
  if(fs.lstatSync(parent).isSymbolicLink())throw Error('aiw_output_directory_symlink_refused');
  if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw Error('aiw_output_file_symlink_refused');
  const temp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp';
  try{
    fs.writeFileSync(temp,JSON.stringify(obj,null,2)+'\n',{flag:'wx',mode:0o600});
    fs.renameSync(temp,file);
  }finally{if(fs.existsSync(temp))fs.unlinkSync(temp)}
}
export function validateAiWSources(registry){
  if(registry?.schema!=='evercraft.aiw.official-source-registry.v1'||
     registry.project_key!=='american-infrastructure-watch'||
     registry.cadence_seconds!==86400||
     registry.max_fetch_bytes!==MAX_RESPONSE||
     !Array.isArray(registry.sources)||
     registry.sources.length<1||registry.sources.length>MAX_SOURCES||
     registry.authority?.publish!==false||registry.authority?.ingest_data!==false||
     registry.authority?.modify_production!==false)throw Error('invalid_aiw_source_registry');
  const seen=new Set();
  for(const source of registry.sources){
    if(!/^[a-z0-9-]{3,90}$/.test(source.key||'')||seen.has(source.key))
      throw Error('duplicate_or_invalid_aiw_source');
    seen.add(source.key);
    const u=new URL(source.url);
    if(u.protocol!=='https:'||u.username||u.password||u.port||
       u.hostname!=='www.fhwa.dot.gov'||!u.pathname.startsWith('/bridge/nbi/')||
       u.search||u.hash||source.content_type!=='text/html')
      throw Error('unapproved_aiw_source_url');
  }
  return registry;
}
export async function probeAiWSource(source,{fetcher=fetch}={}){
  try{
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),12000);
    let res;
    try{
      res=await fetcher(source.url,{method:'GET',redirect:'manual',signal:ctrl.signal,
        headers:{'Accept':'text/html','User-Agent':'Evercraft-AIW-Source-Watch/1.0'}});
      if(res.status!==200||!String(res.headers.get('content-type')||'').toLowerCase().includes('text/html'))
        throw Error('source_http_or_content_type_unverified');
      const declared=Number(res.headers.get('content-length'));
      if(Number.isFinite(declared)&&declared>MAX_RESPONSE)
        throw Error('source_over_size_budget');
      let total=0;
      const chunks=[];
      for await(const chunk of res.body){
        total+=chunk.byteLength;
        if(total>MAX_RESPONSE)throw Error('source_over_size_budget');
        chunks.push(Buffer.from(chunk));
      }
      if(total<100)throw Error('source_response_too_small');
      const bytes=Buffer.concat(chunks);
      const body=bytes.toString('utf8');
      if(!/<html|<!doctype|<body/i.test(body))throw Error('source_page_shape_unverified');
      return {key:source.key,url:source.url,scope:source.scope,source_year:source.source_year||null,
        status:'reachable',fingerprint:SHA(bytes),bytes:total,source_data_ingested:false};
    }finally{clearTimeout(timer);await res?.body?.cancel?.().catch(()=>{})}
  }catch(e){
    return {key:source.key,url:source.url,scope:source.scope,source_year:source.source_year||null,
      status:'unverified',reason:String(e?.message||e).slice(0,100),fingerprint:null,
      source_data_ingested:false};
  }
}
function privateRoot(out){
  const dir=path.resolve(out);
  if(dir===ROOT||dir.startsWith(ROOT+path.sep))
    throw Error('aiw_private_output_required_outside_source_tree');
  if(fs.existsSync(dir)&&fs.lstatSync(dir).isSymbolicLink())
    throw Error('aiw_output_symlink_refused');
  return dir;
}
export async function runAiWSourceCycle({
  outDir,now=new Date(),fetcher=fetch,registry=JSON.parse(fs.readFileSync(REGISTRY,'utf8'))
}={}){
  validateAiWSources(registry);
  if(!outDir)throw Error('aiw_private_output_required');
  const out=privateRoot(outDir);
  const time=now instanceof Date?now:new Date(now);
  if(!Number.isFinite(time.getTime()))throw Error('aiw_invalid_clock');
  const stateFile=path.join(out,'state.json');
  const previous=fs.existsSync(stateFile)?safeJson(stateFile):null;
  if(previous&&previous.schema!=='evercraft.aiw.evidence-watch.state.v1')
    throw Error('aiw_unknown_previous_state');
  const last=previous?.observed_at?Date.parse(previous.observed_at):null;
  if(last!==null&&(!Number.isFinite(last)||time.getTime()<last-60000))
    throw Error('aiw_clock_rollback');
  const fingerprint=SHA(Buffer.from(JSON.stringify(registry)));
  const due=!previous||previous.registry_fingerprint!==fingerprint||
    time.getTime()-last>=INTERVAL;
  if(!due)return {skipped:true,reason:'daily_evidence_check_not_due',
    last_observed_at:previous.observed_at,previous_status:previous.status};
  const results=[];
  // Bounded, sequential fetches to official allowlisted federal HTML pages only.
  for(const source of registry.sources)results.push(await probeAiWSource(source,{fetcher}));
  const prior=previous?.fingerprints||{};
  const observed=Object.fromEntries(results.filter(x=>x.status==='reachable')
    .map(x=>[x.key,x.fingerprint]));
  const changed=results.filter(x=>x.status==='reachable'&&prior[x.key]&&
    prior[x.key]!==x.fingerprint).map(x=>x.key);
  const unavailable=results.filter(x=>x.status!=='reachable').map(x=>x.key);
  const candidates=[
    ...changed.map(key=>({key:'aiw:'+key+':source-change',action:'review_official_source_metadata_change',
      source_key:key,approval_required:true,publication_authorized:false})),
    ...unavailable.map(key=>({key:'aiw:'+key+':source-unverified',action:'investigate_official_source_reachability',
      source_key:key,approval_required:true,publication_authorized:false}))
  ];
  const status=unavailable.length?'degraded':changed.length?'review_required':'baseline_or_unchanged';
  const observed_at=time.toISOString();
  const latest={schema:'evercraft.aiw.evidence-watch.v1',observed_at,
    project_key:'american-infrastructure-watch',status,
    source_authority:'fhwa_official_public_only',
    source_registry_fingerprint:fingerprint,
    sources:results,changed_source_keys:changed,unverified_source_keys:unavailable,
    review_required:candidates.length>0,review_candidates:candidates,
    evidence_not_live_hazards:true,national_2026_records_complete:false,
    discovered_new_bridge_records:0,ingested_bridge_records:0,
    releases_prepared:0,publications_authorized:0,production_changes:0,
    no_auto_approval:true,no_public_data_mutation:true};
  const state={schema:'evercraft.aiw.evidence-watch.state.v1',
    observed_at,registry_fingerprint:fingerprint,status,
    fingerprints:{...prior,...observed}};
  const queue={schema:'evercraft.aiw.evidence-watch.queue.v1',observed_at,
    review_only:true,auto_execution_authorized:false,
    candidates};
  const snapshot={schema:'evercraft.kaidance.mission-snapshot.v1',
    observed_at,snapshot_ref:SHA(Buffer.from(JSON.stringify({observed_at,fingerprint,changed,unavailable}))),
    counts:{scanned:results.length,changed:changed.length,admitted:0,held:candidates.length},
    evidence_refs:['source:systemia/infrastructure-watch/source-registry.v1.json',
      ...results.filter(x=>x.fingerprint).map(x=>x.fingerprint)].slice(0,25)};
  writeJson(path.join(out,'latest.json'),latest);
  writeJson(path.join(out,'queue.json'),queue);
  writeJson(path.join(out,'mission-snapshot.json'),snapshot);
  writeJson(stateFile,state); // Commit state watermark LAST for crash-safe retry.
  return {skipped:false,status,changed:changed.length,unverified:unavailable.length,
    receipt_ref:SHA(Buffer.from(JSON.stringify(latest))),latest};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const opt=name=>{const i=process.argv.indexOf(name);return i<0?'':process.argv[i+1]};
  try{
    const out=opt('--out')||process.env.SYSTEMIA_AIW_EVIDENCE_OUT_DIR;
    const result=await runAiWSourceCycle({outDir:out});
    console.log(JSON.stringify({schema:'evercraft.aiw.evidence-watch-cli.v1',
      ok:true,skipped:result.skipped||false,status:result.status||result.previous_status||null,
      changed:result.changed||0,unverified:result.unverified||0,
      publication_authorized:false,source_ingestion_performed:false}));
  }catch(e){
    console.error(JSON.stringify({schema:'evercraft.aiw.evidence-watch-cli.v1',
      ok:false,reason:String(e?.message||e).slice(0,120)}));
    process.exitCode=1;
  }
}
