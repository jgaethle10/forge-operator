/**
 * Mossmere isolated filesystem journal. Does not touch the live heartbeat,
 * publish a spectator feed, or call models without injected explicit authority.
 */
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {hash,residentObservation,spectatorDecisions} from './window-agent-boundary.mjs';
import {runResidentModelDecision} from './window-model-bridge.mjs';

export const SANDBOX_SCHEMA='evercraft.window.local-agent-journal.v1';
const FILE='mossmere-agent-sandbox.json',LOCK='.mossmere-agent-sandbox.lock';
const MAX_RECORDS=1024,MAX_BYTES=25*1024*1024;
function assertDirectory(dir){
  if(typeof dir!=='string'||!path.isAbsolute(dir))throw Error('Absolute sandbox directory required');
}
function validateWorld(w){
  if(!w||w.version!==1||!Array.isArray(w.actors)||w.actors.length!==12)
    throw Error('Invalid sandbox world');
  residentObservation(w,w.actors[0]?.id);
}
function verifyJournal(s){
  if(!s||s.schema!==SANDBOX_SCHEMA||s.release_status!=='held_local_only'||
    !Number.isSafeInteger(s.sequence)||s.sequence<0||
    !Array.isArray(s.records)||s.records.length>MAX_RECORDS)
    throw Error('Invalid or unauthorized sandbox journal');
  validateWorld(s.world);
  if(s.world_hash!==hash(s.world)||s.sequence!==s.records.length)
    throw Error('Sandbox world or sequence integrity mismatch');
  let last='genesis';
  for(let i=0;i<s.records.length;i++){
    const r=s.records[i];
    if(!r||r.sequence!==i+1||r.previous_hash!==last||
      r.record_hash!==hash({...r,record_hash:undefined})||
      r.release_status!=='held_local_only'||
      !['agent_decision','environment_tick'].includes(r.kind)||
      (r.kind==='agent_decision'&&(
        r.provider_evidence_state!=='adapter_reported_not_independently_verified'||
        typeof r.provider_request_id!=='string'||typeof r.receipt_id!=='string'))||
      (r.kind==='environment_tick'&&(
        r.provider_evidence_state!=='passive_environment_no_model'||
        r.provider_request_id!==null||r.agent_id!==null)))
      throw Error('Sandbox record chain integrity mismatch');
    if(i===0&&r.before_world_hash!==s.genesis_world_hash)
      throw Error('Invalid genesis link');
    if(i>0&&r.before_world_hash!==s.records[i-1].after_world_hash)
      throw Error('Broken journal world-state link');
    last=r.record_hash;
  }
  if((s.records.at(-1)?.after_world_hash||s.genesis_world_hash)!==s.world_hash ||
    last!==s.last_record_hash||
    new Set(s.records.filter(x=>x.kind==='agent_decision').map(x=>x.provider_request_id)).size!==s.records.filter(x=>x.kind==='agent_decision').length)
    throw Error('Journal head, world or provider replay mismatch');
  return s;
}
async function syncDir(dir){
  const f=await fs.open(dir,'r');
  try{await f.sync();}finally{await f.close();}
}
async function storeAtomic(dir,data){
  const file=path.join(dir,FILE);
  const temp=path.join(dir,'.mossmere-agent-'+process.pid+'-'+Date.now()+'-'+Math.random().toString(16).slice(2)+'.tmp');
  let h;
  try{
    h=await fs.open(temp,'wx',0o600);
    await h.writeFile(JSON.stringify(data)+'\n','utf8');
    await h.sync();await h.close();h=null;
    await fs.rename(temp,file);
    await syncDir(dir);
  }finally{
    if(h)await h.close();
    await fs.rm(temp,{force:true}).catch(()=>{});
  }
}
async function withLock(dir,fn){
  const lock=path.join(dir,LOCK);
  // Atomic mkdir elects one local writer. Never auto-steal a stale lock.
  await fs.mkdir(lock,{mode:0o700});
  try{return await fn();}finally{await fs.rmdir(lock);}
}
export async function initializeLocalSociety({dir,world,now=Date.now()}){
  assertDirectory(dir);
  validateWorld(world);
  if(!Number.isSafeInteger(now)||now<0)throw Error('Invalid initialization clock');
  await fs.mkdir(dir,{recursive:true,mode:0o700});
  return withLock(dir,async()=>{
    const file=path.join(dir,FILE);
    try{await fs.lstat(file);throw Error('Sandbox exists; refusing reset');}
    catch(e){if(e.code!=='ENOENT')throw e;}
    const world_hash=hash(world);
    const state={schema:SANDBOX_SCHEMA,release_status:'held_local_only',
      sequence:0,created_at:new Date(now).toISOString(),
      world:structuredClone(world),world_hash,genesis_world_hash:world_hash,
      records:[],last_record_hash:'genesis'};
    const handle=await fs.open(file,'wx',0o600);
    try{await handle.writeFile(JSON.stringify(state)+'\n');await handle.sync();}
    finally{await handle.close();}
    await syncDir(dir);
    return {sequence:0,world_hash,release_status:state.release_status};
  });
}
export async function readLocalSociety({dir}){
  assertDirectory(dir);
  const file=path.join(dir,FILE);
  const stat=await fs.lstat(file);
  if(!stat.isFile()||stat.size>MAX_BYTES)throw Error('Invalid sandbox journal file');
  return verifyJournal(JSON.parse(await fs.readFile(file,'utf8')));
}
/** One model call while holding the sandbox's exclusive single-writer lock. */
export async function runLocalSocietyTurn({
  dir,agentId,provider,model,providerClient,budgetGate,
  adapterSigningKey,trustedAdapterPublicKey,now=Date.now()
}){
  assertDirectory(dir);
  return withLock(dir,async()=>{
    const previous=await readLocalSociety({dir});
    if(previous.records.length>=MAX_RECORDS)
      throw Error('Journal full; archive with approval before continuing');
    if(previous.records.some(r=>r.agent_id===agentId&&r.world_tick===previous.world.tick))
      throw Error('Agent already acted at this world tick');
    const choice=await runResidentModelDecision({
      world:previous.world,agentId,provider,model,providerClient,budgetGate,
      adapterSigningKey,trustedAdapterPublicKey,now
    });
    if(choice.release_status!=='held_not_live'||
      choice.authority!=='sandbox_decision_only_no_canonical_write'||
      choice.receipt.provenance!=='adapter_attested_unverified_model'||
      choice.receipt.provider_evidence_state!=='adapter_reported_not_independently_verified'||
      choice.receipt.before_world_hash!==previous.world_hash)
      throw Error('Only held, attributed experimental decisions may be committed');
    const nextWorldHash=hash(choice.world);
    if(previous.records.some(r=>r.provider_request_id===choice.receipt.provider_request_id))
      throw Error('Provider request replay across journal');
    const entry={sequence:previous.sequence+1,kind:'agent_decision',release_status:'held_local_only',
      world_tick:previous.world.tick,agent_id:agentId,
      receipt_id:choice.receipt.id,receipt_hash:hash(choice.receipt),
      provider_request_id:choice.receipt.provider_request_id,
      provider_evidence_state:choice.receipt.provider_evidence_state,
      before_world_hash:previous.world_hash,after_world_hash:nextWorldHash,
      previous_hash:previous.last_record_hash};
    entry.record_hash=hash({...entry,record_hash:undefined});
    const next={...previous,sequence:entry.sequence,world:choice.world,
      world_hash:nextWorldHash,records:[...previous.records,entry],
      last_record_hash:entry.record_hash};
    verifyJournal(next);
    await storeAtomic(dir,next);
    return {sequence:next.sequence,record_hash:entry.record_hash,
      world_hash:next.world_hash,release_status:'held_local_only'};
  });
}

/**
 * Advance only passive environment time, never scripted NPC actions.
 * The ordinary Mossmere advanceWorld() is intentionally NOT invoked here.
 * This is a manual/approved local operation, not an autonomous scheduler.
 */
export async function advanceLocalSocietyClock({dir,now=Date.now()}){
  assertDirectory(dir);
  if(!Number.isSafeInteger(now))throw Error('Invalid clock');
  return withLock(dir,async()=>{
    const previous=await readLocalSociety({dir});
    if(previous.records.length>=MAX_RECORDS)
      throw Error('Journal full; archive with approval before continuing');
    if(now<previous.world.last_tick_at+30000)
      throw Error('Clock step too early or backwards');
    const w=structuredClone(previous.world);
    w.tick+=1;w.minute+=15;
    if(w.minute>=1440){w.minute-=1440;w.day+=1;}
    // Passive physical needs only. No work, conversation, invitation or agent goals
    // may be selected by the environment clock.
    for(const a of w.actors){
      a.hunger=Math.max(0,a.hunger-1);
      a.social=Math.max(0,a.social-1);
    }
    w.updated_at=now;w.last_tick_at=now;
    const after_world_hash=hash(w);
    const entry={
      sequence:previous.sequence+1,kind:'environment_tick',
      release_status:'held_local_only',world_tick:w.tick,agent_id:null,
      receipt_id:'passive-tick-'+w.tick,provider_request_id:null,
      provider_evidence_state:'passive_environment_no_model',
      before_world_hash:previous.world_hash,after_world_hash,
      previous_hash:previous.last_record_hash
    };
    entry.record_hash=hash({...entry,record_hash:undefined});
    const next={...previous,world:w,sequence:entry.sequence,
      world_hash:after_world_hash,records:[...previous.records,entry],
      last_record_hash:entry.record_hash};
    verifyJournal(next);
    await storeAtomic(dir,next);
    return {sequence:next.sequence,world_tick:w.tick,record_hash:entry.record_hash,
      release_status:'held_local_only',source:'passive_environment_no_model'};
  });
}

/** Public-safe preview only; no hidden memories, provider IDs or prompts. */
export async function readLocalObserver({dir}){
  const s=await readLocalSociety({dir});
  return {schema:'evercraft.window.local-observer.v1',release_status:s.release_status,
    sequence:s.sequence,world_tick:s.world.tick,
    world_hash:s.world_hash,last_record_hash:s.last_record_hash,
    town:s.world.town,day:s.world.day,minute:s.world.minute,
    agents:s.world.actors.map(a=>({id:a.id,name:a.name,job:a.job,zone:a.zone,
      action:a.action,household:a.household})),
    decisions:spectatorDecisions(s.world)};
}
