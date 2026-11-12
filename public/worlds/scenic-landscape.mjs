// Evercraft Worlds / Mossmere scenic-geometry pass. Owned, deterministic, dependency-free.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const SCENIC_PROFILE=Object.freeze({terrainExtent:62,terrainSegments:48,grassCount:580});
export function landscapeHeight(x,z){
 if(!Number.isFinite(x)||!Number.isFinite(z))throw Error('landscape_coordinates_required');
 // Workshop stays above the decorative landscape, preserving all collision behavior.
 const edge=Math.max(Math.abs(x),Math.abs(z));
 const ramp=clamp((edge-18.2)/23,0,1),ease=ramp*ramp*(3-2*ramp);
 const ridges=2.35+1.1*Math.sin(x*.116+z*.028)+.72*Math.cos(z*.132-x*.048)+.38*Math.sin(x*.31-z*.17);
 return -.24+ease*Math.max(.18,ridges);
}
export function makeLandscapeGeometry({extent=SCENIC_PROFILE.terrainExtent,segments=SCENIC_PROFILE.terrainSegments}={}){
 if(!Number.isFinite(extent)||extent<38||extent>150||!Number.isInteger(segments)||segments<8||segments>96)
  throw Error('landscape_geometry_bounds');
 const positions=[],normals=[];
 function vertex(x,z){
  const y=landscapeHeight(x,z),step=.16;
  const dx=(landscapeHeight(x+step,z)-landscapeHeight(x-step,z))/(2*step);
  const dz=(landscapeHeight(x,z+step)-landscapeHeight(x,z-step))/(2*step);
  const inv=1/Math.hypot(dx,1,dz);
  return {p:[x,y,z],n:[-dx*inv,inv,-dz*inv]};
 }
 function triangle(a,b,c){for(const v of [a,b,c]){positions.push(...v.p);normals.push(...v.n);}}
 const step=2*extent/segments;
 for(let iz=0;iz<segments;iz++){
  const z=-extent+iz*step;
  for(let ix=0;ix<segments;ix++){
   const x=-extent+ix*step;
   const a=vertex(x,z),b=vertex(x+step,z),c=vertex(x+step,z+step),d=vertex(x,z+step);
   triangle(a,b,c);triangle(a,c,d);
  }
 }
 return {positions,normals,triangleCount:segments*segments*2};
}
export function makeGrassTuftGeometry(){
 const positions=[],normals=[];
 // Crossed blades fit into a single instanced mesh, not one draw per tuft.
 for(const angle of [0,Math.PI*.63,Math.PI*1.27]){
  const dx=Math.cos(angle),dz=Math.sin(angle),side=[-dz,dx];
  const vertices=[[-side[0]*.26,0,-side[1]*.26],[side[0]*.26,0,side[1]*.26],[dx*.20,1,dz*.20]];
  for(const v of vertices){positions.push(...v);normals.push(dx*.84,.36,dz*.84);}
 }
 return {positions,normals,bladeCount:3};
}
function rng(seed){let value=seed>>>0;return()=>((value=(Math.imul(value,1664525)+1013904223)>>>0)/4294967296);}
export function makeGrassPatches({seed=1917,count=SCENIC_PROFILE.grassCount}={}){
 if(!Number.isInteger(seed)||!Number.isInteger(count)||count<0||count>1200)throw Error('grass_patch_limits');
 const random=rng(seed),plants=[],colors=['#829e7b','#9eb18a','#a6b587','#829b77','#c1ba86','#6d9079'];
 for(let attempts=0;plants.length<count&&attempts<count*24;attempts++){
  const x=(random()-.5)*36.2,z=(random()-.5)*36.2;
  if(x>-7.8&&x<.9&&z>-8.6&&z<.2)continue;
  if(((x-7)/4.5)**2+((z+5)/3.8)**2<1)continue;
  if(z>-.7&&z<7.8&&Math.abs(x-1.3*Math.sin((7-z)/.68*.22))<1.18)continue;
  const height=.26+random()*.34,width=.18+random()*.18;
  plants.push({x,z,height,width,rotation:random()*Math.PI*2,color:colors[Math.floor(random()*colors.length)]});
 }
 if(plants.length!==count)throw Error('grass_placement_exhausted');
 return plants;
}
