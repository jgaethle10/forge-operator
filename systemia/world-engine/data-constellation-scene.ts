/**
 * Evercraft cinematic data constellation. Original deterministic 3D scene for the
 * existing World Engine VisualFrame -> WGSL/WebGPU -> FFmpeg pipeline.
 * Source data is entirely SYNTHETIC; links do not represent real relationships.
 */
import type {WorldDefinition} from './engine.js';
import type {GeometryAsset} from './webgpu.js';
import type {CinematicCameraTake} from './cinematic-rig.js';

type V={x:number;y:number;z:number};
const vec=(x:number,y:number,z:number):V=>({x,y,z});
const pos=(p:V)=>({position:p});
const color=(r:number,g:number,b:number)=>({r,g,b});
const seed=0x48a3f21;
function randomSequence(){
  let state=seed;
  return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
}
function cube():GeometryAsset{
  const sides=[
    [[0,0,1],[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]],
    [[0,0,-1],[[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]]],
    [[1,0,0],[[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]]],
    [[-1,0,0],[[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]]],
    [[0,1,0],[[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]]],
    [[0,-1,0],[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]]
  ] as [number[],number[][]][];
  const positions:number[]=[],normals:number[]=[],uvs:number[]=[];
  for(const [normal,verts] of sides)for(const i of [0,1,2,0,2,3]){
    positions.push(...verts[i]);normals.push(...normal);uvs.push(...[[0,0],[1,0],[1,1],[0,1]][i]);
  }
  return {schema:'evercraft.world-engine.geometry.v1',id:'data-constellation:cube',
    primitive:'triangles',positions,normals,uvs};
}
function sphere():GeometryAsset{
  const positions:number[]=[],normals:number[]=[],uvs:number[]=[],indices:number[]=[];
  const bands=10,sides=16;
  for(let row=0;row<=bands;row++){
    const polar=Math.PI*row/bands;
    for(let col=0;col<=sides;col++){
      const angle=2*Math.PI*col/sides;
      const x=Math.sin(polar)*Math.cos(angle),y=Math.cos(polar),z=Math.sin(polar)*Math.sin(angle);
      positions.push(x,y,z);normals.push(x,y,z);uvs.push(col/sides,row/bands);
    }
  }
  for(let row=0;row<bands;row++)for(let col=0;col<sides;col++){
    const a=row*(sides+1)+col,b=a+sides+1;
    indices.push(a,b,a+1,a+1,b,b+1);
  }
  return {schema:'evercraft.world-engine.geometry.v1',id:'data-constellation:sphere',
    primitive:'triangles',positions,normals,uvs,indices};
}
const material=(id:string,shade:[number,number,number],metallic:number,roughness:number,
  emission?:[number,number,number],intensity=0)=>({
  id,model:'pbr' as const,baseColor:{r:shade[0],g:shade[1],b:shade[2],a:1},
  metallic,roughness,...(emission?{emissive:color(...emission),emissiveIntensity:intensity}:{})
});
function edgeTransform(a:V,b:V){
  const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;
  const length=Math.hypot(dx,dy,dz);
  if(length<.00001)throw Error('data_constellation_zero_edge');
  return {position:vec((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2),
    rotationDeg:vec(-Math.asin(dy/length)*180/Math.PI,Math.atan2(dx,dz)*180/Math.PI,0),
    scale:vec(.012,.012,length/2)};
}
export function makeDataConstellationScene(){
  const rand=randomSequence();
  const entities:WorldDefinition['entities']=[];
  const add=(e:WorldDefinition['entities'][number])=>entities.push(e);
  const materialIds=['node-cyan','node-ice','node-violet'];
  const roots=[vec(-4,1.4,-.7),vec(.15,1.8,-1.3),vec(4,1.55,-.5)];
  const locations:V[][]=[[],[],[]];
  add({id:'cinema-camera',transform:pos(vec(-7,4,17)),
    camera:{projection:{type:'perspective',fovYDeg:46},near:.1,far:130,exposure:1.0}});
  add({id:'world-floor',transform:{position:vec(0,-2.8,-2),scale:vec(8,.09,5)},
    renderable:{geometryRef:'data-constellation:cube',materialId:'basalt',receivesShadow:true}});
  add({id:'knowledge-core',transform:{position:roots[1],scale:vec(.59,.59,.59)},
    renderable:{geometryRef:'data-constellation:sphere',materialId:'core-gold',castsShadow:true,receivesShadow:true}});
  for(let cluster=0;cluster<3;cluster++){
    const root=roots[cluster];
    add({id:'cluster-'+cluster+'-relay',transform:{position:root,scale:vec(.24,.24,.24)},
      renderable:{geometryRef:'data-constellation:sphere',materialId:materialIds[cluster]}});
    for(let i=0;i<25;i++){
      const spiral=i*2.3999632297+cluster*.42;
      const radius=.56+Math.sqrt((i+1)/25)*2.35;
      const p=vec(root.x+Math.cos(spiral)*radius,
        root.y+Math.sin(spiral*1.67)*1.3+(rand()-.5)*.25,
        root.z+Math.sin(spiral)*radius*.7+(rand()-.5)*1.4);
      locations[cluster].push(p);
      const size=i%9===0?.15:.07+rand()*.048;
      add({id:'cluster-'+cluster+'-signal-'+String(i).padStart(2,'0'),
        transform:{position:p,scale:vec(size,size,size)},
        renderable:{geometryRef:'data-constellation:sphere',materialId:materialIds[cluster]}});
    }
  }
  let linkCount=0;
  const link=(a:V,b:V,theme:'link-blue'|'link-amber'='link-blue')=>{
    const tf=edgeTransform(a,b);
    add({id:'relationship-'+String(linkCount++).padStart(4,'0'),
      transform:tf,
      renderable:{geometryRef:'data-constellation:cube',materialId:theme,castsShadow:false,receivesShadow:false}});
  };
  for(let c=0;c<3;c++){
    for(let i=0;i<locations[c].length;i++){
      if(i%2===0)link(roots[c],locations[c][i]);
      if(i>0)link(locations[c][i],locations[c][i-1]);
      if(i>4&&i%5===0)link(locations[c][i],locations[c][i-5]);
    }
  }
  link(roots[0],roots[1],'link-amber');
  link(roots[1],roots[2],'link-amber');
  for(let i=0;i<6;i++){
    const x=-7+i*2.8;
    add({id:'architecture-pier-'+i,transform:{position:vec(x,-1.6,-3.9),scale:vec(.11,1.0,.18)},
      renderable:{geometryRef:'data-constellation:cube',materialId:'architecture'}});
  }
  add({id:'ambient',transform:pos(vec(0,0,0)),
    light:{type:'ambient',color:color(.48,.62,.85),intensity:.72}});
  add({id:'key-light',transform:{position:vec(-7,9,4),rotationDeg:vec(-40,0,0)},
    light:{type:'directional',color:color(.64,.78,1),intensity:3.1,castsShadow:true}});
  add({id:'azure-light',transform:pos(vec(-4,3,2)),
    light:{type:'point',color:color(.18,.67,1),intensity:54,range:11}});
  add({id:'violet-light',transform:pos(vec(4,3,2)),
    light:{type:'point',color:color(.61,.29,1),intensity:54,range:11}});
  add({id:'gold-light',transform:pos(vec(0,2,1)),
    light:{type:'point',color:color(1,.64,.23),intensity:40,range:9}});
  const world:WorldDefinition={
    schema:'evercraft.world-engine.world.v1',id:'evercraft:original-data-constellation',
    version:1,tickRateHz:120,gravity:vec(0,0,0),
    metadata:{source:'fully_synthetic_original_3d',publication_authority:false,real_relationships:false},
    visualScene:{
      schema:'evercraft.world-engine.visual-scene.v1',
      initialCameraEntityId:'cinema-camera',
      clearColor:color(.008,.015,.035),
      atmosphere:{color:color(.04,.07,.14),density:.034,startDistance:4,heightFalloff:.09,referenceHeight:0},
      cinematicLighting:{shading:'ggx_microfacet',localLightFalloff:'inverse_square'},
      colorManagement:{toneMapper:'aces_filmic',exposureBiasStops:.25},
      materials:[
        material('basalt',[.038,.06,.10],.43,.63),
        material('architecture',[.13,.19,.28],.68,.36),
        material('node-cyan',[.13,.58,.86],.38,.24,[.13,.5,.9],.26),
        material('node-ice',[.36,.88,.95],.40,.22,[.24,.75,1],.26),
        material('node-violet',[.53,.35,.87],.42,.29,[.42,.2,.88],.28),
        material('core-gold',[.89,.64,.27],.78,.22,[1,.55,.17],.65),
        material('link-blue',[.18,.30,.46],.18,.55,[.09,.46,.78],.40),
        material('link-amber',[.37,.26,.13],.28,.47,[.88,.49,.13],.60)
      ]
    },
    entities
  };
  const take:CinematicCameraTake={
    schema:'evercraft.world-engine.cinematic-camera-take.v1',id:'constellation-cinematic-take',
    cameraEntityId:'cinema-camera',targetEntityId:'knowledge-core',durationSec:4,fps:24,
    move:'orbit',ease:'smootherstep',
    orbit:{radius:16,startAngleDeg:-18,endAngleDeg:21,startHeight:3.3,endHeight:4.3},
    startFovYDeg:50,endFovYDeg:45
  };
  return {world,take,geometries:[cube(),sphere()],
    receipt:{schema:'evercraft.cinema.data-constellation-scene.v1',
      identity:'synthetic_data_visualization',nodeCount:75,linkCount,
      materialCount:world.visualScene?.materials.length,publicationAuthority:false,
      customerReady:false}};
}
