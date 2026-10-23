// Evercraft Clip: bounded, private, no-Base44-owned campaign migration.
// Records are staged with NO authority to publish, even if the legacy copy said "published".
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SOURCE_SCHEMA='evercraft.clip.legacy-export.v1';
export const OWNED_SCHEMA='evercraft.clip.owned-campaign-snapshot.v1';
export const TABLES=['SocialPage','DistributionCampaign','ContentPackage','CampaignReleaseSlot','MediaDistributionEnvelope'];
export const BLOCKED_PROVIDER_IDS=new Set(['924929507380565','990957940766644','116675248108887']);
const SOURCE_KEYS={
  SocialPage:['platform','external_id','name','brand_role','status'],
  DistributionCampaign:['campaign_key','title','objective','source_app','source_package_key','rights_state','target_platforms','canonical_url','cta_label','cta_url','source_refs'],
  ContentPackage:['source_asset','content_type','hook','body','platform_copy_json','creative_style','link_url','media_url','target_page_id','target_page_name','campaign_key','target_platforms','publication_class'],
  CampaignReleaseSlot:['slot_key','campaign_key','content_package_id','target_page_id','not_before'],
  MediaDistributionEnvelope:['envelope_key','source_app','source_package_key','title','target_platform','rights_state','media_url','campaign_key','aspect_ratio','duration_seconds'],
};
function fail(message){throw new Error('owned_clip_'+message);}
function hash(value){return crypto.createHash('sha256').update(value).digest('hex');}
function str(value){return String(value??'').trim();}
function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
  return value;
}
function stable(value){return JSON.stringify(canonical(value));}
function sourceKey(table,record){return str(record.id||record.slot_key||record.envelope_key||record.campaign_key||record.external_id);}
function ownedKey(table,record){const key=sourceKey(table,record);if(!key)fail('source_record_key_missing:'+table);return 'clip_'+table.toLowerCase()+'_'+hash(table+':'+key).slice(0,24);}
function isBlockedPage(id){return BLOCKED_PROVIDER_IDS.has(str(id));}
function isLegacyMedia(value){if(!str(value))return false;try{const url=new URL(value);return url.hostname==='base44.com'||url.hostname.endsWith('.base44.com')||url.hostname.endsWith('.base44.app')}catch{return true}}
function filterFields(table,input){
  const out={};
  for(const name of SOURCE_KEYS[table]){
    if(input[name]!==undefined&&input[name]!==null){
      const v=input[name];
      // Reject non-JSON objects and never import unknown fields such as access tokens.
      if(typeof v==='function'||typeof v==='symbol')fail('unsupported_field:'+table+':'+name);
      out[name]=structuredClone(v);
    }
  }
  return out;
}
function validateSource(source){
  if(source?.schema!==SOURCE_SCHEMA)fail('source_schema_invalid');
  if(!source.records||typeof source.records!=='object')fail('records_missing');
  for(const table of TABLES)if(!Array.isArray(source.records[table]))fail('table_missing:'+table);
  for(const key of Object.keys(source.records))if(!TABLES.includes(key))fail('unexpected_table:'+key);
  for(const table of TABLES)if(source.records[table].length>100000)fail('table_too_large:'+table);
}
function safeRecord(table,legacy,ownedId,lookup){
  const row=filterFields(table,legacy);
  row.owned_id=ownedId;
  row.source_fingerprint=hash(table+':'+sourceKey(table,legacy));
  row.publish_authority='none';
  row.imported_legacy_status=str(legacy.status||'unknown');
  row.status=table==='ContentPackage'?'draft':'held';
  row.provider_receipt_verified=false;
  if(table==='ContentPackage'){
    if(!str(row.body))fail('post_body_missing');
    if(isBlockedPage(row.target_page_id))fail('blocked_page_in_content');
    if(typeof row.platform_copy_json==='string'){
      try{row.platform_copy_json=JSON.parse(row.platform_copy_json)}catch{fail('platform_copy_json_invalid')}
    }
  }
  if(table==='SocialPage'){
    if(!str(row.external_id)||!str(row.name))fail('social_page_identity_missing');
    if(isBlockedPage(row.external_id))fail('blocked_page_in_social_registry');
  }
  if(table==='CampaignReleaseSlot'){
    if(isBlockedPage(row.target_page_id))fail('blocked_page_in_slot');
    const target=lookup.get('ContentPackage:'+str(legacy.content_package_id));
    if(!target)fail('orphan_content_package:'+str(legacy.slot_key));
    row.content_package_id=target;
    if(!str(row.not_before))fail('release_time_missing');
    row.not_before_original=row.not_before;
    row.not_before=null; // Historical schedule is never rearmed by import.
  }
  if(table==='MediaDistributionEnvelope'||table==='ContentPackage'){
    const external=str(row.media_url);
    row.original_media_url=external||null; // migration evidence, not publishable asset.
    row.media_url=null;
    row.owned_media_ready=false;
    row.media_migration_state=external?(isLegacyMedia(external)?'legacy_media_needs_copy':'media_needs_owned_verification'):'media_missing';
  }
  if(table==='DistributionCampaign'||table==='MediaDistributionEnvelope')row.rights_state='pending';
  return row;
}
export function prepareOwnedClipSnapshot(source){
  validateSource(source);
  const lookup=new Map(), seen=new Set();
  for(const table of TABLES){
    for(const legacy of source.records[table]){
      if(!legacy||typeof legacy!=='object'||Array.isArray(legacy))fail('row_invalid:'+table);
      const key=sourceKey(table,legacy);
      if(!key)fail('source_record_key_missing:'+table);
      const ref=table+':'+key;
      if(seen.has(ref))fail('duplicate_source_record:'+table);
      seen.add(ref);lookup.set(ref,ownedKey(table,legacy));
    }
  }
  const records={};
  for(const table of TABLES)records[table]=source.records[table].map(item=>safeRecord(table,item,lookup.get(table+':'+sourceKey(table,item)),lookup))
    .sort((a,b)=>a.owned_id.localeCompare(b.owned_id));
  const snapshot={
    schema:OWNED_SCHEMA,mode:'migration_stage_only',source_platform:'base44_legacy_export',
    publish_authority_granted:false,secrets_imported:false,provider_credentials_migrated:false,
    media_bytes_migrated:false,cutover_proven:false,records,
    counts:Object.fromEntries(TABLES.map(t=>[t,records[t].length])),
    guardrails:{
      blocked_provider_ids:[...BLOCKED_PROVIDER_IDS].sort(),
      facebook_links_first_comment:true,provider_receipts_required:true,
      reauthorization_required:true,media_copy_and_hash_required:true,
      source_status_never_authority:true
    },
  };
  snapshot.content_sha256=hash(stable(snapshot));
  return snapshot;
}
export function inspectOwnedClipSnapshot(snapshot){
  if(snapshot?.schema!==OWNED_SCHEMA)fail('owned_schema_invalid');
  const {content_sha256,...withoutDigest}=snapshot;
  if(hash(stable(withoutDigest))!==content_sha256)fail('owned_digest_mismatch');
  if(snapshot.publish_authority_granted!==false||snapshot.cutover_proven!==false)fail('unsafe_authority');
  if(snapshot.media_bytes_migrated!==false||snapshot.provider_credentials_migrated!==false)fail('unsafe_migration_claim');
  for(const table of TABLES){
    if(!Array.isArray(snapshot.records?.[table]))fail('owned_table_missing:'+table);
    if(snapshot.counts?.[table]!==snapshot.records[table].length)fail('owned_count_mismatch:'+table);
    for(const r of snapshot.records[table]){
      if(r.publish_authority!=='none'||r.provider_receipt_verified!==false)fail('unverified_publication');
      if(r.status!==(table==='ContentPackage'?'draft':'held'))fail('status_not_held');
      if(isBlockedPage(r.target_page_id)||isBlockedPage(r.external_id))fail('excluded_page');
      if((table==='ContentPackage'||table==='MediaDistributionEnvelope')&&(r.media_url!==null||r.owned_media_ready!==false))fail('unsafe_media_promotion');
    }
  }
  return {status:'ACCEPTED_FOR_PRIVATE_STAGING',sha256:content_sha256,counts:snapshot.counts,authority_granted:false,cutover_proven:false};
}
export function stageOwnedClipSnapshot({snapshot,stateDir}){
  const inspected=inspectOwnedClipSnapshot(snapshot);
  if(!str(stateDir))fail('private_state_dir_missing');
  const resolved=path.resolve(stateDir);
  // No private campaign/body/account state may be committed inside a checked-out public repo.
  if(resolved.split(path.sep).includes('.git')||resolved.split(path.sep).includes('public'))fail('unsafe_state_dir');
  fs.mkdirSync(resolved,{recursive:true,mode:0o700});
  const file=path.join(resolved,'clip-campaign-migration.json');
  const lock=file+'.lock';
  let fd;
  try{fd=fs.openSync(lock,'wx',0o600)}catch{fail('concurrent_import_or_stale_lock')}
  try{
    if(fs.existsSync(file)){
      const existing=JSON.parse(fs.readFileSync(file,'utf8'));
      const read=inspectOwnedClipSnapshot(existing);
      if(read.sha256!==inspected.sha256)fail('immutable_snapshot_conflict');
      return {status:'ALREADY_STAGED',path:file,...read};
    }
    const tmp=path.join(resolved,'.clip-campaign-migration.'+process.pid+'.tmp');
    try{
      fs.writeFileSync(tmp,JSON.stringify(snapshot,null,2)+'\n',{mode:0o600,flag:'wx'});
      fs.renameSync(tmp,file);
    }finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}
    return {status:'STAGED_PRIVATE_NOT_PUBLISHED',path:file,...inspected};
  }finally{fs.closeSync(fd);fs.unlinkSync(lock)}
}
export function loadOwnedClipSnapshot(stateDir){
  const snapshot=JSON.parse(fs.readFileSync(path.join(path.resolve(stateDir),'clip-campaign-migration.json'),'utf8'));
  inspectOwnedClipSnapshot(snapshot);
  return snapshot;
}
