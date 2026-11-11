// House 001 owner-operated resident clock.
// Rules-based actors progress independently of any browser, with bounded catch-up and
// atomic private-file snapshots. No LLM, external APIs, user actions or public listener.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {makeHouse,advanceHouse,validateHouse} from '../../public/living-worlds/house-core.mjs';

export const RESIDENT_CLOCK_SCHEMA='evercraft.living-worlds.resident-clock.v1';
export const RESIDENT_SNAPSHOT_SCHEMA='evercraft.living-worlds.resident-snapshot.v1';
export const RESIDENT_TICK_MS=1200;
const DEFAULT_CATCHUP=120;
const MAX_SNAPSHOT_BYTES=48*1024;
const fileName='house-001-resident-clock.json';
const hash=world=>createHash('sha256').update(JSON.stringify(world)).digest('hex');
const validTime=n=>Number.isSafeInteger(n)&&n>=0;
function checkRecord(record){
  if(!record||record.schema!==RESIDENT_CLOCK_SCHEMA||
    !validTime(record.last_step_at)||!validTime(record.sequence)||
    !validateHouse(record.world)||record.world_hash!==hash(record.world)||
    record.sequence>record.world.tick)throw Error('house_resident_state_integrity_failed');
}
function checkMax(max){
  if(!Number.isSafeInteger(max)||max<1||max>1200)throw Error('house_resident_invalid_catchup');
  return max;
}
export async function createHouseResidentClock({dataRoot,now=()=>Date.now(),
  maxCatchup=DEFAULT_CATCHUP,autoTimer=true,intervalMs=1200}={}){
  if(typeof dataRoot!=='string'||!path.isAbsolute(dataRoot)||dataRoot.length<2)
    throw Error('house_resident_private_data_root_required');
  if(typeof now!=='function'||!Number.isSafeInteger(intervalMs)||intervalMs<200||intervalMs>60000)
    throw Error('house_resident_invalid_clock');
  checkMax(maxCatchup);
  await fs.mkdir(dataRoot,{recursive:true,mode:0o700});
  const inputStat=await fs.lstat(dataRoot);
  if(inputStat.isSymbolicLink()||!inputStat.isDirectory())throw Error('house_resident_private_root_invalid');
  const root=await fs.realpath(dataRoot);
  const file=path.join(root,fileName);
  let record=null,closed=false,fault=null,timer=null,queue=Promise.resolve();

  async function write(next){
    checkRecord(next);
    const tmp=file+'.'+randomBytes(8).toString('hex')+'.tmp';
    try{
      const handle=await fs.open(tmp,'wx',0o600);
      try{
        await handle.writeFile(JSON.stringify(next)+'\n','utf8');
        await handle.sync();
      }finally{await handle.close();}
      await fs.rename(tmp,file);
    }finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
  }
  try{
    const stat=await fs.lstat(file);
    if(stat.isSymbolicLink()||!stat.isFile()||stat.size>MAX_SNAPSHOT_BYTES)
      throw Error('house_resident_state_integrity_failed');
    const raw=await fs.readFile(file,'utf8');
    record=JSON.parse(raw);
    checkRecord(record);
  }catch(error){
    if(error.code!=='ENOENT')throw Error('house_resident_state_integrity_failed');
    const started=now();
    if(!validTime(started))throw Error('house_resident_invalid_clock');
    const world=makeHouse();
    record={schema:RESIDENT_CLOCK_SCHEMA,sequence:0,last_step_at:started,
      world,world_hash:hash(world)};
    await write(record);
  }
  // Serialized calls guarantee that HTTP observations and timer updates cannot race.
  function serialize(fn){
    const op=queue.then(fn);
    queue=op.catch(()=>{});
    return op;
  }
  async function pulse(at=now()){
    return serialize(async()=>{
      if(closed||fault)throw Error('house_resident_clock_unavailable');
      if(!validTime(at)||at<record.last_step_at)throw Error('house_resident_clock_regressed');
      const due=Math.floor((at-record.last_step_at)/RESIDENT_TICK_MS);
      const steps=Math.min(due,maxCatchup);
      if(steps===0)return {steps:0,tick:record.world.tick,pending:due};
      const world=structuredClone(record.world);
      for(let i=0;i<steps;i++)advanceHouse(world);
      const next={schema:RESIDENT_CLOCK_SCHEMA,sequence:record.sequence+1,
        last_step_at:record.last_step_at+steps*RESIDENT_TICK_MS,
        world,world_hash:hash(world)};
      await write(next);
      record=next;
      return {steps,tick:world.tick,pending:Math.max(0,due-steps)};
    });
  }
  async function observe(at=now()){
    return serialize(()=>{
      if(closed||fault)throw Error('house_resident_clock_unavailable');
      if(!validTime(at)||at<record.last_step_at)throw Error('house_resident_clock_regressed');
      const pending=Math.max(0,Math.floor((at-record.last_step_at)/RESIDENT_TICK_MS));
      return {
        schema:RESIDENT_SNAPSHOT_SCHEMA,world:structuredClone(record.world),
        world_hash:record.world_hash,source_tick:record.world.tick,
        sequence:record.sequence,last_step_at:record.last_step_at,
        pending_ticks:pending,max_catchup_ticks:maxCatchup,
        authority:'owner_operated_process',model_mode:'rules_only_no_llm',
        writes:'server_owned_only',public_deployed:false
      };
    });
  }
  async function close(){
    if(timer){clearInterval(timer);timer=null;}
    await queue;
    closed=true;
  }
  if(autoTimer){
    timer=setInterval(()=>{
      void pulse().catch(err=>{
        fault=err;clearInterval(timer);timer=null;
        // Explicit fault: never silently reset or overwrite a corrupt world.
      });
    },intervalMs);
    timer.unref?.();
  }
  return {pulse,observe,close,status:()=>({healthy:!closed&&!fault,reason:fault?.message||null})};
}
