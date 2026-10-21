/**
 * Evercraft reusable owned parametric geometry: tapered cabins, lathed tubes,
 * observation ring platforms and radar grids.
 *
 * Deliberately normalized primitives. Any actor can instance with an existing
 * WorldEntity transform: buildings, aircraft, machinery, historical visualizations.
 * No stock assets, no scans, no historical dimensional accuracy claim.
 */
import {validateGeometryAsset,type GeometryAsset} from './webgpu.js';
type Vec=[number,number,number];
function vec(x:number,y:number,z:number):Vec{return [x,y,z]}
class Mesh {
 readonly positions:number[]=[];
 readonly normals:number[]=[];
 readonly uvs:number[]=[];
 tri(a:Vec,b:Vec,c:Vec){
  const u=vec(b[0]-a[0],b[1]-a[1],b[2]-a[2]),v=vec(c[0]-a[0],c[1]-a[1],c[2]-a[2]);
  const n=vec(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]);
  const l=Math.max(1e-8,Math.hypot(...n));
  for(const [i,p] of [a,b,c].entries()){
   this.positions.push(...p);this.normals.push(n[0]/l,n[1]/l,n[2]/l);
   this.uvs.push(i===1?1:0,i===2?1:0);
  }
 }
 quad(a:Vec,b:Vec,c:Vec,d:Vec){this.tri(a,b,c);this.tri(a,c,d)}
 finish(id:string):GeometryAsset{
  const result:GeometryAsset={schema:'evercraft.world-engine.geometry.v1',
   id,primitive:'triangles',positions:this.positions,normals:this.normals,uvs:this.uvs};
  validateGeometryAsset(result);return result;
 }
}
export function makeTaperedCabinGeometry():GeometryAsset{
 const m=new Mesh();
 // Broad base with an inset forward-facing sloped upper bridge.
 const bottom=[vec(-1,-1,-1),vec(1,-1,-1),vec(1,-1,1),vec(-1,-1,1)];
 const top=[vec(-.78,1,-.69),vec(.78,1,-.69),vec(.78,1,.8),vec(-.78,1,.8)];
 for(let i=0;i<4;i++){let j=(i+1)%4;m.quad(bottom[i],bottom[j],top[j],top[i])}
 m.quad(top[0],top[3],top[2],top[1]);m.quad(bottom[3],bottom[0],bottom[1],bottom[2]);
 return m.finish('owned:kit-tapered-cabin');
}
export function makeLathedFunnelGeometry(segments=24):GeometryAsset{
 if(!Number.isInteger(segments)||segments<8||segments>64)throw Error('asset_kit_funnel_segments_invalid');
 const m=new Mesh();
 const rings=[
  {y:-1,r:1},
  {y:-.64,r:.99},
  {y:.43,r:.84},
  {y:.88,r:.91},
  {y:1,r:.91}
 ];
 for(let k=0;k<rings.length-1;k++)for(let i=0;i<segments;i++){
  const [a,b]=[rings[k],rings[k+1]],c=2*Math.PI*i/segments,d=2*Math.PI*(i+1)/segments;
  m.quad(vec(a.r*Math.cos(c),a.y,a.r*Math.sin(c)),
    vec(a.r*Math.cos(d),a.y,a.r*Math.sin(d)),
    vec(b.r*Math.cos(d),b.y,b.r*Math.sin(d)),
    vec(b.r*Math.cos(c),b.y,b.r*Math.sin(c)));
 }
 // Inset upper opening: top annulus, dark recessed bowl, not a solid block.
 for(let i=0;i<segments;i++){
  const c=2*Math.PI*i/segments,d=2*Math.PI*(i+1)/segments;
  const ring=(r:number,y:number,t:number)=>vec(r*Math.cos(t),y,r*Math.sin(t));
  m.quad(ring(.91,1,c),ring(.91,1,d),ring(.67,.90,d),ring(.67,.90,c));
  m.tri(ring(.67,.90,c),ring(.67,.90,d),vec(0,.78,0));
 }
 return m.finish('owned:kit-ship-funnel');
}
export function makeRoundObservationDeckGeometry(segments=20):GeometryAsset{
 if(!Number.isInteger(segments)||segments<8||segments>64)throw Error('asset_kit_platform_segments_invalid');
 const m=new Mesh();
 for(let i=0;i<segments;i++){
  const a=2*Math.PI*i/segments,b=2*Math.PI*(i+1)/segments;
  const ring=(r:number,y:number,t:number)=>vec(r*Math.cos(t),y,r*Math.sin(t));
  m.quad(ring(1,-.25,a),ring(1,-.25,b),ring(1,.25,b),ring(1,.25,a));
  m.tri(vec(0,.25,0),ring(1,.25,a),ring(1,.25,b));
  m.tri(vec(0,-.25,0),ring(1,-.25,b),ring(1,-.25,a));
 }
 return m.finish('owned:kit-observation-deck');
}
export function makeRadarArrayGeometry():GeometryAsset{
 const m=new Mesh();
 // Original thin open diamond grid, not a pasted flat image.
 // Normalized around origin. Vertical struts z-bowed to make a real mesh.
 const n=8,thick=.026;
 const ribbon=(x0:number,y0:number,x1:number,y1:number)=>{
  const z=(x:number,y:number)=>.21*(x*x+y*y);
  const dx=x1-x0,dy=y1-y0,d=Math.hypot(dx,dy),nx=-dy/d*thick,ny=dx/d*thick;
  m.quad(vec(x0+nx,y0+ny,z(x0,y0)),vec(x1+nx,y1+ny,z(x1,y1)),
   vec(x1-nx,y1-ny,z(x1,y1)),vec(x0-nx,y0-ny,z(x0,y0)));
 };
 for(let i=0;i<=n;i++){
  const x=-1+2*i/n;
  ribbon(x,-.6,x,.6);
 }
 for(let i=0;i<=n/2;i++){
  const y=-.6+1.2*i/(n/2);
  ribbon(-1,y,1,y);
 }
 return m.finish('owned:kit-open-radar-array');
}
export function parametricAssetGeometry():GeometryAsset[]{
 return [makeTaperedCabinGeometry(),makeLathedFunnelGeometry(),
  makeRoundObservationDeckGeometry(),makeRadarArrayGeometry()];
}
