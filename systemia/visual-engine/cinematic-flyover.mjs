// Evercraft Visual Engine: selectable cinematic flyover art-direction v2.
// Original procedural geometry, no borrowed aircraft model or external assets.
// This extends the canonical v1 scene; it does not replace World Engine truth.
import {buildFlyoverScene} from './flyover.mjs';

const V=(x,y,z)=>({x,y,z});
const C=(r,g,b,a=1)=>({r,g,b,a});
const TWO_PI=Math.PI*2;
const SCHEMA='evercraft.visual-engine.cinematic-flyover.v2';

function mesh(id,triangles){
  const positions=[],normals=[],uvs=[];
  for(const tri of triangles){
    if(tri.length!==3) throw new Error('cinematic_triangle_arity_invalid:'+id);
    const [a,b,c]=tri,ab=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],
      ac=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
    let n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
    const length=Math.hypot(...n);
    if(length<1e-9) throw new Error('cinematic_degenerate_triangle:'+id);
    n=n.map(x=>x/length);
    for(const p of tri){
      positions.push(...p);normals.push(...n);uvs.push(p[0]*.12,p[2]*.12);
    }
  }
  return {schema:'evercraft.world-engine.geometry.v1',id,primitive:'triangles',positions,normals,uvs};
}
function quad(id,p,q,r,s){
  return mesh(id,[[p,q,r],[p,r,s]]);
}
function ellipsoid(id,rx,ry,rz,cx=0,cy=0,cz=0,sides=20){
  const positions=[],normals=[],uvs=[],indices=[];
  const parallels=10;
  for(let j=0;j<=parallels;j++){
    const theta=Math.PI*(.001+(.998*j/parallels));
    for(let i=0;i<=sides;i++){
      const phi=TWO_PI*i/sides;
      const sx=Math.sin(theta)*Math.cos(phi),sy=Math.cos(theta),sz=Math.sin(theta)*Math.sin(phi);
      positions.push(cx+rx*sx,cy+ry*sy,cz+rz*sz);
      const nx=sx/rx,ny=sy/ry,nz=sz/rz,len=Math.hypot(nx,ny,nz);
      normals.push(nx/len,ny/len,nz/len);uvs.push(i/sides,j/parallels);
    }
  }
  for(let j=0;j<parallels;j++) for(let i=0;i<sides;i++){
    const a=j*(sides+1)+i,b=a+sides+1;
    indices.push(a,b,a+1,a+1,b,b+1);
  }
  return {schema:'evercraft.world-engine.geometry.v1',id,primitive:'triangles',positions,normals,uvs,indices};
}
function taperedCylinder(id,startZ,endZ,startRadius,endRadius,yCenter=0){
  const positions=[],normals=[],uvs=[],indices=[],sides=24;
  for(let ring=0;ring<2;ring++){
    const z=ring===0?startZ:endZ,rad=ring===0?startRadius:endRadius;
    for(let j=0;j<=sides;j++){
      const a=j*TWO_PI/sides,c=Math.cos(a),s=Math.sin(a);
      positions.push(rad*c,yCenter+rad*s,z);
      const n=[c,s,(startRadius-endRadius)/(endZ-startZ)],length=Math.hypot(...n);
      normals.push(n[0]/length,n[1]/length,n[2]/length);
      uvs.push(j/sides,ring);
    }
  }
  for(let j=0;j<sides;j++){
    const a=j,b=a+sides+1;
    indices.push(a,a+1,b,b,a+1,b+1);
  }
  return {schema:'evercraft.world-engine.geometry.v1',id,primitive:'triangles',positions,normals,uvs,indices};
}
function propeller(){
  const tris=[];
  for(let k=0;k<4;k++){
    const angle=k*Math.PI/2;
    const rotate=([x,y,z])=>[
      x*Math.cos(angle)-y*Math.sin(angle),
      x*Math.sin(angle)+y*Math.cos(angle),z];
    const a=rotate([-.11,.22,-3.88]),b=rotate([-.22,1.52,-3.88]),
      c=rotate([.14,1.62,-3.88]),d=rotate([.12,.22,-3.88]);
    tris.push([a,b,c],[a,c,d]);
  }
  return mesh('cinematic:propeller',tris);
}
function ridgeSurface(id,width,depth,centerX,centerZ,peak,steps=32){
  const positions=[],normals=[],uvs=[],indices=[];
  const f=(x,z)=>{
    const u=(x-centerX)/(width*.5),v=(z-centerZ)/(depth*.5);
    const r=Math.max(0,1-u*u-v*v);
    return -1.2+peak*Math.pow(r,1.7)*(0.77+0.23*Math.sin(x*.28+z*.13)**2);
  };
  for(let row=0;row<=steps;row++){
    for(let col=0;col<=steps;col++){
      const x=centerX+(col/steps-.5)*width;
      const z=centerZ+(row/steps-.5)*depth;
      const y=f(x,z);
      const dx=(f(x+.05,z)-f(x-.05,z))/.1;
      const dz=(f(x,z+.05)-f(x,z-.05))/.1;
      const len=Math.hypot(dx,1,dz);
      positions.push(x,y,z);normals.push(-dx/len,1/len,-dz/len);
      uvs.push(col/steps,row/steps);
    }
  }
  for(let row=0;row<steps;row++) for(let col=0;col<steps;col++){
    const a=row*(steps+1)+col,b=a+steps+1;
    indices.push(a,b,a+1,a+1,b,b+1);
  }
  return {schema:'evercraft.world-engine.geometry.v1',id,primitive:'triangles',positions,normals,uvs,indices};
}
function lookAt(position,target){
  const dx=target.x-position.x,dy=target.y-position.y,dz=target.z-position.z,h=Math.hypot(dx,dz);
  return V(Math.atan2(dy,h)*180/Math.PI,Math.atan2(-dx,-dz)*180/Math.PI,0);
}

const ART_ASSETS=[
  // Aircraft-specific details. All aircraft parts share one sampled transform.
  ellipsoid('cinematic:canopy-shell',.42,.34,.85,0,.57,-1.05),
  taperedCylinder('cinematic:engine-cowl',-3.3,-2.7,.32,.45),
  taperedCylinder('cinematic:spinner',-4.02,-3.57,.055,.31),
  propeller(),
  // Profile of the upright tail, extruded only 4 cm in x.
  mesh('cinematic:vertical-tail',[
    [[-.035,.14,2],[0,1.38,2.65],[.035,.14,2]],
    [[-.035,.14,2],[.035,.14,2],[0,1.38,2.65]],
    [[-.035,.14,2.65],[0,1.38,2.65],[.035,.14,2.65]]
  ]),
  quad('cinematic:left-wing-flash',[-4.5,.09,.35],[-3.8,.09,.1],[-3.65,.09,.62],[-4.3,.09,.78]),
  quad('cinematic:right-wing-flash',[3.8,.09,.1],[4.5,.09,.35],[4.3,.09,.78],[3.65,.09,.62]),
  quad('cinematic:left-aileron',[-5.35,.10,.94],[-4.6,.10,.8],[-4.4,.10,1.02],[-5.2,.10,1.13]),
  quad('cinematic:right-aileron',[4.6,.10,.8],[5.35,.10,.94],[5.2,.10,1.13],[4.4,.10,1.02]),
  ellipsoid('cinematic:left-exhaust',.095,.055,.35,-.48,.02,-2.3,12),
  ellipsoid('cinematic:right-exhaust',.095,.055,.35,.48,.02,-2.3,12),
  // More useful world depth and terrain parallax, all synthetic and non-geographic.
  ridgeSurface('cinematic:near-island',78,110,-53,-38,13),
  ridgeSurface('cinematic:far-island',95,150,74,-120,20),
  ellipsoid('cinematic:cloud-left',24,2.8,8,-49,22,-113,20),
  ellipsoid('cinematic:cloud-right',20,2.2,7,58,25,-148,20)
];

export function buildCinematicFlyoverScene(timeSec=0){
  if(!Number.isFinite(timeSec)||timeSec<0||timeSec>60) throw new Error('cinematic_flyover_time_invalid');
  const base=buildFlyoverScene(timeSec);
  const world=base.world;
  world.id='evercraft-cinematic-flyover-v2';
  world.version=2;
  const camera=world.entities.find(e=>e.id==='flyover:camera');
  const body=world.entities.find(e=>e.id==='flyover:fuselage');
  const position=body.transform.position;
  // A real arc around the aircraft (not a locked chase camera).
  const az=.46+timeSec*.18;
  const radial=17.8-Math.min(timeSec,4)*.35;
  const cameraPos=V(position.x+Math.sin(az)*radial,
    position.y+4.7+Math.sin(timeSec*.43)*.35,
    position.z+Math.cos(az)*radial);
  camera.transform.position=cameraPos;
  camera.transform.rotationDeg=lookAt(cameraPos,V(position.x,position.y+.25,position.z-.8));
  camera.camera.projection={type:'perspective',fovYDeg:47};
  camera.camera.exposure=.96;

  const oldCanopy=world.entities.find(e=>e.id==='flyover:canopy');
  oldCanopy.renderable.visible=false;
  for(const [id,material] of [
    ['canopy-shell','glass'],
    ['engine-cowl','airframe'],
    ['spinner','chrome'],
    ['propeller','propeller'],
    ['vertical-tail','airframe'],
    ['left-wing-flash','trim'],
    ['right-wing-flash','trim'],
    ['left-aileron','panel'],
    ['right-aileron','panel'],
    ['left-exhaust','chrome'],
    ['right-exhaust','chrome']
  ]){
    const transform=structuredClone(body.transform);
    if(id==='propeller') transform.rotationDeg.z=(timeSec*1770)%360;
    world.entities.push({
      id:'cinematic:'+id,transform,
      renderable:{geometryRef:'cinematic:'+id,materialId:material,layerMask:1}
    });
  }
  for(const [id,material] of [
    ['near-island','island'],['far-island','island'],
    ['cloud-left','cloud'],['cloud-right','cloud']
  ]){
    world.entities.push({
      id:'cinematic:'+id,transform:{position:V(0,0,0)},
      renderable:{geometryRef:'cinematic:'+id,materialId:material,layerMask:1,doubleSided:true}
    });
  }
  world.visualScene.clearColor={r:.23,g:.37,b:.56};
  const air=world.visualScene.materials.find(m=>m.id==='airframe');
  air.baseColor=C(.58,.67,.73);air.roughness=.32;
  const glass=world.visualScene.materials.find(m=>m.id==='glass');
  glass.baseColor=C(.1,.24,.34);glass.roughness=.15;
  world.visualScene.materials.push(
    {id:'chrome',model:'pbr',baseColor:C(.75,.78,.79),metallic:.85,roughness:.22},
    {id:'propeller',model:'pbr',baseColor:C(.07,.09,.12),metallic:.42,roughness:.42,doubleSided:true},
    {id:'trim',model:'pbr',baseColor:C(.12,.23,.31),metallic:.22,roughness:.49,doubleSided:true},
    {id:'panel',model:'pbr',baseColor:C(.35,.44,.52),metallic:.45,roughness:.4,doubleSided:true},
    {id:'island',model:'pbr',baseColor:C(.29,.39,.26),metallic:0,roughness:.87,doubleSided:true},
    {id:'cloud',model:'unlit',baseColor:C(.74,.81,.85),doubleSided:true}
  );
  world.visualScene.materials.find(m=>m.id==='ocean').baseColor=C(.025,.22,.32);
  return {
    ...base,
    schema:SCHEMA,
    provenance:{...base.provenance,artDirection:'cinematic-flyover-v2',
      realWorldEvidence:false},
    world,
    geometries:[...base.geometries,...ART_ASSETS.map(a=>structuredClone(a))]
  };
}
