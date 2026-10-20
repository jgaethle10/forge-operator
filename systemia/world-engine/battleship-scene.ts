/**
 * Evercraft World Engine, original *procedural* battleship and stylized sea.
 * These meshes are constructed as real triangle vertices/normals/UVs.
 * Not a photogrammetry asset, historical vessel, image-to-video trick or
 * physically simulated ocean. Internal proof only, never publish by default.
 */
import {validateWorldDefinition,type WorldDefinition,type Vec3} from './engine.js';
import {validateGeometryAsset,type GeometryAsset} from './webgpu.js';
import type {CinematicCameraTake} from './cinematic-rig.js';

type Point=[number,number,number];
const v=(x:number,y:number,z:number):Point=>[x,y,z];
const normalize=(p:Point):Point=>{
  const d=Math.max(Math.hypot(...p),1e-9);
  return [p[0]/d,p[1]/d,p[2]/d];
};
class Mesh {
  positions:number[]=[];normals:number[]=[];uvs:number[]=[];
  tri(a:Point,b:Point,c:Point,uv?:[[number,number],[number,number],[number,number]]){
    const u:Point=[b[0]-a[0],b[1]-a[1],b[2]-a[2]];
    const w:Point=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
    const n=normalize([u[1]*w[2]-u[2]*w[1],
      u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]]);
    const pts=[a,b,c],tex=uv??[[0,0],[1,0],[1,1]];
    for(let i=0;i<3;i++){this.positions.push(...pts[i]);this.normals.push(...n);this.uvs.push(...tex[i]);}
  }
  quad(a:Point,b:Point,c:Point,d:Point){
    this.tri(a,b,c,[[0,0],[1,0],[1,1]]);
    this.tri(a,c,d,[[0,0],[1,1],[0,1]]);
  }
  geometry(id:string):GeometryAsset {
    const shape:GeometryAsset={schema:'evercraft.world-engine.geometry.v1',
      id,primitive:'triangles',
      positions:this.positions,normals:this.normals,uvs:this.uvs};
    validateGeometryAsset(shape);
    return shape;
  }
}
const stations=[
  {z:-19,w:2.2},
  {z:-16,w:4.0},
  {z:-9,w:4.7},
  {z:0,w:4.7},
  {z:9,w:4.55},
  {z:15,w:3.35},
  {z:19,w:.08}
];
export function makeBattleshipHull():GeometryAsset {
  const mesh=new Mesh();
  for(let i=0;i<stations.length-1;i++){
    const a=stations[i],b=stations[i+1];
    const atop=v(-a.w,1.95,a.z),btop=v(-b.w,1.95,b.z);
    const artop=v(a.w,1.95,a.z),brtop=v(b.w,1.95,b.z);
    const alow=v(-a.w*.78,-1.3,a.z),blow=v(-b.w*.78,-1.3,b.z);
    const arlow=v(a.w*.78,-1.3,a.z),brlow=v(b.w*.78,-1.3,b.z);
    mesh.quad(atop,alow,blow,btop);
    mesh.quad(artop,brtop,brlow,arlow);
    mesh.quad(atop,btop,brtop,artop);
    mesh.quad(alow,arlow,brlow,blow);
  }
  const front=stations.at(-1)!,rear=stations[0];
  mesh.quad(v(-rear.w,1.95,rear.z),v(rear.w,1.95,rear.z),
    v(rear.w*.78,-1.3,rear.z),v(-rear.w*.78,-1.3,rear.z));
  mesh.quad(v(front.w,1.95,front.z),v(-front.w,1.95,front.z),
    v(-front.w*.78,-1.3,front.z),v(front.w*.78,-1.3,front.z));
  return mesh.geometry('owned:battleship-hull');
}
export function makeNavalTurret():GeometryAsset{
  const mesh=new Mesh();
  // Sloped gunhouse, not a cube: armored roof tapers toward bow.
  const bottom=[v(-1.55,-.8,-1.45),v(1.55,-.8,-1.45),
    v(1.48,-.8,1.5),v(-1.48,-.8,1.5)];
  const top=[v(-1.25,.78,-.85),v(1.25,.78,-.85),
    v(1.06,.66,1.32),v(-1.06,.66,1.32)];
  for(let i=0;i<4;i++){const j=(i+1)%4;mesh.quad(bottom[i],bottom[j],top[j],top[i]);}
  mesh.quad(top[0],top[3],top[2],top[1]);
  mesh.quad(bottom[0],bottom[1],bottom[2],bottom[3]);
  return mesh.geometry('owned:armored-turret');
}
export function makeNavalBarrel():GeometryAsset{
  const mesh=new Mesh(),segments=14,r=.16,len=4.5;
  for(let i=0;i<segments;i++){
    const a=2*Math.PI*i/segments,b=2*Math.PI*(i+1)/segments;
    const p0=v(Math.cos(a)*r,Math.sin(a)*r,0);
    const p1=v(Math.cos(b)*r,Math.sin(b)*r,0);
    const p2=v(Math.cos(b)*r,Math.sin(b)*r,len);
    const p3=v(Math.cos(a)*r,Math.sin(a)*r,len);
    mesh.quad(p0,p1,p2,p3);
    mesh.tri(v(0,0,0),p1,p0);
    mesh.tri(v(0,0,len),p3,p2);
  }
  return mesh.geometry('owned:naval-cannon');
}
export function makeSeaSurface():GeometryAsset{
  const mesh=new Mesh();
  const subdivisions=56,span=170;
  const wave=(x:number,z:number)=>
    -.60+.15*Math.sin(x*.42+z*.13)+.12*Math.cos(z*.61-x*.24)
      +.035*Math.sin(1.5*x-1.25*z);
  for(let i=0;i<subdivisions;i++){
    for(let j=0;j<subdivisions;j++){
      const x0=(i/subdivisions-.5)*span,x1=((i+1)/subdivisions-.5)*span;
      const z0=(j/subdivisions-.5)*span,z1=((j+1)/subdivisions-.5)*span;
      const a=v(x0,wave(x0,z0),z0),b=v(x0,wave(x0,z1),z1),
        c=v(x1,wave(x1,z1),z1),d=v(x1,wave(x1,z0),z0);
      mesh.quad(a,b,c,d);
    }
  }
  return mesh.geometry('owned:procedural-sea');
}
function cube():GeometryAsset{
  const mesh=new Mesh();
  const sides=[
    [v(-1,-1,1),v(1,-1,1),v(1,1,1),v(-1,1,1)],
    [v(1,-1,-1),v(-1,-1,-1),v(-1,1,-1),v(1,1,-1)],
    [v(1,-1,1),v(1,-1,-1),v(1,1,-1),v(1,1,1)],
    [v(-1,-1,-1),v(-1,-1,1),v(-1,1,1),v(-1,1,-1)],
    [v(-1,1,1),v(1,1,1),v(1,1,-1),v(-1,1,-1)],
    [v(-1,-1,-1),v(1,-1,-1),v(1,-1,1),v(-1,-1,1)]
  ] as Point[][];
  for(const [a,b,c,d] of sides)mesh.quad(a,b,c,d);
  return mesh.geometry('owned:ship-box');
}
export function battleshipGeometry():GeometryAsset[]{
  return [makeBattleshipHull(),makeNavalTurret(),makeNavalBarrel(),makeSeaSurface(),cube()];
}
export function battleshipWorld():WorldDefinition{
  const material=(id:string,rgb:[number,number,number],metallic:number,roughness:number)=>({
    id,model:'pbr' as const,
    baseColor:{r:rgb[0],g:rgb[1],b:rgb[2],a:1},
    metallic,roughness,doubleSided:true
  });
  const box=(id:string,x:number,y:number,z:number,sx:number,sy:number,sz:number,mat:string,
    cast=true)=>({
      id,transform:{position:{x,y,z},scale:{x:sx,y:sy,z:sz}},
      renderable:{geometryRef:'owned:ship-box',materialId:mat,
        castsShadow:cast,receivesShadow:true}
  });
  const entities:WorldDefinition['entities']=[
    {id:'cinema-camera',transform:{position:{x:-30,y:12,z:30}},
      camera:{projection:{type:'perspective',fovYDeg:48},near:.1,far:350,exposure:1.15}},
    {id:'ship-hull',transform:{position:{x:0,y:0,z:0}},
      renderable:{geometryRef:'owned:battleship-hull',materialId:'hull',
        castsShadow:true,receivesShadow:true}},
    {id:'ocean',transform:{position:{x:0,y:0,z:0}},
      renderable:{geometryRef:'owned:procedural-sea',materialId:'water',
        castsShadow:false,receivesShadow:true}},
    box('deck-detail-center',0,2.03,-4,3.6,.08,9,'deck',false),
    box('aft-raised-deck',0,2.3,-14,3.5,.27,3,'deck',false),
    box('superstructure-base',0,3.25,-5.8,2.95,1.3,4.0,'steel'),
    box('bridge-house',0,5.35,-5.5,2.35,1.0,2.55,'steel'),
    box('bridge-window-dark',0,5.66,-3.02,2.23,.32,.10,'window',false),
    box('bridge-top',0,6.48,-5.5,2.05,.18,2.05,'deck'),
    box('tower-neck',0,8.6,-6.5,1.16,2.2,1.2,'steel'),
    box('radar-head',0,10.9,-6.5,2.4,.26,.24,'antenna'),
    box('radar-horiz',0,11.85,-6.5,3.5,.14,.14,'steel'),
    box('mast-main',0,11.3,-6.5,.13,3.1,.13,'steel'),
    box('stack-1',0,7.2,-10.1,.85,2.9,.9,'steel'),
    box('stack-cap',0,10.18,-10.1,1.05,.17,1.05,'dark'),
    box('deck-fore-rail',0,2.2,12.6,3.0,.09,.09,'accent'),
    box('bow-raised',0,2.2,15.5,1.3,.10,3.2,'deck',false),
    box('stern-raised',0,2.3,-16.5,1.7,.11,2.1,'deck',false)
  ];
  // Three distinct armored turrets. Forward barrels extend toward +Z.
  const turrets=[{z:11.7,y:3.2,id:'fore-a'},{z:6.6,y:3.2,id:'fore-b'},
    {z:-14.2,y:3.2,id:'aft'}];
  for(const t of turrets){
    entities.push({id:'turret-'+t.id,transform:{position:{x:0,y:t.y,z:t.z}},
      renderable:{geometryRef:'owned:armored-turret',materialId:'turret',castsShadow:true,receivesShadow:true}});
    for(const x of [-.60,.60]){
      entities.push({id:'barrel-'+t.id+(x<0?'-port':'-starboard'),
        transform:{position:{x,y:t.y+.18,z:t.z+.8}},
        renderable:{geometryRef:'owned:naval-cannon',materialId:'barrel',castsShadow:true,receivesShadow:true}});
    }
  }
  // Rails and radar details improve silhouette without importing any images.
  for(const x of [-4.0,4.0]){
    for(let z=-14;z<=13;z+=4){
      entities.push(box('railing-'+(x<0?'port':'starboard')+'-'+(z+14),
        x*.92,2.65,z,.045,.42,.045,'accent',false));
    }
    entities.push(box('top-rail-'+(x<0?'port':'starboard'),x*.92,3.07,-.5,.045,.055,13.6,'accent',false));
  }
  // Visible foam rails and a widening stern wake. These are static procedural
  // proxies, not a solved fluid simulation or footage.
  for(let i=0;i<12;i++){
    const z=-18-i*1.8,w=1.5+i*.28;
    entities.push(box('wake-'+i,-w,-.36,z,.20,.03,.48,'foam',false));
    entities.push(box('wake-r-'+i,w,-.36,z,.20,.03,.48,'foam',false));
  }
  entities.push(
    {id:'ambient',transform:{position:{x:0,y:0,z:0}},
      light:{type:'ambient',color:{r:.32,g:.50,b:.79},intensity:2.6}},
    {id:'sun',transform:{position:{x:16,y:30,z:2},rotationDeg:{x:-42,y:20,z:0}},
      light:{type:'directional',color:{r:1,g:.81,b:.56},intensity:5.5,castsShadow:true}},
    {id:'port-rim',transform:{position:{x:-14,y:12,z:-4}},
      light:{type:'point',color:{r:.28,g:.60,b:1},intensity:185,range:40}},
    {id:'sun-glow',transform:{position:{x:8,y:8,z:14}},
      light:{type:'point',color:{r:1,g:.58,b:.27},intensity:130,range:28}}
  );
  const world:WorldDefinition={
    schema:'evercraft.world-engine.world.v1',id:'world:synthetic-battleship-trial',
    version:1,tickRateHz:120,gravity:{x:0,y:0,z:0},
    visualScene:{
      schema:'evercraft.world-engine.visual-scene.v1',initialCameraEntityId:'cinema-camera',
      clearColor:{r:.020,g:.049,b:.10},
      atmosphere:{color:{r:.18,g:.29,b:.42},density:.012,startDistance:22,heightFalloff:.018,referenceHeight:0},
      colorManagement:{toneMapper:'aces_filmic',exposureBiasStops:.12},
      cinematicLighting:{shading:'ggx_microfacet',localLightFalloff:'inverse_square'},
      directionalShadows:{directionalLightEntityId:'sun',
        focus:{x:0,y:3,z:0},halfExtent:45,resolution:512,depthBias:.0025,softnessTexels:1},
      materials:[
        material('hull',[.29,.36,.47],.7,.45),
        material('deck',[.31,.37,.45],.25,.67),
        material('steel',[.45,.52,.60],.65,.4),
        material('turret',[.49,.56,.63],.67,.35),
        material('barrel',[.20,.23,.29],.81,.3),
        material('window',[.035,.085,.13],.22,.24),
        material('dark',[.14,.16,.20],.4,.65),
        material('antenna',[.34,.40,.45],.64,.45),
        material('accent',[.58,.63,.66],.5,.37),
        material('water',[.045,.15,.23],.37,.22),
        material('foam',[.65,.79,.82],.02,.95)
      ]
    },
    entities
  };
  validateWorldDefinition(world);
  return world;
}
export function battleshipTake():CinematicCameraTake{
  return {
    schema:'evercraft.world-engine.cinematic-camera-take.v1',
    id:'battleship-sea-trial-hero',
    cameraEntityId:'cinema-camera',targetEntityId:'ship-hull',
    durationSec:4,fps:24,move:'orbit',ease:'smootherstep',
    orbit:{radius:51,startAngleDeg:-63,endAngleDeg:-20,startHeight:10,endHeight:6.8},
    lookAtOffset:{x:0,y:4,z:0},
    startFovYDeg:50,endFovYDeg:44
  };
}
