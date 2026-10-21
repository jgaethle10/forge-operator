/**
 * Battle vessel silhouette kit, owned procedural meshes and 3D World Engine entities.
 * Armament arrangements reflect cited published layouts. Other shapes, positions,
 * headings, dimensions and battle action are intentionally illustrative.
 * NO capture, original engineering drawings, or historical reconstruction claim.
 */
import {battleshipWorld,battleshipGeometry} from './battleship-scene.js';
import {validateWorldDefinition,type WorldDefinition,type WorldEntity} from './engine.js';
import {validateGeometryAsset,type GeometryAsset} from './webgpu.js';
import type {CinematicCameraTake} from './cinematic-rig.js';
import {parametricAssetGeometry} from './parametric-asset-kit.js';

type Vec={x:number;y:number;z:number};
type Turret={name:string;z:number;guns:2|4;raised:boolean;astern:boolean};
type Profile='long-battlecruiser'|'compact-battleship'|'tower-battleship'|'slender-heavy-cruiser';
type Vessel={
 id:string;label:string;side:'royal-navy'|'kriegsmarine';
 origin:Vec;heading:number;scale:number;length:number;beam:number;
 profile:Profile;turrets:Turret[];hullColor:[number,number,number];
};
export const VESSELS:ReadonlyArray<Vessel>=[
 {id:'hood',label:'HMS Hood',side:'royal-navy',origin:{x:0,y:0,z:0},
  heading:0,scale:1,length:40,beam:4.0,profile:'long-battlecruiser',
  hullColor:[.19,.24,.30],turrets:[
   {name:'A',z:14,guns:2,raised:false,astern:false},
   {name:'B',z:9.8,guns:2,raised:true,astern:false},
   {name:'X',z:-10.4,guns:2,raised:true,astern:true},
   {name:'Y',z:-15,guns:2,raised:false,astern:true}]},
 {id:'prince-of-wales',label:'HMS Prince of Wales',side:'royal-navy',
  origin:{x:-25,y:0,z:-16},heading:8,scale:.90,length:36,beam:4.3,
  profile:'tower-battleship',hullColor:[.20,.27,.31],turrets:[
   {name:'A',z:12,guns:4,raised:false,astern:false},
   {name:'B',z:8,guns:2,raised:true,astern:false},
   {name:'Y',z:-12,guns:4,raised:false,astern:true}]},
 {id:'bismarck',label:'Bismarck',side:'kriegsmarine',
  origin:{x:29,y:0,z:12},heading:172,scale:1,length:39,beam:4.5,
  profile:'compact-battleship',hullColor:[.26,.28,.31],turrets:[
   {name:'Anton',z:13.1,guns:2,raised:false,astern:false},
   {name:'Bruno',z:8.9,guns:2,raised:true,astern:false},
   {name:'Caesar',z:-9.9,guns:2,raised:true,astern:true},
   {name:'Dora',z:-14,guns:2,raised:false,astern:true}]},
 {id:'prinz-eugen',label:'Prinz Eugen',side:'kriegsmarine',
  origin:{x:47,y:0,z:32},heading:170,scale:.78,length:38,beam:3.35,
  profile:'slender-heavy-cruiser',hullColor:[.28,.33,.36],turrets:[
   {name:'A',z:12.8,guns:2,raised:false,astern:false},
   {name:'B',z:8.5,guns:2,raised:true,astern:false},
   {name:'C',z:-9.5,guns:2,raised:true,astern:true},
   {name:'D',z:-13.5,guns:2,raised:false,astern:true}]}
] as const;

type Pt=[number,number,number];
const p=(x:number,y:number,z:number):Pt=>[x,y,z];
function normal(a:Pt,b:Pt,c:Pt):Pt{
 const u=p(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
 const v=p(c[0]-a[0],c[1]-a[1],c[2]-a[2]);
 const n=p(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]);
 const length=Math.max(1e-8,Math.hypot(...n));
 return p(n[0]/length,n[1]/length,n[2]/length);
}
function vesselHull(v:Vessel):GeometryAsset{
 const positions:number[]=[],normals:number[]=[],uvs:number[]=[];
 const tri=(a:Pt,b:Pt,c:Pt)=>{
  const n=normal(a,b,c);
  for(const [i,x] of [a,b,c].entries()){
   positions.push(...x);normals.push(...n);uvs.push(i===0?0:i===1?1:0,i===2?1:0);
  }
 };
 const quad=(a:Pt,b:Pt,c:Pt,d:Pt)=>{tri(a,b,c);tri(a,c,d);};
 const a=v.length/2,w=v.beam;
 const stations=[
  [-1.00,.28],[-.91,.62],[-.72,.86],[-.44,1],[0,1],
  [.46,.98],[.73,.84],[.90,.51],[1,.025]
 ] as const;
 const upper=(f:number,t:number)=>p(t*w,1.95,f*a);
 const lower=(f:number,t:number)=>p(t*w*.78,-1.35,f*a);
 for(let i=0;i<stations.length-1;i++){
  const [z0,k0]=stations[i], [z1,k1]=stations[i+1];
  quad(upper(z0,-k0),lower(z0,-k0),lower(z1,-k1),upper(z1,-k1));
  quad(upper(z0,k0),upper(z1,k1),lower(z1,k1),lower(z0,k0));
  quad(upper(z0,-k0),upper(z1,-k1),upper(z1,k1),upper(z0,k0));
  quad(lower(z0,-k0),lower(z0,k0),lower(z1,k1),lower(z1,-k1));
 }
 const [zStart,kStart]=stations[0],[zEnd,kEnd]=stations.at(-1)!;
 quad(upper(zStart,-kStart),upper(zStart,kStart),lower(zStart,kStart),lower(zStart,-kStart));
 quad(upper(zEnd,kEnd),upper(zEnd,-kEnd),lower(zEnd,-kEnd),lower(zEnd,kEnd));
 const geom:GeometryAsset={schema:'evercraft.world-engine.geometry.v1',
  id:'owned:battle-vessel-'+v.id+'-hull',primitive:'triangles',positions,normals,uvs};
 validateGeometryAsset(geom);return geom;
}
export function battleVesselGeometry():GeometryAsset[]{
 return [...battleshipGeometry(),...VESSELS.map(v=>vesselHull(v)),...parametricAssetGeometry()];
}
function place(v:Vessel,local:Vec):Vec{
 const a=v.heading*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 const x=local.x*v.scale,z=local.z*v.scale;
 return {x:v.origin.x+c*x+s*z,y:v.origin.y+local.y*v.scale,z:v.origin.z-s*x+c*z};
}
function entity(v:Vessel,id:string,at:Vec,
 geometryRef:string,materialId:string,scale:Vec={x:1,y:1,z:1},
 yaw=0,cast=true):WorldEntity{
 return {
  id:v.id+'-'+id,name:v.label+' / '+id,
  transform:{position:place(v,at),
   scale:{x:scale.x*v.scale,y:scale.y*v.scale,z:scale.z*v.scale},
   rotationDeg:{x:0,y:yaw+v.heading,z:0}},
  renderable:{geometryRef,materialId,castsShadow:cast,receivesShadow:true},
  tags:['original_procedural_geometry','visual_reconstruction_unverified',v.side,v.id]
 };
}
function box(v:Vessel,id:string,at:Vec,s:Vec,material:string,cast=true):WorldEntity{
 return entity(v,id,at,'owned:ship-box',material,s,0,cast);
}
export function historicSilhouetteWorld():WorldDefinition{
 const world=structuredClone(battleshipWorld());
 world.id='world:denmark-strait-ship-class-silhouette-study';
 world.entities=world.entities.filter(e=>!e.renderable||e.id==='ocean');
 if(!world.visualScene)throw Error('battle_silhouette_requires_native_lighting');
 world.metadata={
  sourceState:'original_four_class_3d_procedural_silhouettes',
  historicalEvent:'Battle of the Denmark Strait',eventDate:'1941-05-24',
  geometryScope:'main battery counts and turret arrangements researched; class-specific parametric shapes illustrative, not measured',
  parametricDetailKit:'four reusable original 3D primitive families; no third-party models',
  approximateReconstruction:true,
  historicallyAuthenticatedDimensions:false,
  historicallyAuthenticatedPositions:false,
  simulatedBallisticHits:false,
  actorMotionImplemented:false,
  commercialPublicationAuthorized:false,
  armamentSources:[
   'https://www.hmshood.org.uk/ship/maingun.htm',
   'https://www.uboatarchive.net/Int/BismarckINT.htm',
   'https://www.kbismarck.com/peugen.html'
  ]
 };
 const base=world.visualScene.materials.find(m=>m.id==='hull');
 if(!base)throw Error('battle_silhouette_hull_material_missing');
 for(const v of VESSELS){
  world.visualScene.materials.push({
   ...structuredClone(base),id:'battle-'+v.id+'-hull',
   baseColor:{r:v.hullColor[0],g:v.hullColor[1],b:v.hullColor[2],a:1},
   roughness:.61,metallic:.37
  });
  world.entities.push(entity(v,'ship-hull',{x:0,y:0,z:0},
   'owned:battle-vessel-'+v.id+'-hull','battle-'+v.id+'-hull'));
  world.entities.push(box(v,'weather-deck',{x:0,y:2.02,z:-1.8},
   {x:v.beam*.76,y:.07,z:v.length*.32},'deck',false));
  // Physically separate bridge profiles. We deliberately use geometric blocks,
  // not invented scan data; geometry IDs and hashes remain reproducible.
  const bridgeZ=v.profile==='long-battlecruiser'?-3.3:-2.2;
  const tall=v.profile==='tower-battleship';
  const cruiser=v.profile==='slender-heavy-cruiser';
  const height=tall?8.1:cruiser?6.1:v.profile==='compact-battleship'?7.1:5.35;
  world.entities.push(box(v,'bridge-foundation',{x:0,y:3.3,z:bridgeZ},
    {x:cruiser?1.45:2,y:1,z:2.6},'steel'));
  world.entities.push(entity(v,'bridge-tower',{x:0,y:5.2,z:bridgeZ-.2},
    'owned:kit-tapered-cabin','steel',
    {x:tall?1.7:1.17,y:2.0,z:tall?1.43:1.0}));
  world.entities.push(entity(v,'bridge-top',{x:0,y:height,z:bridgeZ},
    'owned:kit-observation-deck','deck',
    {x:tall?2.0:1.65,y:.32,z:tall?1.38:1.15}));
  // Real separately lit 3D bridge wings and dark recessed window bands.
  for(const side of [-1,1]){
   world.entities.push(box(v,'bridge-wing-'+side,
    {x:side*(tall?1.95:1.55),y:6.28,z:bridgeZ-.35},
    {x:.66,y:.10,z:.74},'deck',false));
   for(let i=0;i<3;i++){
    world.entities.push(box(v,'bridge-window-'+side+'-'+i,
     {x:side*(tall?1.7:1.17),y:5.30+i*.43,z:bridgeZ+1.05},
     {x:.055,y:.105,z:.27},'window',false));
   }
  }
  for(const side of [-1,1]){
    // Hull belt shear line, deliberately approximate physical placement.
    world.entities.push(box(v,'hull-sheer-'+side,
      {x:side*(v.beam*.87),y:1.37,z:-1.65},
      {x:.04,y:.045,z:v.length*.26},'accent',false));
  }
  for(const z of (v.profile==='long-battlecruiser'?[-7,-11]:
     v.profile==='compact-battleship'?[-6.5]:
     cruiser?[-7.5,-10.5]:[-8.6,-11.6])){
   world.entities.push(entity(v,'funnel-'+z,{x:0,y:5.3,z},
    'owned:kit-ship-funnel','steel',
    {x:cruiser?.68:.95,y:2.5,z:cruiser?.65:.95}));
   world.entities.push(entity(v,'funnel-cap-'+z,{x:0,y:7.83,z},
    'owned:kit-observation-deck','dark',
    {x:cruiser?.69:1.01,y:.13,z:cruiser?.67:.99}));
  }
  const mastZ=v.profile==='long-battlecruiser'?-2.0:-5.0;
  const mastH=v.profile==='tower-battleship'?12:cruiser?10:11;
  world.entities.push(box(v,'mast',{x:0,y:mastH*.59,z:mastZ},
   {x:.11,y:mastH*.47,z:.11},'antenna'));
  world.entities.push(box(v,'radar-crossbar',{x:0,y:mastH-.4,z:mastZ},
   {x:2.35,y:.08,z:.09},'antenna',false));
  world.entities.push(entity(v,'radar-array',{x:0,y:mastH-.64,z:mastZ+.23},
    'owned:kit-open-radar-array','antenna',
    {x:2.2,y:.85,z:1},0,false));
  // Aft machine-room housings and exhaust uptake structures are genuine
  // world objects, not decals. Their dimensions are deliberately illustrative.
  world.entities.push(entity(v,'aft-deckhouse',{x:0,y:3.10,z:-v.length*.27},
    'owned:kit-tapered-cabin','steel',{x:1.24,y:.77,z:1.40}));
  world.entities.push(entity(v,'aft-watch',{x:0,y:4.03,z:-v.length*.27},
    'owned:kit-observation-deck','deck',{x:1.10,y:.19,z:1.0},0,false));
  if(v.profile==='long-battlecruiser'){
   for(const x of [-1.8,1.8])
    world.entities.push(box(v,'tripod-leg-'+x,{x,y:5.7,z:-3.6},
     {x:.10,y:3.35,z:.10},'antenna'));
  }
  for(const t of v.turrets){
   const yy=t.raised?3.56:2.87;
   const turretWidth=t.guns===4?1.55:1.05;
   world.entities.push(entity(v,'turret-'+t.name,{x:0,y:yy,z:t.z},
    'owned:armored-turret','turret',{x:turretWidth,y:.79,z:.88},t.astern?180:0));
   const xs=t.guns===4?[-.89,-.29,.29,.89]:[-.48,.48];
   xs.forEach((x,i)=>{
    world.entities.push(entity(v,'barrel-'+t.name+'-'+i,
      {x,y:yy+.1,z:t.z+(t.astern?-.85:.85)},
      'owned:naval-cannon','barrel',
      {x:t.guns===4?.8:1,y:t.guns===4?.8:1,z:cruiser?.75:1},
      t.astern?180:0));
   });
  }
  const deckSpan=cruiser?13.5:15;
  for(const side of [-1,1]){
   world.entities.push(box(v,'deck-edge-'+side,
    {x:side*(v.beam*.76),y:2.40,z:-1},{x:.07,y:.07,z:deckSpan},'accent',false));
   for(const z of [-12,-8,-4,0,4,8,12]){
    world.entities.push(box(v,'rail-post-'+side+'-'+z,
     {x:side*v.beam*.76,y:2.26,z},{x:.05,y:.24,z:.05},'accent',false));
   }
  }
 }
 // Expand the existing owned wave mesh across the horizon; no stock skybox.
 const ocean=world.entities.find(e=>e.id==='ocean');
 if(!ocean)throw Error('battle_ocean_missing');
 ocean.transform.scale={x:4,y:1,z:4};
 world.visualScene.directionalShadows={
  ...world.visualScene.directionalShadows!,
  focus:{x:12,y:3,z:8},halfExtent:100,resolution:512
 };
 const cam=world.entities.find(e=>e.id==='cinema-camera');
 if(!cam?.camera)throw Error('battle_camera_missing');
 cam.camera.far=800;
 cam.camera.projection={type:'perspective',fovYDeg:47};
 cam.transform.position={x:-90,y:30,z:81};
 world.visualScene.clearColor={r:.065,g:.115,b:.175};
 world.visualScene.colorManagement={toneMapper:'aces_filmic',exposureBiasStops:-.28};
 world.visualScene.atmosphere={color:{r:.12,g:.22,b:.32},density:.007,startDistance:35,heightFalloff:.013,referenceHeight:0};
 for(const light of world.entities){
  if(light.id==='ambient'&&light.light)light.light.intensity=1.45;
  if(light.id==='sun'&&light.light)light.light.intensity=3.5;
  if(light.id==='port-rim'&&light.light)light.light.intensity=85;
  if(light.id==='sun-glow'&&light.light)light.light.intensity=72;
 }
 validateWorldDefinition(world);
 return world;
}
export function historicSilhouetteTake(profile:'formation'|'bismarck_hero'='formation'):CinematicCameraTake{
 if(profile==='bismarck_hero')return {
  schema:'evercraft.world-engine.cinematic-camera-take.v1',
  id:'denmark-strait-bismarck-closeup-procedural-not-historical',
  cameraEntityId:'cinema-camera',targetEntityId:'bismarck-ship-hull',
  durationSec:4,fps:24,move:'orbit',ease:'smootherstep',
  orbit:{radius:37,startAngleDeg:-67,endAngleDeg:-40,startHeight:12,endHeight:8},
  lookAtOffset:{x:0,y:4,z:0},startFovYDeg:45,endFovYDeg:42
 };
 if(profile!=='formation')throw Error('historic_camera_profile_unapproved');
 return {
  schema:'evercraft.world-engine.cinematic-camera-take.v1',
  id:'denmark-strait-class-silhouette-camera-not-1941-reconstructed',
  cameraEntityId:'cinema-camera',targetEntityId:'hood-ship-hull',
  durationSec:4,fps:24,move:'orbit',ease:'smootherstep',
  orbit:{radius:89,startAngleDeg:-54,endAngleDeg:-28,startHeight:26,endHeight:18},
  lookAtOffset:{x:11,y:3,z:6},startFovYDeg:48,endFovYDeg:46
 };
}
