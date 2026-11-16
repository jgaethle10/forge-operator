// House 001 spectator controller: opt-in and browser-local.
// Loaded dynamically from Evercraft Worlds so the standard Mossmere route never depends on House assets.
import {makeHouse,validateHouse,advanceHouse,clock,KINDS,placeFurniture,removeFurniture} from '../living-worlds/house-core.mjs';
import {toHouseVisualFrame} from './house-visual.mjs';

export const HOUSE_001_STORAGE='evercraft.living-worlds.house001.v1';
const INTERVAL_MS=1200;
function read(storage){
  try{
    const loaded=JSON.parse(storage.getItem(HOUSE_001_STORAGE));
    return validateHouse(loaded)?loaded:makeHouse();
  }catch{return makeHouse();}
}
export function createHouseSpectator(storage,startedAt=0){
  let world=read(storage),projection=toHouseVisualFrame(world);
  let lastTick=startedAt;
  let previous=new Map(projection.actors.map(a=>[a.id,{x:a.x,z:a.z}]));
  function step(now){
    if(!Number.isFinite(now)||now<lastTick)return false;
    if(now-lastTick<INTERVAL_MS)return false;
    previous=new Map(projection.actors.map(a=>[a.id,{x:a.x,z:a.z}]));
    advanceHouse(world);
    projection=toHouseVisualFrame(world);
    lastTick=now;
    try{storage.setItem(HOUSE_001_STORAGE,JSON.stringify(world));}catch{/* Optional local save. */}
    return true;
  }
  function frame(now){
    const alpha=Math.max(0,Math.min(1,(now-lastTick)/INTERVAL_MS));
    return {
      ...projection,
      day:world.day,time:clock(world),
      actors:projection.actors.map((a,index)=>{
        const from=previous.get(a.id)||a;
        return {...a,renderX:from.x+(a.x-from.x)*alpha,
          renderZ:from.z+(a.z-from.z)*alpha,
          renderBob:.018*Math.sin(now/230+index)};
      })
    };
  }
  function near(x,z){
    if(!Number.isFinite(x)||!Number.isFinite(z))return null;
    const actors=projection.actors.map(a=>({...a,d:Math.hypot(x-a.x,z-a.z)}))
      .sort((a,b)=>a.d-b.d||a.id.localeCompare(b.id));
    return actors[0]?.d<2.7?actors[0]:null;
  }
  function edit(kind,x,y){
    const changed=kind==='remove'?removeFurniture(world,x,y):placeFurniture(world,kind,x,y);
    if(!changed)return false;
    projection=toHouseVisualFrame(world);
    previous=new Map(projection.actors.map(a=>[a.id,{x:a.x,z:a.z}]));
    try{storage.setItem(HOUSE_001_STORAGE,JSON.stringify(world));}catch{/* Optional local save. */}
    return true;
  }
  return {step,frame,near,edit,kinds:()=>KINDS,source:()=>structuredClone(world)};
}

export function createResidentHouseSpectator(){
  // Read-only client for a server process that owns the timer and checkpoint.
  // Never calls advanceHouse(), mutates the owner's world or writes browser storage.
  let world=null,projection=null,lastTick=-1,lastReceivedAt=0,previous=new Map();
  function accept(receipt,now=0){
    if(!Number.isFinite(now)||now<0||!receipt||
      receipt.schema!=='evercraft.living-worlds.resident-snapshot.v1'||
      receipt.authority!=='owner_operated_process'||
      receipt.model_mode!=='rules_only_no_llm'||
      receipt.writes!=='server_owned_only'||
      !Number.isSafeInteger(receipt.source_tick)||receipt.source_tick<0||
      !Number.isSafeInteger(receipt.sequence)||receipt.sequence<0||
      !Number.isSafeInteger(receipt.pending_ticks)||receipt.pending_ticks<0||
      !validateHouse(receipt.world)||receipt.source_tick!==receipt.world.tick)
      throw Error('house_resident_snapshot_rejected');
    if(receipt.source_tick<lastTick)throw Error('house_resident_snapshot_regression');
    if(receipt.source_tick===lastTick)return false;
    const next=structuredClone(receipt.world);
    const nextProjection=toHouseVisualFrame(next);
    previous=new Map((projection?.actors||nextProjection.actors).map(a=>[a.id,{x:a.x,z:a.z}]));
    world=next;
    projection=nextProjection;
    lastTick=receipt.source_tick;
    lastReceivedAt=now;
    return true;
  }
  function frame(now=0){
    if(!projection||!world)return null;
    const alpha=Math.max(0,Math.min(1,(now-lastReceivedAt)/1200));
    return {...projection,day:world.day,time:clock(world),
      authority:'owner_operated_process_projection',
      actors:projection.actors.map((a,index)=>{
        const from=previous.get(a.id)||a;
        return {...a,renderX:from.x+(a.x-from.x)*alpha,
          renderZ:from.z+(a.z-from.z)*alpha,renderBob:.018*Math.sin(now/230+index)};
      })};
  }
  function near(x,z){
    if(!projection||!Number.isFinite(x)||!Number.isFinite(z))return null;
    const actors=projection.actors.map(a=>({...a,d:Math.hypot(x-a.x,z-a.z)}))
      .sort((a,b)=>a.d-b.d||a.id.localeCompare(b.id));
    return actors[0]?.d<2.7?actors[0]:null;
  }
  return {accept,frame,near,step:()=>false,edit:()=>false,kinds:()=>KINDS,
    source:()=>world?structuredClone(world):null};
}
