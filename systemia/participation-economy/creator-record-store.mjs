// Evercraft Home creator queue: owned, local, non-production metadata store.
// No public API, authenticated identities, uploads, publishing, or payment authority.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { evaluateCreatorStory } from './creator-intake.mjs';

export const CREATOR_RECORD_SCHEMA='evercraft.home.creator-record.v0.1';
const RE=/^[A-Za-z0-9:_./-]{1,160}$/;
const STORY_FIELDS=new Set(['id','creator_ref','asset_ref','title','format','destinations','source_refs','heritage','creator_publish_opt_in','creator_revenue_opt_in','rights_asserted','original_work_asserted','identifies_living_people','contains_private_family_content']);
const REVIEW_FIELDS=new Set(['decision','reviewer_ref','evidence_ref','moderation_clear','rights_clear','heritage_clear','factual_clear','media_clear','living_people_privacy_clear']);
const FLAGS=['moderation_clear','rights_clear','heritage_clear','factual_clear','media_clear','living_people_privacy_clear'];
const sha=s=>createHash('sha256').update(s).digest('hex');
const plain=x=>x && typeof x==='object' && !Array.isArray(x) && (Object.getPrototypeOf(x)===Object.prototype || Object.getPrototypeOf(x)===null);
const clone=x=>JSON.parse(JSON.stringify(x));
function requireRef(s,name){if(typeof s!=='string'||!RE.test(s))throw Error(name+'_invalid');}
function shape(x,allowed,name){if(!plain(x)||Object.keys(x).some(k=>!allowed.has(k)))throw Error(name+'_shape_invalid');}
function validateStory(s){
  shape(s,STORY_FIELDS,'story');
  for(const k of ['creator_publish_opt_in','creator_revenue_opt_in','rights_asserted','original_work_asserted','identifies_living_people','contains_private_family_content'])
    if(Object.hasOwn(s,k)&&typeof s[k]!=='boolean')throw Error('story_boolean_invalid');
  evaluateCreatorStory({story:s});
  if(Buffer.byteLength(JSON.stringify(s))>16384)throw Error('story_too_large');
  return clone(s);
}
function validateReview(r){
  shape(r,REVIEW_FIELDS,'review');
  for(const k of FLAGS)if(Object.hasOwn(r,k)&&typeof r[k]!=='boolean')throw Error('review_boolean_invalid');
  if(!['approved','rejected','pending'].includes(r.decision))throw Error('review_decision_invalid');
  requireRef(r.reviewer_ref,'reviewer_ref');requireRef(r.evidence_ref,'evidence_ref');
  return clone(r);
}
const genesis=(t,s)=>sha('HOME_CREATOR_GENESIS_V1\n'+t+'\n'+s);
const digest=e=>sha('HOME_CREATOR_EVENT_V1\n'+JSON.stringify(e));

async function readHistory(folder,tenant,storyId){
  let names;
  try{names=(await fs.readdir(folder)).filter(n=>/^\d{6}\.json$/.test(n)).sort();}
  catch(e){if(e.code==='ENOENT')return null;throw e;}
  if(!names.length)return null;
  if(names.length>256)throw Error('record_event_limit');
  let head=genesis(tenant,storyId), story=null, review=null, withdrawn=false;
  const history=[];
  for(let i=0;i<names.length;i++){
    if(names[i]!==String(i+1).padStart(6,'0')+'.json')throw Error('record_sequence_invalid');
    const filename=path.join(folder,names[i]),stat=await fs.lstat(filename);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32768)throw Error('record_file_invalid');
    const e=JSON.parse(await fs.readFile(filename,'utf8'));
    if(!e||e.schema!==CREATOR_RECORD_SCHEMA||e.tenant_ref!==tenant||e.story_id!==storyId||
      e.seq!==i+1||e.prev_hash!==head||!['submitted','reviewed','withdrawn'].includes(e.type))throw Error('record_chain_invalid');
    const {hash,...unsigned}=e;
    if(digest(unsigned)!==hash)throw Error('record_hash_invalid');
    if(e.type==='submitted'){
      if(story||i!==0)throw Error('record_duplicate_submission');
      story=validateStory(e.data);
      if(story.id!==storyId)throw Error('record_story_mismatch');
    }else if(e.type==='reviewed'){
      if(!story||withdrawn)throw Error('record_review_after_withdrawal');
      review=validateReview(e.data);
      if(review.reviewer_ref===story.creator_ref)throw Error('record_self_review');
    }else{
      if(!story||withdrawn||!plain(e.data)||Object.keys(e.data).join('|')!=='actor_ref'||
         e.data.actor_ref!==story.creator_ref)throw Error('record_withdraw_invalid');
      withdrawn=true;
    }
    head=hash;history.push({seq:i+1,type:e.type,hash});
  }
  return{story,review,withdrawn,head_hash:head,revision:names.length,history};
}
function view(state){
  if(!state)return null;
  const p=evaluateCreatorStory({story:state.story,review:state.review});
  if(state.withdrawn){
    p.routes=p.routes.map(x=>({...x,state:'held',hold_reasons:[...x.hold_reasons,'creator_withdrawn'],published:false}));
    p.monetization_state='revoked';
  }
  return {...p,state:state.withdrawn?'withdrawn':state.review?.decision??'pending',
    review:state.review?clone(state.review):null,head_hash:state.head_hash,revision:state.revision,
    history:state.history,durable_store:'owned_local_filesystem_development_only',
    authenticated_identity:false,independent_review_attestation:false,
    published:false,payouts_enabled:false,payable_cents:null};
}
async function exclusiveWrite(dest,text){
  const temp=path.join(path.dirname(dest),'.temp-'+randomUUID());
  let fd;
  try{
    fd=await fs.open(temp,'wx',0o600);
    await fd.writeFile(text,'utf8');await fd.sync();await fd.close();fd=null;
    await fs.link(temp,dest); // Exclusive atomic commit on a single local filesystem.
    const dir=await fs.open(path.dirname(dest),'r');
    try{await dir.sync();}finally{await dir.close();}
  }finally{
    if(fd)await fd.close();
    await fs.unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});
  }
}
export function openCreatorRecordStore({root}={}){
  if(typeof root!=='string'||!root.trim()||!path.isAbsolute(root))throw Error('absolute_store_root_required');
  function location(t,id){
    requireRef(t,'tenant_ref');requireRef(id,'story_id');
    return path.join(root,sha('tenant:'+t),sha('story:'+id));
  }
  async function append(folder,t,id,previous,type,data){
    const seq=(previous?.revision??0)+1;
    if(seq>256)throw Error('record_event_limit');
    await fs.mkdir(folder,{recursive:true,mode:0o700});
    const unsigned={schema:CREATOR_RECORD_SCHEMA,tenant_ref:t,story_id:id,seq,
      prev_hash:previous?.head_hash??genesis(t,id),type,recorded_at:new Date().toISOString(),data};
    const record={...unsigned,hash:digest(unsigned)};
    try{await exclusiveWrite(path.join(folder,String(seq).padStart(6,'0')+'.json'),JSON.stringify(record)+'\n');}
    catch(e){if(e.code==='EEXIST')throw Error('record_stale_head');throw e;}
    return view(await readHistory(folder,t,id));
  }
  async function get({tenant_ref,story_id}){
    return view(await readHistory(location(tenant_ref,story_id),tenant_ref,story_id));
  }
  async function submit({tenant_ref,story}){
    requireRef(tenant_ref,'tenant_ref');
    const s=validateStory(story),folder=location(tenant_ref,s.id);
    const existing=await readHistory(folder,tenant_ref,s.id);
    if(existing){
      if(JSON.stringify(existing.story)!==JSON.stringify(s))throw Error('record_submission_conflict');
      return view(existing);
    }
    return append(folder,tenant_ref,s.id,null,'submitted',s);
  }
  async function review({tenant_ref,story_id,expected_head_hash,review:input}){
    const folder=location(tenant_ref,story_id),prior=await readHistory(folder,tenant_ref,story_id);
    if(!prior)throw Error('record_not_found');
    if(prior.withdrawn)throw Error('record_withdrawn');
    if(prior.head_hash!==expected_head_hash||typeof expected_head_hash!=='string')throw Error('record_stale_head');
    const r=validateReview(input);
    if(r.reviewer_ref===prior.story.creator_ref)throw Error('record_self_review');
    return append(folder,tenant_ref,story_id,prior,'reviewed',r);
  }
  async function withdraw({tenant_ref,story_id,expected_head_hash,actor_ref}){
    const folder=location(tenant_ref,story_id),prior=await readHistory(folder,tenant_ref,story_id);
    if(!prior)throw Error('record_not_found');
    if(actor_ref!==prior.story.creator_ref)throw Error('record_creator_mismatch');
    if(prior.withdrawn)return view(prior);
    if(prior.head_hash!==expected_head_hash||typeof expected_head_hash!=='string')throw Error('record_stale_head');
    return append(folder,tenant_ref,story_id,prior,'withdrawn',{actor_ref});
  }
  async function list({tenant_ref}){
    requireRef(tenant_ref,'tenant_ref');
    const folder=path.join(root,sha('tenant:'+tenant_ref));
    let entries;
    try{entries=await fs.readdir(folder,{withFileTypes:true});}
    catch(e){if(e.code==='ENOENT')return [];throw e;}
    if(entries.length>10000)throw Error('tenant_record_limit');
    const out=[];
    for(const d of entries){
      if(!d.isDirectory()||!/^[a-f0-9]{64}$/.test(d.name))throw Error('tenant_directory_invalid');
      const home=path.join(folder,d.name);
      const names=(await fs.readdir(home)).filter(n=>/^\d{6}\.json$/.test(n)).sort();
      if(!names.length)continue;
      const first=JSON.parse(await fs.readFile(path.join(home,names[0]),'utf8'));
      if(sha('story:'+first.story_id)!==d.name)throw Error('tenant_story_folder_mismatch');
      const p=view(await readHistory(home,tenant_ref,first.story_id));
      out.push({story_id:p.story_id,title:p.title,revision:p.revision,state:p.state,head_hash:p.head_hash,published:false});
    }
    return out.sort((a,b)=>a.story_id.localeCompare(b.story_id));
  }
  return{submit,review,withdraw,get,list};
}
