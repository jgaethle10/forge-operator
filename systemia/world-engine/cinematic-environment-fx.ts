/**
 * Evercraft World Engine procedural environmental FX emitter rig.
 *
 * Reusable GPU mesh instances for ocean wakes, bow spray, smoke/dust trails.
 * Every effect entity is compiled into our ORIGINAL WGSL WebGPU scene plan.
 * Deterministic temporal particles, real parent-keyframed origins, no 2D overlays.
 * NOT CFD, photogrammetry, volumetric smoke, collision or historical simulation.
 */
import crypto from 'node:crypto';
import type {WorldDefinition,WorldEntity,Vec3} from './engine.js';
import {validateWorldDefinition} from './engine.js';
import type {GeometryAsset} from './webgpu.js';
import {validateGeometryAsset} from './webgpu.js';
import {sampleCinematicActorTrack,validateActorMotionRig,type ActorMotionRig} from './cinematic-actor-motion.js';

export type FxKind='wake'|'spray'|'smoke';
export type CinematicFxEmitter={
 id:string;kind:FxKind;actorId:string;anchorLocal:Vec3;
 count:number;intervalSec:number;lifetimeSec:number;
 radius:number;driftLocal:Vec3;phase:number;
};
export type CinematicFxRig={
 schema:'evercraft.world-engine.cinematic-fx-rig.v1';
 id:string;durationSec:number;
 emitters:CinematicFxEmitter[];
 publicationAuthority:false;
};
const hash=(o:unknown)=>crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
const reject=(s:string):never=>{throw Error('cinematic_fx_'+s);};
const good=(n:number)=>Number.isFinite(n);
const vec=(v:Vec3)=>v&&good(v.x)&&good(v.y)&&good(v.z);
const fxId=(e:CinematicFxEmitter,i:number)=>'vfx-'+e.id+'-'+String(i).padStart(2,'0');
function shape(id:string,triangles:Array<[number[],number[],number[]]>):GeometryAsset{
 const positions:number[]=[],normals:number[]=[],uvs:number[]=[];
 for(const [a,b,c] of triangles){
  const d=[b[0]-a[0],b[1]-a[1],b[2]-a[2]];
  const e=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
  const n=[d[1]*e[2]-d[2]*e[1],d[2]*e[0]-d[0]*e[2],d[0]*e[1]-d[1]*e[0]];
  const length=Math.max(1e-8,Math.hypot(...n));
  for(const [index,p] of [a,b,c].entries()){
   positions.push(...p);normals.push(...n.map(v=>v/length));
   uvs.push(index===1?1:0,index===2?1:0);
  }
 }
 const geom:GeometryAsset={schema:'evercraft.world-engine.geometry.v1',id,
  primitive:'triangles',positions,normals,uvs};
 validateGeometryAsset(geom);return geom;
}
function wakeCrest():GeometryAsset{
 // Thin ridged V-shaped wake crest, tapered at the ends; static 3D source mesh.
 const tris:Array<[number[],number[],number[]]>=[];
 const n=24;
 for(let i=0;i<n;i++){
  const u=i/n,v=(i+1)/n;
  const at=(t:number,r:number)=>{
   const x=2*t-1;
   const taper=.15+.85*Math.sin(Math.PI*t);
   return [x,.08*Math.sin(t*Math.PI)+.015, -.56*Math.abs(x)+r*.25*taper];
  };
  const a=at(u,0),b=at(u,1),c=at(v,1),d=at(v,0);
  tris.push([a,b,c],[a,c,d]);
 }
 return shape('owned:fx-cinematic-wake-crest',tris);
}
function plumePuff():GeometryAsset{
 // Closed low-poly round 3D geometry, not a camera-facing image billboard.
 const tris:Array<[number[],number[],number[]]>=[];
 const lat=7,lon=12;
 const point=(a:number,b:number)=>{
  const phi=Math.PI*a/lat,theta=2*Math.PI*b/lon;
  return [Math.sin(phi)*Math.cos(theta),Math.cos(phi),Math.sin(phi)*Math.sin(theta)];
 };
 for(let a=0;a<lat;a++)for(let b=0;b<lon;b++){
  const u=point(a,b),v=point(a+1,b),w=point(a+1,b+1),z=point(a,b+1);
  if(a>0)tris.push([u,v,z]);
  if(a<lat-1)tris.push([z,v,w]);
 }
 return shape('owned:fx-cinematic-3d-puff',tris);
}
export function cinematicFxGeometry():GeometryAsset[]{
 return [wakeCrest(),plumePuff()];
}
export function validateCinematicFxRig(world:WorldDefinition,actors:ActorMotionRig,rig:CinematicFxRig){
 if(rig?.schema!=='evercraft.world-engine.cinematic-fx-rig.v1'||rig.publicationAuthority!==false||
    !/^[a-z0-9][a-z0-9-]{3,69}$/.test(rig.id||''))reject('schema_or_publication');
 validateActorMotionRig(world,actors);
 if(!good(rig.durationSec)||rig.durationSec!==actors.durationSec)reject('duration');
 if(!Array.isArray(rig.emitters)||rig.emitters.length===0||rig.emitters.length>20)reject('emitters');
 const seen=new Set<string>();
 let particles=0;
 for(const e of rig.emitters){
  if(!e||!/^[a-z0-9][a-z0-9-]{2,40}$/.test(e.id||'')||seen.has(e.id))reject('emitter_id');
  seen.add(e.id);
  if(!['wake','spray','smoke'].includes(e.kind)||!actors.tracks.some(t=>t.id===e.actorId))
   reject('effect_or_actor');
  if(!vec(e.anchorLocal)||!vec(e.driftLocal))reject('vector');
  if(!Number.isInteger(e.count)||e.count<2||e.count>22||
     !good(e.intervalSec)||e.intervalSec<.08||e.intervalSec>.8||
     !good(e.lifetimeSec)||e.lifetimeSec<.3||e.lifetimeSec>6||
     !good(e.radius)||e.radius<.03||e.radius>9||
     !good(e.phase)||e.phase<0||e.phase>=1)reject('invalid_emission_parameters');
  if(e.lifetimeSec>=e.count*e.intervalSec)reject('lifetime_exceeds_emitter_cycle');
  if(Math.max(...Object.values(e.driftLocal).map(Math.abs))>10||
     Math.max(...Object.values(e.anchorLocal).map(Math.abs))>70)reject('displacement_out_of_bounds');
  particles+=e.count;
 }
 if(particles>190)reject('particle_budget');
 return {schema:rig.schema,id:rig.id,rigDigest:hash(rig),
  emitterCount:rig.emitters.length,particleBudget:particles,
  originalGeometryAssets:2,publicationAuthority:false};
}
const rotate=(p:Vec3,degrees:number):Vec3=>{
 const a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 return {x:c*p.x+s*p.z,y:p.y,z:-s*p.x+c*p.z};
};
export function attachCinematicFxToWorld(world:WorldDefinition,actors:ActorMotionRig,fx:CinematicFxRig):WorldDefinition{
 const proof=validateCinematicFxRig(world,actors,fx);
 if(world.entities.some(e=>e.id.startsWith('vfx-')))reject('already_attached');
 const scene=structuredClone(world);
 if(!scene.visualScene)reject('no_visual_scene');
 const base=scene.visualScene.materials.find(m=>m.id==='foam');
 if(!base)reject('foam_base_material_missing');
 scene.visualScene.materials.push(
  ...[.48,.33,.21,.10].map((alpha,i)=>({...structuredClone(base),
    id:'vfx-wake-'+i,baseColor:{r:.62,g:.78,b:.81,a:alpha},
    alphaMode:'blend' as const,roughness:.98,metallic:0,doubleSided:true})),
  ...[.70,.26].map((alpha,i)=>({...structuredClone(base),id:'vfx-spray-'+i,
    baseColor:{r:.77,g:.86,b:.87,a:alpha},alphaMode:'blend' as const,
    roughness:1,metallic:0,doubleSided:true})),
  ...[.32,.24,.14,.06].map((alpha,i)=>({...structuredClone(base),id:'vfx-smoke-'+i,
    baseColor:{r:.36,g:.38,b:.41,a:alpha},alphaMode:'blend' as const,
    roughness:1,metallic:0,doubleSided:true}))
 );
 for(const emitter of fx.emitters)for(let i=0;i<emitter.count;i++){
  scene.entities.push({
   id:fxId(emitter,i),name:'Original GPU '+emitter.kind+' emitter '+emitter.id+' '+i,
   transform:{position:{x:0,y:-100,z:0},scale:{x:1,y:1,z:1}},
   renderable:{
    geometryRef:emitter.kind==='wake'?'owned:fx-cinematic-wake-crest':'owned:fx-cinematic-3d-puff',
    materialId:'vfx-'+emitter.kind+'-0',
    visible:false,castsShadow:false,receivesShadow:false
   },
   tags:['world_engine_original_fx','cinematic_fx_not_physics',emitter.kind,emitter.actorId]
  });
 }
 scene.metadata={...(scene.metadata||{}),
  environmentalFx:'original_deterministic_GPU_mesh_emitters_not_CFD',
  fxRigDigest:proof.rigDigest,fxOriginalGeometries:proof.originalGeometryAssets,
  fxPublicationAuthority:false};
 validateWorldDefinition(scene);
 return scene;
}
export function animateCinematicFx(world:WorldDefinition,entities:WorldEntity[],
 actors:ActorMotionRig,fx:CinematicFxRig,timeSec:number){
 if(!good(timeSec)||timeSec<0||timeSec>fx.durationSec+1e-7)reject('time');
 // Validate upfront in rig sequence; this stand-alone entrypoint must also
 // defend against malformed untrusted authoring requests.
 const proof=validateCinematicFxRig(world,actors,fx);
 const edits=new Map<string,WorldEntity>();
 let active=0;
 const state:Array<{id:string;x:number;y:number;z:number;age:number}>=[];
 for(const emitter of fx.emitters){
  const track=actors.tracks.find(t=>t.id===emitter.actorId)!;
  const hull=world.entities.find(e=>e.id===emitter.actorId+'-ship-hull');
  if(!hull)reject('actor_hull_missing');
  const heading=hull.transform.rotationDeg?.y??0;
  const period=emitter.count*emitter.intervalSec;
  for(let i=0;i<emitter.count;i++){
   const entityId=fxId(emitter,i);
   const source=entities.find(e=>e.id===entityId);
   if(!source?.renderable)reject('fx_entity_not_attached');
   const age=(timeSec - (i+emitter.phase)*emitter.intervalSec+period*3)%period;
   const visible=age<emitter.lifetimeSec;
   const entity=structuredClone(source);
   entity.renderable!.visible=visible;
   if(visible){
    const born=timeSec-age;
    // For pre-roll particles, sample the earliest authored vessel position.
    const pose=sampleCinematicActorTrack(track,born);
    const yaw=heading+pose.headingDeg;
    const anchor=rotate(emitter.anchorLocal,yaw);
    const drift=rotate(emitter.driftLocal,yaw);
    const progress=age/emitter.lifetimeSec;
    if(emitter.kind==='wake')entity.renderable!.materialId='vfx-wake-'+Math.min(3,Math.floor(progress*4));
    if(emitter.kind==='smoke')entity.renderable!.materialId='vfx-smoke-'+Math.min(3,Math.floor(progress*4));
    if(emitter.kind==='spray')entity.renderable!.materialId='vfx-spray-'+Math.min(1,Math.floor(progress*2));
    const wiggle=.065*Math.sin(7*progress+i*.81+emitter.phase*5);
    const splash=emitter.kind==='spray'?Math.sin(Math.PI*progress)*1.35:0;
    const radius=emitter.radius*(emitter.kind==='wake'?
     (.48+1.5*progress):emitter.kind==='smoke'?
     (.55+1.8*progress):(.25+.75*progress));
    const x=track.pivot.x+pose.displacement.x+anchor.x+age*drift.x+wiggle;
    const y=track.pivot.y+pose.displacement.y+anchor.y+age*drift.y+splash;
    const z=track.pivot.z+pose.displacement.z+anchor.z+age*drift.z;
    entity.transform.position={x,y,z};
    entity.transform.rotationDeg={x:0,y:yaw,z:0};
    entity.transform.scale=emitter.kind==='wake'?
     {x:radius*1.15,y:.045,z:radius*.42}:
     {x:radius,y:radius*(emitter.kind==='smoke'?1.35:1),z:radius};
    state.push({id:entityId,x,y,z,age});
    active++;
   }
   edits.set(entityId,entity);
  }
 }
 return {entities:entities.map(e=>edits.get(e.id)??e),
  evidence:{...proof,activeParticles:active,timeSec,frameDigest:hash(state)}};
}
