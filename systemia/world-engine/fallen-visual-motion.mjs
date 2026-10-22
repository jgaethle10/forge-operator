/**
 * Deterministic, authored animation for FALLEN RC13 native World Engine scenes.
 * Does not infer motion from observational data; never grants operational authority.
 */
import crypto from 'node:crypto';
import {verifyFallenVisualHandoff} from './fallen-visual-case.mjs';
import {verifyFallenVisualSceneReceipt} from './fallen-visual-scene.mjs';

function fail(reason){throw new Error('fallen_visual_motion_'+reason);}
function stable(v){
  if(Array.isArray(v))return v.map(stable);
  if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,value])=>[k,stable(value)]));
  return v;
}
function hash(value){return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');}
function vec(p,z=.05){
  if(!p||!Number.isFinite(p.u)||!Number.isFinite(p.v)||p.u<0||p.u>1||p.v<0||p.v>1)fail('point_invalid');
  return{x:2*p.u-1,y:1-2*p.v,z};
}
/** Travel at constant *schematic* speed along authored line segments. */
export function authoredRoutePoint(route,progress){
  if(!Array.isArray(route)||route.length<2||!Number.isFinite(progress)||progress<0||progress>1)fail('route_invalid');
  const coords=route.map(p=>vec(p));
  const spans=coords.slice(1).map((b,i)=>Math.hypot(b.x-coords[i].x,b.y-coords[i].y));
  if(spans.some(x=>!Number.isFinite(x)||x<=1e-9))fail('segment_degenerate');
  const total=spans.reduce((a,b)=>a+b,0);
  let distance=total*progress;
  for(let i=0;i<spans.length;i++){
    if(distance<=spans[i]||i===spans.length-1){
      const p=coords[i],q=coords[i+1],t=Math.min(1,distance/spans[i]);
      return{x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t,z:.05};
    }
    distance-=spans[i];
  }
  fail('unreachable');
}
/** Emit actual Engine teleport inputs, bounded to 240 authored frames. */
export function buildFallenVisualMotionLedger(handoff,projection,options={}){
  if(!verifyFallenVisualHandoff(handoff))fail('handoff_unverified');
  if(!projection||!verifyFallenVisualSceneReceipt(projection.receipt,projection.world,projection.geometryAssets)||projection.receipt.sourceHandoffDigest!==handoff.digest)fail('projection_unverified');
  const ticks=options.ticks??90;
  if(!Number.isInteger(ticks)||ticks<1||ticks>240)fail('ticks_invalid');
  if(projection.world.tickRateHz!==60)fail('tick_rate_unsupported');
  const events=[];
  const ids=new Set(projection.world.entities.map(e=>e.id));
  if(handoff.sector==='sports'){
    const players=handoff.nodes.filter(n=>n.kind==='route');
    if(!players.length)fail('roles_missing');
    for(const n of players){
      if(!ids.has('rc13:player:'+n.id))fail('marker_missing');
    }
    for(let tick=1;tick<=ticks;tick++){
      const progress=tick/ticks;
      for(const node of players){
        events.push({
          id:'rc13:author:'+String(tick).padStart(4,'0')+':'+node.id,
          tick,entityId:'rc13:player:'+node.id,kind:'teleport',
          value:authoredRoutePoint(node.route,progress)
        });
      }
    }
  }else if(handoff.sector==='response'){
    if(!ids.has('rc13:scenario-front'))fail('phase_indicator_missing');
    for(let tick=1;tick<=ticks;tick++){
      events.push({
        id:'rc13:author:'+String(tick).padStart(4,'0')+':scenario-front',
        tick,entityId:'rc13:scenario-front',kind:'teleport',
        value:{x:0,y:.94-1.88*tick/ticks,z:.015}
      });
    }
  }else fail('sector_unsupported');
  const core={
    schema:'evercraft.world-engine.visual-motion-ledger.v1',
    worldId:projection.world.id,
    sourceHandoffDigest:handoff.digest,
    sourceProjectionReceiptDigest:projection.receipt.digest,
    ticks,frameRateHz:60,
    sourceMotionClass:'authored_schematic_not_observed',
    release_state:'human_review_required',
    decision_authority:false,publication_authority:false,
    events
  };
  return{...core,digest:hash(core)};
}
export function verifyFallenVisualMotionLedger(ledger,projection){
  if(!ledger||ledger.schema!=='evercraft.world-engine.visual-motion-ledger.v1'||!projection||!verifyFallenVisualSceneReceipt(projection.receipt,projection.world,projection.geometryAssets))return false;
  const {digest,...core}=ledger;
  if(core.worldId!==projection.world.id||core.sourceHandoffDigest!==projection.receipt.sourceHandoffDigest||
     core.sourceProjectionReceiptDigest!==projection.receipt.digest||core.sourceMotionClass!=='authored_schematic_not_observed'||
     core.release_state!=='human_review_required'||core.publication_authority!==false||core.decision_authority!==false||
     !Number.isInteger(core.ticks)||core.ticks<1||core.ticks>240||core.frameRateHz!==60)return false;
  if(!Array.isArray(core.events)||core.events.length<1||core.events.length>5280)return false;
  const ids=new Set(projection.world.entities.map(e=>e.id));
  const eventIds=new Set();
  for(const e of core.events){
    if(!e||e.kind!=='teleport'||typeof e.id!=='string'||eventIds.has(e.id)||!ids.has(e.entityId)||
       !Number.isInteger(e.tick)||e.tick<1||e.tick>core.ticks||
       !e.value||!Number.isFinite(e.value.x)||!Number.isFinite(e.value.y)||!Number.isFinite(e.value.z))return false;
    eventIds.add(e.id);
  }
  return typeof digest==='string'&&hash(core)===digest;
}
