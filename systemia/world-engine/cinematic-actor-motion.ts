/**
 * Evercraft World Engine: deterministic cinematic ACTOR MOTION RIG.
 * Opt-in, real-world-space rigid group movement before canonical VisualFrame
 * and WebGPU RenderPlan compilation. Not collision, CFD, or historical telemetry.
 * Original world/runtime/other film render paths remain unchanged.
 */
import crypto from 'node:crypto';
import type {WorldDefinition,WorldEntity,Vec3} from './engine.js';

export type ActorKeyframe={
 timeSec:number;
 displacement:Vec3;   // world units relative to authored starting pivot
 headingDeg:number;    // yaw delta from authored orientation
};
export type ActorTrack={
 id:string;
 entityIds:string[];
 pivot:Vec3;
 keyframes:ActorKeyframe[];
 heave?:{amplitude:number;frequencyHz:number;phaseRad:number};
 roll?:{amplitudeDeg:number;frequencyHz:number;phaseRad:number};
};
export type ActorMotionRig={
 schema:'evercraft.world-engine.actor-motion-rig.v1';
 id:string;
 durationSec:number;
 tracks:ActorTrack[];
 publicationAuthority:false;
};
const error=(reason:string):never=>{throw Error('actor_motion_'+reason);};
const sha=(o:unknown)=>crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
const finite=(n:number)=>Number.isFinite(n);
const goodVec=(v:Vec3)=>v&&finite(v.x)&&finite(v.y)&&finite(v.z);
export function validateActorMotionRig(world:WorldDefinition,rig:ActorMotionRig){
 if(rig?.schema!=='evercraft.world-engine.actor-motion-rig.v1'||rig.publicationAuthority!==false||
    !/^[a-z0-9][a-z0-9-]{3,69}$/.test(rig.id||''))error('schema_or_release');
 if(!finite(rig.durationSec)||rig.durationSec<.5||rig.durationSec>8)error('duration_invalid');
 if(!Array.isArray(rig.tracks)||rig.tracks.length<1||rig.tracks.length>24)error('track_count');
 const worldIds=new Set(world.entities.map(e=>e.id));
 const owned=new Set<string>();
 for(const track of rig.tracks){
  if(!/^[a-z0-9][a-z0-9-]{2,69}$/.test(track?.id||''))error('track_id');
  if(!goodVec(track.pivot))error('pivot');
  if(!Array.isArray(track.entityIds)||track.entityIds.length<1||track.entityIds.length>256)error('entity_count');
  for(const id of track.entityIds){
   if(!worldIds.has(id)||owned.has(id)||!world.entities.find(e=>e.id===id)?.renderable)
    error('unknown_duplicate_or_nonrenderable_entity_'+id);
   owned.add(id);
  }
  if(!Array.isArray(track.keyframes)||track.keyframes.length<2||track.keyframes.length>32)error('keyframes');
  let prior=-1;
  for(const k of track.keyframes){
   if(!finite(k.timeSec)||k.timeSec<=prior||k.timeSec<0||k.timeSec>rig.durationSec||
      !goodVec(k.displacement)||!finite(k.headingDeg)||Math.abs(k.headingDeg)>35||
      Math.abs(k.displacement.x)>24||Math.abs(k.displacement.y)>4||Math.abs(k.displacement.z)>24)
     error('keyframe_invalid');
   prior=k.timeSec;
  }
  if(track.keyframes[0].timeSec!==0||track.keyframes.at(-1)!.timeSec!==rig.durationSec)
   error('keyframe_boundaries');
  for(const spec of [track.heave,track.roll]){
   if(!spec)continue;
   if(!finite(spec.amplitude)||!finite(spec.frequencyHz)||!finite(spec.phaseRad)||
      spec.frequencyHz<.03||spec.frequencyHz>2||Math.abs(spec.phaseRad)>2*Math.PI)
     error('oscillator_invalid');
  }
  if(track.heave&& (track.heave.amplitude<0||track.heave.amplitude>.9))error('heave_too_large');
  if(track.roll&& (track.roll.amplitudeDeg<0||track.roll.amplitudeDeg>6))error('roll_too_large');
 }
 return {schema:rig.schema,rigDigest:sha(rig),rigId:rig.id,
  actorCount:rig.tracks.length,entityCount:owned.size,publicationAuthority:false};
}
function sampleKeyframes(track:ActorTrack,t:number){
 const seq=track.keyframes;let b=1;
 while(b<seq.length-1&&t>seq[b].timeSec)b++;
 const a=seq[b-1],z=seq[b],alpha=Math.max(0,Math.min(1,(t-a.timeSec)/(z.timeSec-a.timeSec)));
 // Smoothstep avoids an instant change in velocity at hard editorial keys.
 const u=alpha*alpha*(3-2*alpha);
 const mix=(x:number,y:number)=>x+(y-x)*u;
 return {displacement:{x:mix(a.displacement.x,z.displacement.x),
 y:mix(a.displacement.y,z.displacement.y),z:mix(a.displacement.z,z.displacement.z)},
 headingDeg:mix(a.headingDeg,z.headingDeg)};
}
export function animateCinematicEntities(world:WorldDefinition,entities:WorldEntity[],rig:ActorMotionRig,timeSec:number){
 if(!finite(timeSec)||timeSec<0||timeSec>rig.durationSec+1e-7)error('time_invalid');
 const evidence=validateActorMotionRig(world,rig);
 const updates=new Map<string,WorldEntity>();
 const sampleSummary=[];
 for(const track of rig.tracks){
  const s=sampleKeyframes(track,Math.min(timeSec,rig.durationSec));
  const radians=s.headingDeg*Math.PI/180,c=Math.cos(radians),q=Math.sin(radians);
  const heave=track.heave?track.heave.amplitude*(Math.sin(2*Math.PI*track.heave.frequencyHz*timeSec+track.heave.phaseRad)-Math.sin(track.heave.phaseRad)):0;
  const roll=track.roll?track.roll.amplitudeDeg*(Math.sin(2*Math.PI*track.roll.frequencyHz*timeSec+track.roll.phaseRad)-Math.sin(track.roll.phaseRad)):0;
  for(const id of track.entityIds){
   const original=world.entities.find(e=>e.id===id);
   const current=entities.find(e=>e.id===id);
   if(!current||!original)error('animated_entity_missing_'+id);
   const p=original.transform.position,dx=p.x-track.pivot.x,dz=p.z-track.pivot.z;
   const updated=structuredClone(current);
   updated.transform={...updated.transform,
    position:{x:track.pivot.x+s.displacement.x+c*dx+q*dz,
     y:p.y+s.displacement.y+heave,
     z:track.pivot.z+s.displacement.z-q*dx+c*dz},
    rotationDeg:{x:original.transform.rotationDeg?.x??0,
     y:(original.transform.rotationDeg?.y??0)+s.headingDeg,
     z:(original.transform.rotationDeg?.z??0)+roll}
   };
   updates.set(id,updated);
  }
  sampleSummary.push({id:track.id,position:s.displacement,yawDeg:s.headingDeg,heave,roll});
 }
 return {entities:entities.map(e=>updates.get(e.id)??e),
  evidence:{...evidence,timeSec,animationDigest:sha(sampleSummary),samples:sampleSummary}};
}
