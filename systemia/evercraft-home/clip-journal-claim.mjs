import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Owned, file-backed idempotency claim. Once a submit has been attempted,
// absence of a receipt does not authorize a second provider POST.
export const CLIP_JOURNAL_CLAIM_SCHEMA='evercraft.clip.journal-publish-claim.v1';
const slugValid=s=>typeof s==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
const safe=v=>String(v??'').trim();
const within=(parent,child)=>child===parent||child.startsWith(parent+path.sep);

export function claimJournalPublish({repoRoot,stateRoot,slug,handoff}={}){
  if(!slugValid(slug)) throw new Error('clip_journal_claim_slug_invalid');
  if(!safe(stateRoot)) throw new Error('clip_journal_durable_state_root_required');
  if(!safe(repoRoot)) throw new Error('clip_journal_repo_root_required');
  const root=path.resolve(stateRoot),repo=path.resolve(repoRoot);
  if(within(repo,root)||within(root,repo)) throw new Error('clip_journal_state_must_be_outside_repository');
  if(fs.existsSync(root)&&fs.lstatSync(root).isSymbolicLink())throw new Error('clip_journal_state_root_symlink_blocked');
  fs.mkdirSync(root,{recursive:true,mode:0o700});
  const stat=fs.lstatSync(root);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('clip_journal_state_root_invalid');
  const file=path.join(root,slug+'.json');
  const digest=crypto.createHash('sha256').update(JSON.stringify(handoff)).digest('hex');
  const record={
    schema:CLIP_JOURNAL_CLAIM_SCHEMA,slug,handoff_sha256:digest,
    state:'unresolved_attempt',created_at:new Date().toISOString(),
    provider_may_have_published:true,automatic_retry_allowed:false,
    remote_id:null,provider_post_url:null
  };
  let fd;
  try{
    fd=fs.openSync(file,'wx',0o600);
    fs.writeFileSync(fd,JSON.stringify(record)+'\n');
    fs.fsyncSync(fd);
    fs.closeSync(fd);fd=undefined;
    return {state:'claimed',file,record};
  }catch(error){
    if(fd!==undefined){try{fs.closeSync(fd);}catch{}}
    if(error?.code!=='EEXIST')throw error;
    // Fail closed even if the old file is corrupt, empty or from a crash.
    let prior=null;
    try{prior=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
    return {
      state:'duplicate_hold',file,
      prior_state:safe(prior?.state)||'unreadable_claim',
      prior_remote_id:safe(prior?.remote_id)||null,
      prior_provider_post_url:safe(prior?.provider_post_url)||null
    };
  }
}
export function completeJournalPublishClaim({claim,receipt}={}){
  if(claim?.state!=='claimed'||!claim.file||claim.record?.schema!==CLIP_JOURNAL_CLAIM_SCHEMA){
    throw new Error('clip_journal_claim_missing_or_inactive');
  }
  const state=safe(receipt?.status)||'reconciliation_required';
  const confirmed=state==='published'||state==='published_postflight_failed';
  const final={
    ...claim.record,state,
    remote_id:safe(receipt?.remoteId)||null,
    provider_post_url:confirmed?safe(receipt?.url)||null:null,
    provider_may_have_published:true, // Provider was invoked; fail closed even on a reported failure.
    automatic_retry_allowed:false,
    resolved_at:new Date().toISOString()
  };
  const tmp=claim.file+'.'+process.pid+'.new';
  try{
    const fd=fs.openSync(tmp,'wx',0o600);
    try{fs.writeFileSync(fd,JSON.stringify(final)+'\n');fs.fsyncSync(fd);}
    finally{fs.closeSync(fd);}
    fs.renameSync(tmp,claim.file);
    return final;
  }catch(error){
    try{fs.unlinkSync(tmp);}catch{}
    // The earlier claim remains on disk and blocks a blind resubmission.
    throw error;
  }
}
