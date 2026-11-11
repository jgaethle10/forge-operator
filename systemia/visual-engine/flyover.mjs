// Evercraft Visual Engine: original procedural aircraft flyover fixture.
// Uses the existing canonical World Engine/WebGPU geometry + world definitions.
// This is a renderable engineering baseline, not a photorealistic quality claim.

const SCHEMA='evercraft.visual-engine.flyover.v1';
const V=(x,y,z)=>({x,y,z});
const COLOR=(r,g,b,a=1)=>({r,g,b,a});
const TWO_PI=Math.PI*2;

function mustTime(timeSec){
  if(!Number.isFinite(timeSec)||timeSec<0||timeSec>60) throw new Error('flyover_time_invalid');
  return timeSec;
}
function flatMesh(id,triangles){
  const positions=[],normals=[],uvs=[];
  for(const points of triangles){
    const [a,b,c]=points;
    const ab=V(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
    const ac=V(c[0]-a[0],c[1]-a[1],c[2]-a[2]);
    let n=V(ab.y*ac.z-ab.z*ac.y,ab.z*ac.x-ab.x*ac.z,ab.x*ac.y-ab.y*ac.x);
    const magnitude=Math.hypot(n.x,n.y,n.z);
    if(magnitude<1e-8) throw new Error('flyover_degenerate_triangle:'+id);
    n=V(n.x/magnitude,n.y/magnitude,n.z/magnitude);
    for(const p of points){
      positions.push(p[0],p[1],p[2]); normals.push(n.x,n.y,n.z);
      uvs.push(p[0]*.05,p[2]*.05);
    }
  }
  return {schema:'evercraft.world-engine.geometry.v1',id,primitive:'triangles',positions,normals,uvs};
}
function prism(id,outline,low,high){
  const tris=[];
  // Polygon must be convex, with no three collinear consecutive vertices.
  for(let i=1;i<outline.length-1;i++){
    const a=outline[0],b=outline[i],c=outline[i+1];
    tris.push([[a[0],high,a[1]],[b[0],high,b[1]],[c[0],high,c[1]]]);
    tris.push([[c[0],low,c[1]],[b[0],low,b[1]],[a[0],low,a[1]]]);
  }
  for(let i=0;i<outline.length;i++){
    const a=outline[i],b=outline[(i+1)%outline.length];
    const p=[a[0],low,a[1]],q=[b[0],low,b[1]];
    const r=[b[0],high,b[1]],s=[a[0],high,a[1]];
    tris.push([p,q,r],[p,r,s]);
  }
  return flatMesh(id,tris);
}
function fuselage(){
  const positions=[],normals=[],uvs=[],indices=[];
  const rings=[[-3.6,.08],[-3.1,.27],[-2.4,.46],[-1.4,.5],[0,.54],[1.3,.45],[2.4,.3],[3,.12]];
  const sides=16;
  for(let i=0;i<rings.length;i++){
    const [z,r]=rings[i];
    for(let j=0;j<=sides;j++){
      const a=j*TWO_PI/sides;
      const c=Math.cos(a),s=Math.sin(a);
      positions.push(r*c,r*s,z); normals.push(c,s,0); uvs.push(j/sides,i/(rings.length-1));
    }
  }
  for(let i=0;i<rings.length-1;i++){
    for(let j=0;j<sides;j++){
      const a=i*(sides+1)+j,b=a+sides+1;
      indices.push(a,a+1,b,b,a+1,b+1);
    }
  }
  return {schema:'evercraft.world-engine.geometry.v1',id:'flyover:fuselage',primitive:'triangles',positions,normals,uvs,indices};
}
function surface(id,width,depth,stepsX,stepsZ,heightFn){
  const positions=[],normals=[],uvs=[],indices=[];
  const derivative=.025;
  for(let z=0;z<=stepsZ;z++){
    for(let x=0;x<=stepsX;x++){
      const px=(x/stepsX-.5)*width,pz=(z/stepsZ-.5)*depth;
      const py=heightFn(px,pz);
      if(!Number.isFinite(py)) throw new Error('flyover_surface_height_invalid');
      positions.push(px,py,pz);
      const dx=(heightFn(px+derivative,pz)-heightFn(px-derivative,pz))/(2*derivative);
      const dz=(heightFn(px,pz+derivative)-heightFn(px,pz-derivative))/(2*derivative);
      const l=Math.hypot(-dx,1,-dz);
      normals.push(-dx/l,1/l,-dz/l);
      uvs.push(x/stepsX,z/stepsZ);
    }
  }
  for(let z=0;z<stepsZ;z++) for(let x=0;x<stepsX;x++){
    const a=z*(stepsX+1)+x,b=a+stepsX+1;
    indices.push(a,b,a+1,a+1,b,b+1);
  }
  return {schema:'evercraft.world-engine.geometry.v1',id,primitive:'triangles',positions,normals,uvs,indices};
}
function lookAtRotation(position,target){
  const dx=target.x-position.x,dy=target.y-position.y,dz=target.z-position.z;
  const h=Math.hypot(dx,dz);
  return V(Math.atan2(dy,h)*180/Math.PI,Math.atan2(-dx,-dz)*180/Math.PI,0);
}
const ASSETS=[
  fuselage(),
  prism('flyover:wing-left',[[-.35,-1.25],[-6,.2],[-5.4,1.15],[-.38,.7]],-.075,.075),
  prism('flyover:wing-right',[[.35,-1.25],[.38,.7],[5.4,1.15],[6,.2]],-.075,.075),
  prism('flyover:tail-left',[[-.18,1.65],[-2.4,2.3],[-2.1,2.85],[-.18,2.5]],-.05,.05),
  prism('flyover:tail-right',[[.18,1.65],[.18,2.5],[2.1,2.85],[2.4,2.3]],-.05,.05),
  prism('flyover:canopy',[[-.34,-1.8],[.34,-1.8],[.26,-.55],[-.26,-.55]],.38,.76),
  surface('flyover:sea',300,300,28,28,(x,z)=>.08*Math.sin(x*.28+z*.09)+.06*Math.sin(z*.19-x*.12)),
  surface('flyover:coast',58,145,18,25,(x,z)=>{
    const ridge=2.1+5.2*Math.pow(Math.abs(Math.sin(z*.028+x*.11)),2);
    return .6+ridge*Math.pow(Math.max(0,1-Math.abs(x)/32),1.4);
  })
];
const deepFreezeAssetList=()=>ASSETS.map(a=>structuredClone(a));

export function buildFlyoverScene(timeSec=0){
  mustTime(timeSec);
  const planeZ=-12-timeSec*5.5;
  const planeY=15+Math.sin(timeSec*.8)*.45;
  const position=V(Math.sin(timeSec*.32)*1.8,planeY,planeZ);
  const cameraPos=V(position.x+9,planeY+4.4,planeZ+21);
  const cameraAim=V(position.x,planeY,planeZ-.8);
  const planeParts=[
    ['fuselage','airframe',V(0,0,0)],
    ['wing-left','airframe',V(0,0,0)],
    ['wing-right','airframe',V(0,0,0)],
    ['tail-left','airframe',V(0,0,0)],
    ['tail-right','airframe',V(0,0,0)],
    ['canopy','glass',V(0,0,0)]
  ];
  const entities=planeParts.map(([part,material,offset])=>({
    id:'flyover:'+part,
    transform:{position:V(position.x+offset.x,position.y+offset.y,position.z+offset.z),
      rotationDeg:V(0,Math.sin(timeSec*.25)*3,Math.sin(timeSec*.7)*2)},
    renderable:{geometryRef:'flyover:'+part,materialId:material,layerMask:1}
  }));
  entities.push(
    {id:'flyover:water',transform:{position:V(0,0,-35)},renderable:{geometryRef:'flyover:sea',materialId:'ocean',layerMask:1}},
    {id:'flyover:coastline',transform:{position:V(-98,-1,-55)},renderable:{geometryRef:'flyover:coast',materialId:'rock',layerMask:1}},
    {id:'flyover:camera',transform:{position:cameraPos,rotationDeg:lookAtRotation(cameraPos,cameraAim)},
      camera:{projection:{type:'perspective',fovYDeg:53},near:.1,far:600,exposure:1.05,layerMask:1}},
    {id:'flyover:skyfill',transform:{position:V(0,0,0)},
      light:{type:'ambient',color:{r:.7,g:.8,b:1},intensity:.4,layerMask:1}},
    {id:'flyover:sun',transform:{position:V(-40,85,-50),rotationDeg:V(-48,-30,0)},
      light:{type:'directional',color:{r:1,g:.9,b:.75},intensity:3,layerMask:1}}
  );
  return {
    schema:SCHEMA,
    timeSec,
    renderTarget:{width:1280,height:720,aspect:'16:9'},
    provenance:{origin:'evercraft-original-procedural',usage:'synthetic-benchmark',realWorldEvidence:false},
    world:{
      schema:'evercraft.world-engine.world.v1',id:'evercraft-visual-flyover-v1',
      version:1,tickRateHz:60,gravity:V(0,0,0),
      visualScene:{
        schema:'evercraft.world-engine.visual-scene.v1',
        initialCameraEntityId:'flyover:camera',clearColor:{r:.23,g:.39,b:.57},
        materials:[
          {id:'airframe',model:'pbr',baseColor:COLOR(.74,.8,.83),metallic:.72,roughness:.34},
          {id:'glass',model:'pbr',baseColor:COLOR(.08,.22,.32),metallic:.18,roughness:.16},
          {id:'ocean',model:'pbr',baseColor:COLOR(.025,.19,.29),metallic:.2,roughness:.24},
          {id:'rock',model:'pbr',baseColor:COLOR(.24,.29,.27),metallic:0,roughness:.88}
        ]
      },
      entities
    },
    geometries:deepFreezeAssetList()
  };
}
