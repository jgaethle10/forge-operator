import crypto from 'node:crypto';
import {
  validateWorldForgeProject,
  worldForgeDigest,
  type Vec3,
  type WorldForgeEditableMesh,
  type WorldForgeMaterial,
  type WorldForgeNode,
  type WorldForgeProject,
} from './world-forge.js';

export interface WorldForgeNativeSolidPreviewReceipt {
  schema:'evercraft.fallen.world-forge-native-solid-preview-receipt.v1';
  renderer:'evercraft-native-solid-v1';
  projectId:string;
  projectVersion:number;
  projectDigest:string;
  renderIntentId:string;
  cameraNodeId:string;
  svgSha256:string;
  width:number;
  height:number;
  polygonCount:number;
  lightCount:number;
  productionGrade:false;
  boundaries:{
    publicationAuthorityGranted:false;
    productionRenderAuthorityGranted:false;
  };
  createdAt:string;
}

export interface WorldForgeNativeSolidPreviewResult {
  schema:'evercraft.fallen.world-forge-native-solid-preview.v1';
  svg:string;
  receipt:WorldForgeNativeSolidPreviewReceipt;
}

type Face3={
  node:WorldForgeNode;
  points:Vec3[];
  center:Vec3;
  normal:Vec3;
  material?:WorldForgeMaterial;
};

type ProjectedFace={
  depth:number;
  points:Array<{x:number;y:number}>;
  fill:string;
  stroke:string;
};

function add(a:Vec3,b:Vec3):Vec3{
  return {x:a.x+b.x,y:a.y+b.y,z:a.z+b.z};
}
function sub(a:Vec3,b:Vec3):Vec3{
  return {x:a.x-b.x,y:a.y-b.y,z:a.z-b.z};
}
function mul(v:Vec3,s:number):Vec3{
  return {x:v.x*s,y:v.y*s,z:v.z*s};
}
function dot(a:Vec3,b:Vec3){
  return a.x*b.x+a.y*b.y+a.z*b.z;
}
function cross(a:Vec3,b:Vec3):Vec3{
  return {
    x:a.y*b.z-a.z*b.y,
    y:a.z*b.x-a.x*b.z,
    z:a.x*b.y-a.y*b.x,
  };
}
function length(v:Vec3){
  return Math.hypot(v.x,v.y,v.z);
}
function normalize(v:Vec3):Vec3{
  const n=length(v)||1;
  return {x:v.x/n,y:v.y/n,z:v.z/n};
}
function rotateX(v:Vec3,rad:number):Vec3{
  const c=Math.cos(rad),s=Math.sin(rad);
  return {x:v.x,y:v.y*c-v.z*s,z:v.y*s+v.z*c};
}
function rotateY(v:Vec3,rad:number):Vec3{
  const c=Math.cos(rad),s=Math.sin(rad);
  return {x:v.x*c+v.z*s,y:v.y,z:-v.x*s+v.z*c};
}
function rotateZ(v:Vec3,rad:number):Vec3{
  const c=Math.cos(rad),s=Math.sin(rad);
  return {x:v.x*c-v.y*s,y:v.x*s+v.y*c,z:v.z};
}
function transformPoint(node:WorldForgeNode,point:Vec3):Vec3{
  let value={
    x:point.x*node.transform.scale.x,
    y:point.y*node.transform.scale.y,
    z:point.z*node.transform.scale.z,
  };
  value=rotateX(value,node.transform.rotationDeg.x*Math.PI/180);
  value=rotateY(value,node.transform.rotationDeg.y*Math.PI/180);
  value=rotateZ(value,node.transform.rotationDeg.z*Math.PI/180);
  return add(value,node.transform.position);
}
function average(points:Vec3[]):Vec3{
  const total=points.reduce((sum,point)=>add(sum,point),{x:0,y:0,z:0});
  return mul(total,1/points.length);
}
function faceNormal(points:Vec3[]):Vec3{
  if(points.length<3) return {x:0,y:0,z:1};
  return normalize(cross(sub(points[1],points[0]),sub(points[2],points[0])));
}

const CUBE_VERTICES:Vec3[]=[
  {x:-.5,y:-.5,z:-.5},{x:.5,y:-.5,z:-.5},{x:.5,y:.5,z:-.5},{x:-.5,y:.5,z:-.5},
  {x:-.5,y:-.5,z:.5},{x:.5,y:-.5,z:.5},{x:.5,y:.5,z:.5},{x:-.5,y:.5,z:.5},
];
const CUBE_FACES=[
  [0,3,2,1],
  [4,5,6,7],
  [0,1,5,4],
  [1,2,6,5],
  [2,3,7,6],
  [3,0,4,7],
];

function geometryMesh(node:WorldForgeNode):WorldForgeEditableMesh|null{
  if(node.kind!=='mesh'||node.visible===false||!node.geometry) return null;
  if(node.geometry.kind==='primitive'){
    if(node.geometry.primitive!=='cube') throw new Error(`native_solid_unsupported_primitive:${node.geometry.primitive}`);
    return {vertices:CUBE_VERTICES,faces:CUBE_FACES};
  }
  if(node.geometry.kind==='editable_mesh') return node.geometry.mesh;
  if(node.geometry.kind==='asset') throw new Error('native_solid_asset_geometry_unsupported');
  if(node.geometry.kind==='procedural') throw new Error('native_solid_procedural_geometry_unsupported');
  return null;
}

function materialFor(project:WorldForgeProject,node:WorldForgeNode){
  const id=node.materialIds?.[0];
  return id?project.materials.find(material=>material.id===id):undefined;
}

function sceneFaces(project:WorldForgeProject):Face3[]{
  const faces:Face3[]=[];
  for(const node of project.nodes){
    const mesh=geometryMesh(node);
    if(!mesh) continue;
    const material=materialFor(project,node);
    for(const face of mesh.faces){
      const points=face.map(index=>transformPoint(node,mesh.vertices[index]));
      faces.push({
        node,
        points,
        center:average(points),
        normal:faceNormal(points),
        material,
      });
    }
  }
  return faces;
}

function cameraBasis(camera:WorldForgeNode){
  if(camera.kind!=='camera'||!camera.camera) throw new Error('native_solid_camera_invalid');
  const eye=camera.transform.position;
  const target=camera.camera.lookAt??{x:0,y:0,z:0};
  const forward=normalize(sub(target,eye));
  const worldUp:Vec3={x:0,y:0,z:1};
  let right=normalize(cross(forward,worldUp));
  if(length(right)<1e-6) right={x:1,y:0,z:0};
  const up=normalize(cross(right,forward));
  return {eye,forward,right,up};
}

function projectPoint(input:{
  point:Vec3;
  camera:ReturnType<typeof cameraBasis>;
  width:number;
  height:number;
  focalLengthMm:number;
  sensorWidthMm:number;
  near:number;
}){
  const relative=sub(input.point,input.camera.eye);
  const x=dot(relative,input.camera.right);
  const y=dot(relative,input.camera.up);
  const z=dot(relative,input.camera.forward);
  if(z<=input.near) return null;

  const sensorHeight=input.sensorWidthMm*(input.height/input.width);
  const ndcX=(x/z)*(input.focalLengthMm/(input.sensorWidthMm/2));
  const ndcY=(y/z)*(input.focalLengthMm/(sensorHeight/2));
  return {
    x:(ndcX*.5+.5)*input.width,
    y:(.5-ndcY*.5)*input.height,
    z,
  };
}

function clamp01(value:number){
  return Math.max(0,Math.min(1,value));
}

function faceBrightness(project:WorldForgeProject,face:Face3){
  let brightness=.18;
  const lights=project.nodes.filter(node=>node.kind==='light'&&node.visible!==false&&node.light);
  for(const light of lights){
    const component=light.light!;
    let direction:Vec3;
    let attenuation=1;

    if(component.type==='sun'){
      direction=normalize(mul(light.transform.position,-1));
    }else{
      const delta=sub(light.transform.position,face.center);
      const distance=Math.max(.001,length(delta));
      direction=normalize(delta);
      const range=component.range??12;
      attenuation=clamp01(1-distance/Math.max(.001,range));
    }

    const diffuse=Math.max(0,dot(face.normal,direction));
    const normalizedIntensity=Math.min(1.5,component.intensity/1200);
    brightness+=diffuse*normalizedIntensity*(.25+.75*attenuation);
  }
  return Math.max(.08,Math.min(1.4,brightness));
}

function colorFor(face:Face3,brightness:number){
  const base=face.material?.baseColor??[.18,.36,.54,1];
  const rgb=base.slice(0,3).map(channel=>
    Math.round(clamp01(channel*brightness)*255)
  );
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

function escapeXml(value:string){
  return value.replace(/[&<>"']/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;',
  }[char]||char));
}

export function renderWorldForgeNativeSolidPreview(input:{
  project:WorldForgeProject;
  renderIntentId:string;
}):WorldForgeNativeSolidPreviewResult{
  const validation=validateWorldForgeProject(input.project);
  if(validation.status!=='accepted'){
    throw new Error(`native_solid_project_invalid:${validation.errors.join('|')}`);
  }

  const intent=input.project.renderIntents.find(item=>item.id===input.renderIntentId);
  if(!intent) throw new Error(`native_solid_intent_missing:${input.renderIntentId}`);
  if(intent.quality!=='preview') throw new Error('native_solid_production_intent_forbidden');

  const camera=input.project.nodes.find(node=>node.id===intent.cameraNodeId);
  if(!camera||camera.kind!=='camera'||!camera.camera){
    throw new Error(`native_solid_camera_invalid:${intent.cameraNodeId}`);
  }

  if(input.project.simulations.length) throw new Error('native_solid_simulation_unsupported');
  if(input.project.nodes.some(node=>node.kind==='volume')) throw new Error('native_solid_volumetrics_unsupported');

  const basis=cameraBasis(camera);
  const focalLengthMm=camera.camera.focalLengthMm??50;
  const sensorWidthMm=camera.camera.sensorWidthMm??36;
  const near=camera.camera.near??.01;

  const projected:ProjectedFace[]=[];
  for(const face of sceneFaces(input.project)){
    const towardCamera=normalize(sub(basis.eye,face.center));
    if(dot(face.normal,towardCamera)<=0) continue;

    const points=face.points.map(point=>projectPoint({
      point,
      camera:basis,
      width:intent.width,
      height:intent.height,
      focalLengthMm,
      sensorWidthMm,
      near,
    }));
    if(points.some(point=>point===null)) continue;
    const safe=points as Array<{x:number;y:number;z:number}>;
    const depth=safe.reduce((sum,point)=>sum+point.z,0)/safe.length;
    const brightness=faceBrightness(input.project,face);
    projected.push({
      depth,
      points:safe.map(point=>({x:point.x,y:point.y})),
      fill:colorFor(face,brightness),
      stroke:'rgba(140,205,245,.72)',
    });
  }

  projected.sort((a,b)=>b.depth-a.depth);
  const polygons=projected.map(face=>
    `<polygon points="${face.points.map(point=>`${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')}" fill="${face.fill}" stroke="${face.stroke}" stroke-width="1.5"/>`
  ).join('');

  const projectDigest=worldForgeDigest(input.project);
  const label=`${input.project.title} · solid preview · v${input.project.version} · ${projectDigest.slice(0,12)}`;
  const svg=[
    `<svg xmlns="http://www.w3.org/2000/svg" width="${intent.width}" height="${intent.height}" viewBox="0 0 ${intent.width} ${intent.height}">`,
    '<rect width="100%" height="100%" fill="#090d12"/>',
    polygons,
    `<text x="24" y="38" fill="#8aa0b5" font-family="monospace" font-size="16">${escapeXml(label)}</text>`,
    '</svg>',
  ].join('');

  const svgSha256=crypto.createHash('sha256').update(svg).digest('hex');
  const lightCount=input.project.nodes.filter(node=>node.kind==='light'&&node.visible!==false&&node.light).length;

  return {
    schema:'evercraft.fallen.world-forge-native-solid-preview.v1',
    svg,
    receipt:{
      schema:'evercraft.fallen.world-forge-native-solid-preview-receipt.v1',
      renderer:'evercraft-native-solid-v1',
      projectId:input.project.id,
      projectVersion:input.project.version,
      projectDigest,
      renderIntentId:intent.id,
      cameraNodeId:camera.id,
      svgSha256,
      width:intent.width,
      height:intent.height,
      polygonCount:projected.length,
      lightCount,
      productionGrade:false,
      boundaries:{
        publicationAuthorityGranted:false,
        productionRenderAuthorityGranted:false,
      },
      createdAt:new Date().toISOString(),
    },
  };
}
