/**
 * Camera art-direction QA, using ORIGINAL WebGPU projection and hull meshes.
 * This is an objective foreground obstruction *estimate*, not a claim of
 * pixel-level visibility or artist approval. Only explicit editorial shots
 * enter this lane. Inspect actual native pixels after passing.
 */
import type {WebGpuRenderPlan,GeometryAsset} from './webgpu.js';
import {auditWebGpuHeroFraming} from './shot-composition.js';
export const NAVAL_ACTORS=['hood','prince-of-wales','bismarck','prinz-eugen'] as const;
export type NavalActorId=typeof NAVAL_ACTORS[number];
const distance=(a:number[],b:number[])=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
function boundsOverlap(hero:{left:number;right:number;top:number;bottom:number},
 other:{left:number;right:number;top:number;bottom:number}){
 const width=Math.max(0,Math.min(hero.right,other.right)-Math.max(hero.left,other.left));
 const height=Math.max(0,Math.min(hero.top,other.top)-Math.max(hero.bottom,other.bottom));
 const heroArea=Math.max(1e-8,(hero.right-hero.left)*(hero.top-hero.bottom));
 return width*height/heroArea;
}
export function auditNavalEditorialForeground(input:{
 plan:WebGpuRenderPlan;geometries:GeometryAsset[];
 hero:NavalActorId;
}){
 const {plan,geometries,hero}=input;
 if(!NAVAL_ACTORS.includes(hero))throw Error('naval_foreground_hero_invalid');
 const hull=(id:NavalActorId)=>{
  const draw=plan.draws.find(d=>d.entityId===id+'-ship-hull');
  if(!draw)throw Error('naval_foreground_hull_missing:'+id);
  return draw;
 };
 const center=(id:NavalActorId)=>{
  const m=hull(id).modelMatrix;
  return [m[12],m[13],m[14]];
 };
 const sourceCamera=[...plan.cameraPosition];
 const targetDistance=distance(center(hero),sourceCamera);
 const projected=(id:NavalActorId)=>auditWebGpuHeroFraming({
  plan,geometries,subject:{id:'naval-foreground-'+id,
   entityIds:[id+'-ship-hull'],minVisibleFraction:.2}});
 const heroShape=projected(hero);
 const compared=NAVAL_ACTORS.filter(id=>id!==hero).map(id=>{
  const shape=projected(id);
  const distanceFromCamera=distance(center(id),sourceCamera);
  const overlap=boundsOverlap(heroShape.clippedBounds,shape.clippedBounds);
  const nearfield=distanceFromCamera<targetDistance*.86;
  const visible=shape.coverage.area>.014;
  return {id,distanceFromCamera,screenArea:shape.coverage.area,
   overlapsHeroFraction:overlap,nearfield,
   actuallyFramed:visible,
   obstructionRisk:nearfield&&visible&&overlap>.08};
 });
 return {
  schema:'evercraft.world-engine.naval-foreground-camera-audit.v1' as const,
  hero,heroDistance:targetDistance,
  visibleNearfieldObstructions:compared.filter(x=>x.obstructionRisk),
  compared,estimatedForegroundClear:compared.every(x=>!x.obstructionRisk),
  humanPixelReviewRequired:true as const,publicationAuthority:false as const
 };
}
