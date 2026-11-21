// Evercraft Visual Engine v3: an OPTIONAL atmospheric art-direction preset.
// Original procedural assets. Uses the same owned World Engine and WGSL renderer.
import {buildCinematicFlyoverScene} from './cinematic-flyover.mjs';

const V=(x,y,z)=>({x,y,z});
const color=(r,g,b,a=1)=>({r,g,b,a});
const TAU=Math.PI*2;

function surface(id,width,depth,nx,nz,fn){
  const positions=[],normals=[],uvs=[],indices=[];
  const normalAt=(x,z)=>{
    const e=.04,dx=(fn(x+e,z)-fn(x-e,z))/(e*2),dz=(fn(x,z+e)-fn(x,z-e))/(e*2);
    const l=Math.hypot(dx,1,dz);
    return [-dx/l,1/l,-dz/l];
  };
  for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
    const x=(i/nx-.5)*width,z=(j/nz-.5)*depth,y=fn(x,z);
    if(!Number.isFinite(y))throw new Error('atmospheric_surface_nonfinite:'+id);
    positions.push(x,y,z);normals.push(...normalAt(x,z));uvs.push(i/nx,j/nz);
  }
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
    const a=j*(nx+1)+i,b=a+nx+1;indices.push(a,b,a+1,a+1,b,b+1);
  }
  return {schema:'evercraft.world-engine.geometry.v1',id,primitive:'triangles',positions,normals,uvs,indices};
}
function cloudBank(id,ox,oy,oz,seed){
  const positions=[],normals=[],uvs=[],indices=[];
  const lobes=16,lat=8,lon=12;
  for(let k=0;k<lobes;k++){
    const t=k*2.399963229728653+seed*.7;
    const r=Math.sqrt(k/lobes);
    const center=[ox+Math.cos(t)*r*11,oy+Math.sin(k*1.7+seed)*1.3,oz+Math.sin(t)*r*5.6];
    const rx=4.6+(k%4)*.74,ry=1.3+(k%3)*.47,rz=3.1+(k%5)*.27;
    const start=positions.length/3;
    for(let j=0;j<=lat;j++){
      const theta=Math.PI*(.001+.998*j/lat);
      for(let i=0;i<=lon;i++){
        const phi=TAU*i/lon,sx=Math.sin(theta)*Math.cos(phi),
          sy=Math.cos(theta),sz=Math.sin(theta)*Math.sin(phi);
        positions.push(center[0]+rx*sx,center[1]+ry*sy,center[2]+rz*sz);
        const a=sx/rx,b=sy/ry,c=sz/rz,l=Math.hypot(a,b,c);
        normals.push(a/l,b/l,c/l);uvs.push(i/lon,j/lat);
      }
    }
    for(let j=0;j<lat;j++)for(let i=0;i<lon;i++){
      const a=start+j*(lon+1)+i,b=a+lon+1;
      indices.push(a,b,a+1,a+1,b,b+1);
    }
  }
  return {schema:'evercraft.world-engine.geometry.v1',id,primitive:'triangles',positions,normals,uvs,indices};
}
function sphere(id,radius){
  const positions=[],normals=[],uvs=[],indices=[],lat=9,lon=14;
  for(let j=0;j<=lat;j++){
    const theta=Math.PI*(.001+.998*j/lat);
    for(let i=0;i<=lon;i++){
      const phi=TAU*i/lon,x=Math.sin(theta)*Math.cos(phi),
        y=Math.cos(theta),z=Math.sin(theta)*Math.sin(phi);
      positions.push(radius*x,radius*y,radius*z);
      normals.push(x,y,z);uvs.push(i/lon,j/lat);
    }
  }
  for(let j=0;j<lat;j++)for(let i=0;i<lon;i++){
    const a=j*(lon+1)+i,b=a+lon+1;indices.push(a,b,a+1,a+1,b,b+1);
  }
  return {schema:'evercraft.world-engine.geometry.v1',id,primitive:'triangles',positions,normals,uvs,indices};
}
function trim(id,triangles){
  const positions=[],normals=[],uvs=[];
  for(const [a,b,c] of triangles){
    const U=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],
      W=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
    let n=[U[1]*W[2]-U[2]*W[1],U[2]*W[0]-U[0]*W[2],U[0]*W[1]-U[1]*W[0]];
    const length=Math.hypot(...n);
    if(length<1e-8)throw new Error('atmospheric_trim_degenerate:'+id);
    n=n.map(x=>x/length);
    for(const p of [a,b,c]){positions.push(...p);normals.push(...n);uvs.push(p[0]*.1,p[2]*.1);}
  }
  return {schema:'evercraft.world-engine.geometry.v1',id,primitive:'triangles',positions,normals,uvs};
}
const WAVE=(x,z)=>.17*Math.sin(.16*x+.2*z)+.12*Math.sin(.37*x-.21*z)+
  .07*Math.sin(.68*x+.41*z)+.06*Math.sin(.13*x-.52*z);
const ASSETS=[
  surface('atmospheric:open-water',350,350,92,92,WAVE),
  cloudBank('atmospheric:cloudbank-near',-47,22,-107,2),
  cloudBank('atmospheric:cloudbank-distant',55,26,-160,7),
  cloudBank('atmospheric:cloudbank-high',15,29,-197,13),
  sphere('atmospheric:wingtip-beacon',.085),
  trim('atmospheric:left-wing-panel',[
    [[-1.1,.13,-.82],[-4.65,.13,.26],[-4.1,.13,.30]],
    [[-1.1,.13,-.82],[-4.1,.13,.30],[-1.05,.13,-.48]]
  ]),
  trim('atmospheric:right-wing-panel',[
    [[1.1,.13,-.82],[4.1,.13,.30],[4.65,.13,.26]],
    [[1.1,.13,-.82],[1.05,.13,-.48],[4.1,.13,.30]]
  ])
];
function setMaterial(world,id,patch){
  const target=world.visualScene.materials.find(x=>x.id===id);
  if(!target)throw new Error('atmospheric_material_missing:'+id);
  Object.assign(target,patch);
}
function hide(world,id){
  const entity=world.entities.find(x=>x.id===id);
  if(!entity)throw new Error('atmospheric_entity_missing:'+id);
  entity.renderable.visible=false;
}
function add(world,id,ref,material,transform){
  world.entities.push({
    id,transform,renderable:{geometryRef:ref,materialId:material,layerMask:1}
  });
}
export function buildAtmosphericFlyoverScene(timeSec=0){
  if(!Number.isFinite(timeSec)||timeSec<0||timeSec>60) throw new Error('atmospheric_time_invalid');
  const base=buildCinematicFlyoverScene(timeSec),world=base.world;
  base.schema='evercraft.visual-engine.atmospheric-flyover.v3';
  base.provenance.artDirection='atmospheric-flyover-v3';
  world.id='evercraft-atmospheric-flyover-v3';
  world.version=3;
  hide(world,'flyover:water');
  hide(world,'cinematic:cloud-left');
  hide(world,'cinematic:cloud-right');
  add(world,'atmospheric:ocean','atmospheric:open-water','deep-ocean',{
    position:V(0,0,-35)
  });
  for(const name of ['near','distant','high']){
    add(world,'atmospheric:cloud-'+name,'atmospheric:cloudbank-'+name,'sculpted-cloud',{
      position:V(0,0,0)
    });
  }
  const body=world.entities.find(e=>e.id==='flyover:fuselage');
  const p=body.transform.position;
  const rotation=structuredClone(body.transform.rotationDeg);
  for(const [name,mat,x,z] of [['port','port-light',-5.4,.48],['starboard','starboard-light',5.4,.48]]){
    add(world,'atmospheric:'+name,'atmospheric:wingtip-beacon',mat,{
      position:V(p.x+x,p.y+.12,p.z+z),rotationDeg:rotation
    });
  }
  for(const [name,mat] of [['left','panel-lines'],['right','panel-lines']]){
    add(world,'atmospheric:'+name+'-panel','atmospheric:'+name+'-wing-panel',mat,{
      position:V(p.x,p.y,p.z),rotationDeg:rotation
    });
  }
  world.visualScene.materials.push(
    {id:'deep-ocean',model:'pbr',baseColor:color(.025,.17,.24),
      metallic:.18,roughness:.19,doubleSided:true},
    {id:'sculpted-cloud',model:'pbr',baseColor:color(.71,.77,.82),
      metallic:0,roughness:.96,doubleSided:true},
    {id:'port-light',model:'unlit',baseColor:color(.84,.2,.14),
      emissive:color(.75,.08,.04),emissiveIntensity:1.3},
    {id:'starboard-light',model:'unlit',baseColor:color(.22,.79,.61),
      emissive:color(.08,.55,.35),emissiveIntensity:1.1},
    {id:'panel-lines',model:'pbr',baseColor:color(.28,.35,.4),
      metallic:.34,roughness:.55,doubleSided:true}
  );
  setMaterial(world,'island',{baseColor:color(.22,.31,.25),roughness:.89});
  setMaterial(world,'rock',{baseColor:color(.22,.26,.28)});
  setMaterial(world,'airframe',{baseColor:color(.59,.65,.7),roughness:.37});
  setMaterial(world,'trim',{baseColor:color(.18,.23,.29)});
  world.visualScene.clearColor={r:.25,g:.36,b:.50};
  const sun=world.entities.find(e=>e.id==='flyover:sun');
  sun.light.color={r:1,g:.92,b:.78};
  sun.light.intensity=1.65;
  const sky=world.entities.find(e=>e.id==='flyover:skyfill');
  sky.light.intensity=.56;
  base.geometries.push(...ASSETS.map(x=>structuredClone(x)));
  return base;
}
