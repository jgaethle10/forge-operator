/**
 * Evercraft original procedural multi-station ship/vehicle hull loft engine.
 * Unlike the previous nine-section wedge, it builds a continuously faired
 * 48-section 3D hull, smooth outward surface normals, cambered deck, tapered
 * bilges, rounded shoulders and closed stems/sterns.
 *
 * Generic parametric original art. NOT shipyard blueprints, photogrammetry,
 * validated naval hydrodynamics or 1941 hull geometry.
 */
import {validateGeometryAsset,type GeometryAsset} from './webgpu.js';
type P=[number,number,number];
const p=(x:number,y:number,z:number):P=>[x,y,z];
const maxSections=80;
export type HullLoftSpec={
 id:string;length:number;beam:number;
 profile:'slender'|'full'|'battlecruiser'|'balanced';
 sections?:number;
};
type Station=[number,number];
const control:Station[]=[
 [-1,.24],[-.93,.57],[-.78,.83],[-.50,.98],[-.08,1.0],
 [.42,.98],[.69,.88],[.85,.65],[.94,.31],[1,.015]
];
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
function widthAt(f:number):number{
 for(let i=1;i<control.length;i++){
  const [a,wa]=control[i-1],[b,wb]=control[i];
  if(f<=b||i===control.length-1){
   const t=clamp((f-a)/(b-a),0,1),u=t*t*(3-2*t);
   return wa+(wb-wa)*u;
  }
 }
 return 0.015;
}
const sub=(a:P,b:P):P=>p(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
function unit(v:P):P{
 const len=Math.max(1e-10,Math.hypot(...v));
 return p(v[0]/len,v[1]/len,v[2]/len);
}
const cross=(u:P,v:P):P=>p(
 u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]);
function validate(s:HullLoftSpec){
 if(!s||!/^[a-z0-9][a-z0-9-]{2,55}$/.test(s.id||'')||
  !Number.isFinite(s.length)||s.length<5||s.length>150||
  !Number.isFinite(s.beam)||s.beam<.4||s.beam>25||
  !['slender','full','battlecruiser','balanced'].includes(s.profile)||
  !Number.isInteger(s.sections??48)||(s.sections??48)<24||(s.sections??48)>maxSections)
  throw Error('hull_loft_spec_invalid');
}
export function sampleHullLoft(s:HullLoftSpec,u:number):{
 f:number;halfBeam:number;deckHeight:number;keelHeight:number;
}{
 validate(s);
 if(!Number.isFinite(u)||u<0||u>1)throw Error('hull_loft_sample_invalid');
 const f=2*u-1;
 const profileWidth={slender:.83,full:1.07,battlecruiser:.90,balanced:1}[s.profile];
 const sheer=.08+.18*Math.pow(Math.abs(f),4)+.24*Math.pow(Math.max(0,f),7);
 const fullness=widthAt(f)*profileWidth;
 const lower= s.profile==='slender'?.12:s.profile==='full'?.28:.20;
 return {f,halfBeam:s.beam*fullness,deckHeight:1.9+sheer,
  keelHeight:-1.30-lower*.30-.18*(1-Math.abs(f))};
}
export function makeHullLoft(s:HullLoftSpec):GeometryAsset{
 validate(s);
 const total=s.sections??48;
 const stations=Array.from({length:total+1},(_,i)=>{
  const st=sampleHullLoft(s,i/total),w=st.halfBeam;
  const fore=st.f*s.length/2,h=st.deckHeight,k=st.keelHeight;
  const round=s.profile==='slender'?.66:s.profile==='full'?.76:.71;
  const high=1.2+.09*Math.pow(Math.abs(st.f),3);
  // Ordered port deck edge clockwise around UNDERWATER cross-section
  // to starboard deck edge. Real 3D surface has nonzero camber/bilge.
  const ring:P[]=[
   p(-w,h,fore),p(-.97*w,high,fore),
   p(-.91*w,.14,fore),p(-round*w,-.66,fore),
   p(-.23*w,k+.11,fore),p(0,k,fore),
   p(.23*w,k+.11,fore),p(round*w,-.66,fore),
   p(.91*w,.14,fore),p(.97*w,high,fore),p(w,h,fore)
  ];
  return {st,ring};
 });
 const positions:number[]=[],normals:number[]=[],uvs:number[]=[];
 const add=(v:P,n:P,uv:[number,number])=>{
  positions.push(...v);normals.push(...unit(n));uvs.push(...uv);
 };
 const tri=(a:P,b:P,c:P,nA:P,nB:P,nC:P,uvA:[number,number],uvB:[number,number],uvC:[number,number])=>{
  add(a,nA,uvA);add(b,nB,uvB);add(c,nC,uvC);
 };
 // Per-station exact centered finite-difference tangents produce smooth
 // radial normals across hull stations and across lower bilge rings.
 const normalAt=(i:number,j:number):P=>{
  const i0=Math.max(0,i-1),i1=Math.min(total,i+1);
  const j0=Math.max(0,j-1),j1=Math.min(10,j+1);
  const circum=sub(stations[i].ring[j1],stations[i].ring[j0]);
  const longitudinal=sub(stations[i1].ring[j],stations[i0].ring[j]);
  return unit(cross(circum,longitudinal));
 };
 for(let i=0;i<total;i++)for(let j=0;j<10;j++){
  const a=stations[i].ring[j],b=stations[i].ring[j+1];
  const c=stations[i+1].ring[j+1],d=stations[i+1].ring[j];
  const na=normalAt(i,j),nb=normalAt(i,j+1);
  const nc=normalAt(i+1,j+1),nd=normalAt(i+1,j);
  const u0=i/total,u1=(i+1)/total,v0=j/10,v1=(j+1)/10;
  tri(a,b,c,na,nb,nc,[u0,v0],[u0,v1],[u1,v1]);
  tri(a,c,d,na,nc,nd,[u0,v0],[u1,v1],[u1,v0]);
 }
 // Smooth cambered continuous deck from sheer to centerline;
 // own 3D polygons and upwards-normal shading (not a 2D texture).
 const slices=8;
 const deck=(i:number,j:number):P=>{
  const st=stations[i].st,t=(j/slices)*2-1;
  return p(st.halfBeam*t,st.deckHeight+
   .13*(1-t*t),st.f*s.length/2);
 };
 for(let i=0;i<total;i++)for(let j=0;j<slices;j++){
  const a=deck(i,j),b=deck(i+1,j),c=deck(i+1,j+1),d=deck(i,j+1);
  const n=unit(cross(sub(b,a),sub(d,a)));
  const i0=i/total,i1=(i+1)/total,j0=j/slices,j1=(j+1)/slices;
  tri(a,b,c,n,n,n,[i0,j0],[i1,j0],[i1,j1]);
  tri(a,c,d,n,n,n,[i0,j0],[i1,j1],[i0,j1]);
 }
 // Close stern/bow with real triangulated transverse caps, not open planes.
 for(const i of [0,total]){
  const st=stations[i].st,mid=p(0,(st.deckHeight+st.keelHeight)/2,st.f*s.length/2);
  const n=p(0,0,i===0?-1:1);
  for(let j=0;j<10;j++){
   const a=stations[i].ring[j],b=stations[i].ring[j+1];
   if(i===0)tri(mid,a,b,n,n,n,[.5,.5],[j/10,0],[(j+1)/10,0]);
   else tri(mid,b,a,n,n,n,[.5,.5],[(j+1)/10,0],[j/10,0]);
  }
 }
 const geometry:GeometryAsset={schema:'evercraft.world-engine.geometry.v1',
  id:'owned:battle-vessel-'+s.id+'-hull',primitive:'triangles',positions,normals,uvs};
 validateGeometryAsset(geometry);return geometry;
}
