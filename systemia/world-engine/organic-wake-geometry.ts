/**
 * Original, reusable source-owned organic waterline foam patch geometry.
 * Deliberately NO symmetric bow-shaped / chevron / repeating V ribbon.
 * Deterministic curved fragments can be instanced on past vessel paths.
 * Mathematically authored water-surface VFX, not real CFD or photographed foam.
 */
import {validateGeometryAsset,type GeometryAsset} from './webgpu.js';
export const ORGANIC_FOAM_PREFIX='owned:fx-organic-foam-';
const COUNT=4;
export function makeOrganicFoamPatch(variant:number):GeometryAsset{
 if(!Number.isInteger(variant)||variant<0||variant>=COUNT)
  throw Error('organic_foam_variant_invalid');
 const positions:number[]=[],normals:number[]=[],uvs:number[]=[];
 const n=20;
 const at=(t:number,side:number)=>{
  const seed=variant+1;
  const fade=Math.pow(Math.max(0,Math.sin(Math.PI*t)),1.4);
  const center=.19*Math.sin(t*4.8+seed*.69)+.11*Math.sin(t*11.1+seed*1.5);
  const broad=(.038+.61*fade)*(1+.18*Math.sin(t*31.0+seed*3.3));
  const fray=.065*fade*Math.sin(t*61+seed*5.0+side*1.8);
  return [center+side*(broad+fray),
   .012*Math.sin(t*9.7+seed*.3),
   -1+2*t+.026*Math.sin(t*19.1+seed*.8+side)] as [number,number,number];
 };
 const triangle=(a:number[],b:number[],c:number[],uvs3:number[][])=>{
  const edge=[b[0]-a[0],b[1]-a[1],b[2]-a[2]];
  const across=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
  const nrm=[edge[1]*across[2]-edge[2]*across[1],
   edge[2]*across[0]-edge[0]*across[2],
   edge[0]*across[1]-edge[1]*across[0]];
  const l=Math.max(1e-8,Math.hypot(...nrm));
  for(let i=0;i<3;i++){
   positions.push(...[a,b,c][i]);
   normals.push(...nrm.map(v=>v/l));
   uvs.push(...uvs3[i]);
  }
 };
 for(let j=0;j<n;j++){
  const t=j/n,s=(j+1)/n;
  const a=at(t,-1),b=at(s,-1),c=at(s,1),d=at(t,1);
  triangle(a,b,c,[[0,t],[0,s],[1,s]]);
  triangle(a,c,d,[[0,t],[1,s],[1,t]]);
 }
 const geometry:GeometryAsset={schema:'evercraft.world-engine.geometry.v1',
  id:ORGANIC_FOAM_PREFIX+variant,primitive:'triangles',positions,normals,uvs};
 validateGeometryAsset(geometry);
 return geometry;
}
export function organicFoamGeometry():GeometryAsset[]{
 return Array.from({length:COUNT},(_,i)=>makeOrganicFoamPatch(i));
}
export function organicFoamSelection(id:string,slot:number):string{
 if(!/^[a-z0-9][a-z0-9-]{2,70}$/.test(id)||!Number.isInteger(slot)||slot<0||slot>256)
  throw Error('organic_foam_selection_invalid');
 // Different source shapes among adjacent patches; stable per emitter/slot.
 let h=2166136261;
 for(const c of id)h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;
 return ORGANIC_FOAM_PREFIX+((h+slot*7)>>>0)%COUNT;
}
