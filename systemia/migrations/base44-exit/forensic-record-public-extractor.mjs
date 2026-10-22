#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const PUBLIC_FORENSIC_ENTITIES=[
  'ForensicFinding',
  'Source',
  'CorpusCoverage',
  'ArchiveMeta',
  'CorpusPageIndex',
  'DocumentSet',
  'MediaSource',
];

export const PROTECTED_FORENSIC_ENTITIES=[
  'ForensicCandidateFinding',
  'FindingRejection',
  'LegacyFindingAudit',
  'Chunk',
];

const clean=(v)=>String(v??'').trim();
// External legacy extraction is frozen. The only supported candidate source
// during recovery is an explicitly passed, local loopback fixture/service.
function assertOwnedSnapshotSource(value,label){
 let u;
 try{u=new URL(String(value||''))}catch{throw new Error(label+'_missing_or_invalid')}
 if(u.hostname==='base44.app'||u.hostname.endsWith('.base44.app'))
  throw new Error('forensic_snapshot_legacy_provider_frozen');
 if(u.protocol!=='http:'||!['127.0.0.1','localhost','::1'].includes(u.hostname)||
    u.username||u.password)
  throw new Error(label+'_owned_loopback_only');
 return u;
}

const stable=(v)=>{
  if(Array.isArray(v)) return v.map(stable);
  if(v&&typeof v==='object') return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));
  return v;
};
const stableJson=(v)=>JSON.stringify(stable(v));
const sha256=(v)=>createHash('sha256').update(
  Buffer.isBuffer(v)?v:Buffer.from(typeof v==='string'?v:stableJson(v))
).digest('hex');

function atomicWrite(file,bytes,mode=0o600){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o750});
  const tmp=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,bytes,{mode});
  fs.renameSync(tmp,file);
}

async function fetchText(url,{sourceFetch=fetch,maxBytes=5*1024*1024}={}){
  const response=await sourceFetch(url,{
    headers:{'accept':'text/html,application/javascript,text/javascript,*/*','user-agent':'Evercraft-Forensic-Record-Migration/1.0'},
    redirect:'manual',
  });
  if(!response.ok) throw new Error('forensic_public_source_http_'+response.status+':'+new URL(url).pathname);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length>maxBytes) throw new Error('forensic_public_source_document_too_large');
  return bytes.toString('utf8');
}

async function fetchJson(url,{sourceFetch=fetch}={}){
  const response=await sourceFetch(url,{
    headers:{'accept':'application/json','user-agent':'Evercraft-Forensic-Record-Migration/1.0'},
    redirect:'manual',
  });
  const body=await response.json().catch(()=>null);
  if(!response.ok) throw new Error(body?.error||('forensic_public_api_http_'+response.status));
  return body;
}

function candidateIds(text){
  return [...new Set((String(text||'').match(/\b[a-f0-9]{24}\b/gi)||[]).map(x=>x.toLowerCase()))];
}

function sameOriginAssets(html,siteUrl){
  const base=new URL(siteUrl);
  const out=[];
  const regex=/<script[^>]+src=["']([^"']+)["']/gi;
  let match;
  while((match=regex.exec(html))){
    try{
      const url=new URL(match[1],base);
      if(url.origin!==base.origin) continue;
      if(!/^https?:$/.test(url.protocol)) continue;
      out.push(url.toString());
    }catch{}
  }
  return [...new Set(out)].slice(0,8);
}

export async function discoverLegacyForensicApp({
  siteUrl='https://filescompanion.com/',
  apiOrigin='',
  sourceFetch=fetch,
}={}){
  const api=assertOwnedSnapshotSource(apiOrigin,'forensic_public_api_origin');
  const site=new URL(siteUrl);
  if(site.hostname==='base44.app'||site.hostname.endsWith('.base44.app'))
    throw new Error('forensic_snapshot_legacy_provider_frozen');
  if(!['http:','https:'].includes(site.protocol)) throw new Error('forensic_site_url_protocol_invalid');

  const html=await fetchText(site.toString(),{sourceFetch});
  const ids=new Set(candidateIds(html));
  const probed=new Set();
  const matches=[];

  const probeCandidates=async()=>{
    for(const id of [...ids].slice(0,64)){
      if(probed.has(id)) continue;
      probed.add(id);
      const countUrl=new URL('/api/apps/'+id+'/entities/ForensicFinding/count',api);
      try{
        const body=await fetchJson(countUrl,{sourceFetch});
        const count=Number(body?.count);
        if(Number.isInteger(count)&&count>0) matches.push({id,count});
      }catch{}
    }
  };

  await probeCandidates();
  if(matches.length===0){
    for(const asset of sameOriginAssets(html,site)){
      const js=await fetchText(asset,{sourceFetch,maxBytes:8*1024*1024});
      for(const id of candidateIds(js)) ids.add(id);
      await probeCandidates();
      if(matches.length||ids.size>=64) break;
    }
  }
  if(!ids.size) throw new Error('forensic_legacy_app_candidate_not_found');
  if(matches.length!==1){
    if(!matches.length) throw new Error('forensic_legacy_app_probe_no_match');
    throw new Error('forensic_legacy_app_probe_ambiguous');
  }
  const match=matches[0];
  return {
    appId:match.id,
    findingCount:match.count,
    siteOrigin:site.origin,
    apiOrigin:api.origin,
    appIdSha256:'sha256:'+sha256(match.id),
  };
}

async function entityCount({apiOrigin,appId,entity,sourceFetch}){
  const url=new URL('/api/apps/'+appId+'/entities/'+encodeURIComponent(entity)+'/count',apiOrigin);
  const body=await fetchJson(url,{sourceFetch});
  const count=Number(body?.count);
  if(!Number.isInteger(count)||count<0) throw new Error('forensic_public_count_invalid:'+entity);
  return count;
}

async function extractEntity({
  apiOrigin,
  appId,
  entity,
  sourceFetch,
  pageSize=500,
  maxPages=100000,
  onRows=()=>{},
}){
  let cursor='';
  let pages=0;
  let rowCount=0;
  let exhausted=false;
  const seenCursors=new Set();
  while(!exhausted){
    if(pages++>=maxPages) throw new Error('forensic_public_page_limit_exceeded:'+entity);
    const url=new URL('/api/apps/'+appId+'/entities/'+encodeURIComponent(entity)+'/v2/list',apiOrigin);
    url.searchParams.set('limit',String(pageSize));
    url.searchParams.set('sort','id');
    if(cursor) url.searchParams.set('cursor',cursor);
    const page=await fetchJson(url,{sourceFetch});
    const items=Array.isArray(page?.items)?page.items:null;
    if(!items) throw new Error('forensic_public_cursor_page_invalid:'+entity);
    if(items.length>pageSize) throw new Error('forensic_public_cursor_page_oversized:'+entity);
    onRows(items);
    rowCount+=items.length;

    const hasMore=page?.has_more===true;
    const next=clean(page?.next_cursor);
    if(hasMore&&!next) throw new Error('forensic_public_cursor_missing:'+entity);
    if(hasMore&&seenCursors.has(next)) throw new Error('forensic_public_cursor_cycle:'+entity);
    if(hasMore){
      seenCursors.add(next);
      cursor=next;
    }else{
      exhausted=true;
    }
  }
  return {rowCount,pages,terminalExhaustionVerified:true};
}

function findingIntegrity(rows){
  const counts=new Map();
  let min=Infinity,max=0,missingPageReference=0,missingSourceUrl=0,missingTruthLabel=0;
  for(const row of rows){
    const n=Number(row?.finding_number);
    if(Number.isInteger(n)&&n>0){
      counts.set(n,(counts.get(n)||0)+1);
      min=Math.min(min,n); max=Math.max(max,n);
    }
    if(!clean(row?.page_reference)) missingPageReference++;
    if(!clean(row?.source_url)) missingSourceUrl++;
    if(!clean(row?.truth_label)) missingTruthLabel++;
  }
  let duplicateNumberExtraRows=0,duplicateNumberKeys=0,missingSequenceNumbers=0;
  for(const count of counts.values()){
    if(count>1){
      duplicateNumberKeys++;
      duplicateNumberExtraRows+=count-1;
    }
  }
  if(counts.size&&Number.isFinite(min)){
    for(let n=min;n<=max;n++) if(!counts.has(n)) missingSequenceNumbers++;
  }
  return {
    rows:rows.length,
    min_finding_number:counts.size?min:null,
    max_finding_number:counts.size?max:null,
    unique_finding_numbers:counts.size,
    duplicate_number_keys:duplicateNumberKeys,
    duplicate_number_extra_rows:duplicateNumberExtraRows,
    missing_sequence_numbers:missingSequenceNumbers,
    missing_page_reference:missingPageReference,
    missing_source_url:missingSourceUrl,
    missing_truth_label:missingTruthLabel,
  };
}

export async function extractPublicForensicSnapshot({
  siteUrl='https://filescompanion.com/',
  apiOrigin='',
  outDir,
  sourceFetch=fetch,
  entities=PUBLIC_FORENSIC_ENTITIES,
  pageSize=500,
}={}){
  if(!outDir) throw new Error('forensic_snapshot_out_dir_required');
  assertOwnedSnapshotSource(apiOrigin,'forensic_public_api_origin');
  const requested=[...new Set((entities||[]).map(clean).filter(Boolean))];
  if(!requested.length) throw new Error('forensic_snapshot_entities_required');
  for(const entity of requested){
    if(!PUBLIC_FORENSIC_ENTITIES.includes(entity)){
      throw new Error('forensic_snapshot_entity_not_public_allowlisted:'+entity);
    }
  }

  const discovery=await discoverLegacyForensicApp({siteUrl,apiOrigin,sourceFetch});
  const root=path.resolve(outDir);
  fs.mkdirSync(root,{recursive:true,mode:0o750});
  const entityManifest=[];
  let findingShape=null;

  for(const entity of requested){
    const expected=await entityCount({
      apiOrigin:discovery.apiOrigin,
      appId:discovery.appId,
      entity,
      sourceFetch
    });
    const rows=[];
    const extraction=await extractEntity({
      apiOrigin:discovery.apiOrigin,
      appId:discovery.appId,
      entity,
      sourceFetch,
      pageSize,
      onRows:(batch)=>rows.push(...batch),
    });
    if(extraction.rowCount!==expected){
      throw new Error('forensic_public_terminal_count_mismatch:'+entity+':expected='+expected+':observed='+extraction.rowCount);
    }

    const jsonl=rows.map(row=>stableJson(row)).join('\n')+(rows.length?'\n':'');
    const bytes=Buffer.from(jsonl);
    const digest=sha256(bytes);
    const filename=entity.toLowerCase()+'-'+digest+'.jsonl';
    atomicWrite(path.join(root,filename),bytes);

    const reopened=fs.readFileSync(path.join(root,filename));
    if(sha256(reopened)!==digest||reopened.byteLength!==bytes.byteLength){
      throw new Error('forensic_public_snapshot_persistence_verification_failed:'+entity);
    }

    entityManifest.push({
      entity,
      rows:rows.length,
      pages:extraction.pages,
      terminal_exhaustion_verified:true,
      sha256:'sha256:'+digest,
      byte_count:bytes.byteLength,
      file:filename,
    });

    if(entity==='ForensicFinding') findingShape=findingIntegrity(rows);
  }

  const generatedAt=new Date().toISOString();
  const manifestBody={
    schema:'evercraft.forensic-record.public-snapshot-manifest.v1',
    source:{
      canonical_public_url:new URL(siteUrl).origin+'/',
      api_host:new URL(discovery.apiOrigin).hostname,
      legacy_app_id_sha256:discovery.appIdSha256,
      legacy_app_id_persisted:false,
      source_role:'migration_only',
    },
    entities:entityManifest,
    protected_entities_excluded:[...PROTECTED_FORENSIC_ENTITIES],
    finding_integrity:findingShape,
    generated_at:generatedAt,
  };
  const manifestHash='sha256:'+sha256(stableJson(manifestBody));
  const manifest={...manifestBody,manifest_sha256:manifestHash};
  atomicWrite(path.join(root,'manifest.json'),Buffer.from(JSON.stringify(manifest,null,2)+'\n'));

  const receipt={
    schema:'evercraft.forensic-record.public-snapshot-receipt.v1',
    ok:true,
    entity_count:entityManifest.length,
    total_rows:entityManifest.reduce((n,x)=>n+x.rows,0),
    finding_rows:findingShape?.rows??0,
    all_terminal_exhaustion_verified:entityManifest.every(x=>x.terminal_exhaustion_verified===true),
    exact_source_count_reconciliation:true,
    protected_entities_excluded:true,
    legacy_app_id_persisted:false,
    runtime_dependency_created:false,
    base44_target_created:false,
    public_cutover_authorized:false,
    legacy_retirement_authorized:false,
    manifest_sha256:manifestHash,
    generated_at:generatedAt,
  };
  atomicWrite(path.join(root,'extraction-receipt.json'),Buffer.from(JSON.stringify(receipt,null,2)+'\n'));
  return {manifest,receipt};
}

async function main(){
  const args=process.argv.slice(2);
  const value=(name,fallback='')=>{const i=args.indexOf(name);return i>=0?args[i+1]||fallback:fallback;};
  const outDir=value('--out');
  const siteUrl=value('--site','https://filescompanion.com/');
  const apiOrigin=value('--api-origin','https://base44.app');
  const result=await extractPublicForensicSnapshot({siteUrl,apiOrigin,outDir});
  console.log(JSON.stringify({
    ok:true,
    schema:result.receipt.schema,
    entity_count:result.receipt.entity_count,
    total_rows:result.receipt.total_rows,
    finding_rows:result.receipt.finding_rows,
    manifest_sha256:result.receipt.manifest_sha256,
    protected_entities_excluded:true,
    legacy_app_id_persisted:false,
    public_cutover_authorized:false,
  },null,2));
}

if(import.meta.url===new URL('file://'+process.argv[1]).href){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
