// Private, local-only Fallen timeline version history. No media bytes, spend,
// provider calls, customer contact, or release authority. Callers authenticate
// projects and obtain creative approvals before using this internal store.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {timelineDigest} from './timeline.js';

export const VAULT_SCHEMA='evercraft.fallen.timeline-version-vault.v1';
export const SNAPSHOT_SCHEMA='evercraft.fallen.timeline-snapshot.v1';
export const ROLLBACK_SCHEMA='evercraft.fallen.timeline-rollback-proposal.v1';
const HEX=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/;
const AUTH=/^private:[A-Za-z0-9_./:-]{6,140}$/;
function digest(value){
  const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?
    Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))
      .map(([k,x])=>[k,stable(x)])):v;
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
const copy=value=>JSON.parse(JSON.stringify(value));
function checkProject(project){
  if(!project||project.schema!=='evercraft.fallen.timeline.v1'||
    !ID.test(project.id||'')||!Number.isSafeInteger(project.version)||project.version<1||
    !Number.isFinite(project.fps)||project.fps<=0||project.fps>120||
    !['9:16','16:9','1:1'].includes(project.aspectRatio)||
    !Array.isArray(project.assets)||!Array.isArray(project.tracks))
    throw Error('fallen_vault_invalid_timeline');
  const assets=new Set();
  for(const a of project.assets){
    if(!a||typeof a.id!=='string'||!a.id||assets.has(a.id)||
      !HEX.test(a.digest||'')||!Array.isArray(a.sourceRefs)||!a.sourceRefs.length)
      throw Error('fallen_vault_invalid_source_asset');
    assets.add(a.id);
  }
  const clips=new Set(),tracks=new Set();
  for(const t of project.tracks){
    if(!t||typeof t.id!=='string'||!t.id||tracks.has(t.id)||!Array.isArray(t.clips))
      throw Error('fallen_vault_invalid_track');
    tracks.add(t.id);
    for(const c of t.clips){
      if(!c||typeof c.id!=='string'||!c.id||clips.has(c.id)||
        c.trackId!==t.id||!assets.has(c.assetId)||
        !Number.isFinite(c.startSec)||c.startSec<0||
        !Number.isFinite(c.durationSec)||c.durationSec<=0)
        throw Error('fallen_vault_invalid_clip');
      clips.add(c.id);
    }
  }
}
function directory(dir,{create=false}={}){
  if(create&&!fs.existsSync(dir))fs.mkdirSync(dir,{mode:0o700});
  const stat=fs.lstatSync(dir);
  if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('fallen_vault_unsafe_directory');
}
function fileJson(filename){
  const stat=fs.lstatSync(filename);
  if(stat.isSymbolicLink()||!stat.isFile()||stat.size>5_000_000)
    throw Error('fallen_vault_unsafe_file');
  return JSON.parse(fs.readFileSync(filename,'utf8'));
}
function locations(root,projectId,{create=false}={}){
  if(!ID.test(projectId||''))throw Error('fallen_vault_project_id_invalid');
  const base=path.resolve(root);
  directory(base);
  const key=crypto.createHash('sha256').update(projectId).digest('hex');
  const dir=path.join(base,key),shots=path.join(dir,'snapshots');
  if(create){directory(dir,{create:true});directory(shots,{create:true});}
  else {directory(dir);directory(shots);}
  return {dir,shots,manifest:path.join(dir,'manifest.json')};
}
function filename(version,checksum){
  return 'v'+String(version).padStart(6,'0')+'-'+checksum+'.json';
}
function verifyManifest(loc,projectId){
  if(!fs.existsSync(loc.manifest))return {schema:VAULT_SCHEMA,projectId,entries:[],head:null};
  const m=fileJson(loc.manifest);
  if(m?.schema!==VAULT_SCHEMA||m.projectId!==projectId||
    !Array.isArray(m.entries)||m.entries.length===0||
    m.entries.length>10000)throw Error('fallen_vault_manifest_invalid');
  let prev=null,previousVersion=0;
  for(const e of m.entries){
    if(!Number.isSafeInteger(e?.version)||e.version<=previousVersion||
      !HEX.test(e.projectDigest||'')||!HEX.test(e.snapshotDigest||'')||
      e.previousProjectDigest!==prev||
      e.file!==filename(e.version,e.snapshotDigest))
      throw Error('fallen_vault_manifest_chain_invalid');
    const s=fileJson(path.join(loc.shots,e.file));
    if(s?.schema!==SNAPSHOT_SCHEMA||s.projectId!==projectId||
      s.version!==e.version||s.previousProjectDigest!==prev||
      s.projectDigest!==e.projectDigest||digest(s)!==e.snapshotDigest)
      throw Error('fallen_vault_snapshot_integrity_failure');
    checkProject(s.project);
    if(s.project.id!==projectId||s.project.version!==e.version||
      timelineDigest(s.project)!==e.projectDigest)
      throw Error('fallen_vault_project_integrity_failure');
    prev=e.projectDigest;previousVersion=e.version;
  }
  if(!m.head||m.head.projectDigest!==prev||
    m.head.version!==previousVersion)throw Error('fallen_vault_head_invalid');
  return m;
}
function withWriteLock(loc,callback){
  const lock=path.join(loc.dir,'.write-lock');
  fs.mkdirSync(lock,{mode:0o700});
  try{return callback();}
  finally{fs.rmdirSync(lock);}
}
function atomicManifest(loc,m){
  const temp=path.join(loc.dir,'.manifest-'+crypto.randomBytes(8).toString('hex')+'.tmp');
  try{
    fs.writeFileSync(temp,JSON.stringify(m,null,2)+'\n',{flag:'wx',mode:0o600});
    fs.renameSync(temp,loc.manifest);
  }finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
export function saveTimelineVersion({root,project,expectedHeadDigest=null,operatorScopeReference}){
  checkProject(project);
  if(!AUTH.test(operatorScopeReference||''))throw Error('fallen_vault_scope_reference_required');
  const loc=locations(root,project.id,{create:true});
  return withWriteLock(loc,()=>{
    const m=verifyManifest(loc,project.id);
    const previous=m.head?.projectDigest??null;
    if(previous!==expectedHeadDigest)throw Error('fallen_vault_optimistic_conflict');
    if(m.head&&project.version<=m.head.version)
      throw Error('fallen_vault_version_not_advanced');
    if(!m.head&&project.version!==1)
      throw Error('fallen_vault_initial_version_required');
    const projectDigest=timelineDigest(project);
    if(previous===projectDigest)throw Error('fallen_vault_identical_version');
    const shot={schema:SNAPSHOT_SCHEMA,projectId:project.id,version:project.version,
      previousProjectDigest:previous,projectDigest,project:copy(project)};
    const snapshotDigest=digest(shot),file=filename(project.version,snapshotDigest);
    fs.writeFileSync(path.join(loc.shots,file),JSON.stringify(shot,null,2)+'\n',
      {flag:'wx',mode:0o600});
    const entry={version:project.version,projectDigest,snapshotDigest,
      previousProjectDigest:previous,file};
    atomicManifest(loc,{schema:VAULT_SCHEMA,projectId:project.id,
      entries:[...m.entries,entry],head:{version:project.version,projectDigest}});
    return {schema:VAULT_SCHEMA,projectId:project.id,version:project.version,
      projectDigest,snapshotDigest,previousProjectDigest:previous,
      status:'PRIVATE_SNAPSHOT_RECORDED',originalMediaCopied:false,
      customerApprovalImplied:false,publicationAuthority:false};
  });
}
export function readTimelineVersionHistory({root,projectId}){
  const loc=locations(root,projectId);
  const m=verifyManifest(loc,projectId);
  return {schema:VAULT_SCHEMA,projectId,head:m.head,
    entries:m.entries.map(({version,projectDigest,snapshotDigest})=>({
      version,projectDigest,snapshotDigest
    }))};
}
function loadSnapshot(loc,e){
  const shot=fileJson(path.join(loc.shots,e.file));
  if(digest(shot)!==e.snapshotDigest)throw Error('fallen_vault_snapshot_integrity_failure');
  return shot;
}
export function readTimelineVersion({root,projectId,projectDigest=null}){
  const loc=locations(root,projectId),m=verifyManifest(loc,projectId);
  const chosen=projectDigest?m.entries.find(e=>e.projectDigest===projectDigest):m.entries.at(-1);
  if(!chosen)throw Error('fallen_vault_version_not_found');
  return copy(loadSnapshot(loc,chosen).project);
}
function ensureLockedPreserved(current,restored){
  for(const track of current.tracks){
    const next=restored.tracks.find(t=>t.id===track.id);
    if(track.locked===true){
      if(!next||digest(track)!==digest(next))
        throw Error('fallen_vault_rollback_locked_track_change');
    }
    for(const clip of track.clips.filter(c=>c.locked===true||track.locked===true)){
      const counterpart=next?.clips.find(c=>c.id===clip.id);
      if(!counterpart||digest(clip)!==digest(counterpart))
        throw Error('fallen_vault_rollback_locked_clip_change');
      const oldAsset=current.assets.find(a=>a.id===clip.assetId);
      const newAsset=restored.assets.find(a=>a.id===clip.assetId);
      if(!oldAsset||!newAsset||oldAsset.digest!==newAsset.digest)
        throw Error('fallen_vault_rollback_locked_source_change');
    }
  }
}
/** Explicit rollback PROPOSAL only. The caller must approve, verify access,
 * and save the proposed timeline as a NEW version via saveTimelineVersion.
 */
export function proposeTimelineRollback({
  root,projectId,targetProjectDigest,expectedHeadDigest,operatorApprovalReference,
}){
  if(!HEX.test(targetProjectDigest||'')||!HEX.test(expectedHeadDigest||''))
    throw Error('fallen_vault_rollback_digest_invalid');
  if(!AUTH.test(operatorApprovalReference||''))
    throw Error('fallen_vault_rollback_approval_reference_required');
  const current=readTimelineVersion({root,projectId});
  if(timelineDigest(current)!==expectedHeadDigest)
    throw Error('fallen_vault_rollback_stale_head');
  if(targetProjectDigest===expectedHeadDigest)
    throw Error('fallen_vault_rollback_same_version');
  const old=readTimelineVersion({root,projectId,projectDigest:targetProjectDigest});
  ensureLockedPreserved(current,old);
  const candidate=copy(old);
  candidate.version=current.version+1;
  candidate.createdAt=current.createdAt;
  candidate.updatedAt=new Date().toISOString();
  checkProject(candidate);
  return {schema:ROLLBACK_SCHEMA,status:'ROLLBACK_PROPOSED_NOT_APPLIED',
    projectId,fromVersion:current.version,toVersion:candidate.version,
    targetProjectDigest,expectedHeadDigest,
    proposedProjectDigest:timelineDigest(candidate),candidate,
    boundaries:{privateProjectAuthorizationMustBeVerifiedByCaller:true,
      operatorApprovalReferenceNotCryptographicallyAuthenticated:true,
      originalHistoryRetained:true,originalMediaCopied:false,
      automaticRestore:false,publicationAuthority:false,paymentAuthority:false}};
}
