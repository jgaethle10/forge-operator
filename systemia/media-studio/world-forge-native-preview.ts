import crypto from 'node:crypto';
import {
  validateWorldForgeProject,
  worldForgeDigest,
  type Vec3,
  type WorldForgeNode,
  type WorldForgeProject,
} from './world-forge.js';

export interface WorldForgeNativePreviewReceipt {
  schema:'evercraft.fallen.world-forge-native-preview-receipt.v1';
  renderer:'evercraft-native-wireframe-v1';
  projectId:string;
  projectVersion:number;
  projectDigest:string;
  renderIntentId:string;
  cameraNodeId:string;
  svgSha256:string;
  width:number;
  height:number;
  lineCount:number;
  productionGrade:false;
  unsupportedFeatures:string[];
  boundaries:{
    publicationAuthorityGranted:false;
    productionRenderAuthorityGranted:false;
  };
  createdAt:string;
}

export interface WorldForgeNativePreviewResult {
  schema:'evercraft.fallen.world-forge-native-preview.v1';
  svg:string;
  receipt:WorldForgeNativePreviewReceipt;
}

type Line3={a:Vec3;b:Vec3};

function sub(a:Vec3,b:Vec3):Vec3{
  return {x:a.x-b.x,y:a.y-b.y,z:a.z-b.z};
}
function add(a:Vec3,b:Vec3):Vec3{
  return {x:a.x+b.x,y:a.y+b.y,z:a.z+b.z};
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
function normalize(v:Vec3):Vec3{
  const length=Math.hypot(v.x,v.y,v.z)||1;
  return {x:v.x/length,y:v.y/length,z:v.z/length};
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

const CUBE_VERTICES:Vec3[]=[
  {x:-.5,y:-.5,z:-.5},{x:.5,y:-.5,z:-.5},{x:.5,y:.5,z:-.5},{x:-.5,y:.5,z:-.5},
  {x:-.5,y:-.5,z:.5},{x:.5,y:-.5,z:.5},{x:.5,y:.5,z:.5},{x:-.5,y:.5,z:.5},
];
const CUBE_EDGES=[
  [0,1],[1,2],[2,3],[3,0],
  [4,5],[5,6],[6,7],[7,4],
  [0,4],[1,5],[2,6],[3,7],
];

function uniqueFaceEdges(faces:number[][]){
  const edges:Array<[number,number]>=[];
  const seen=new Set<string>();
  for(const face of faces){
    for(let i=0;i<face.length;i+=1){
      const a=face[i];
      const b=face[(i+1)%face.length];
      const key=a<b?`${a}:${b}`:`${b}:${a}`;
      if(seen.has(key)) continue;
      seen.add(key);
      edges.push([a,b]);
    }
  }
  return edges;
}

function nodeLines(node:WorldForgeNode):Line3[]{
  if(node.kind!=='mesh'||node.visible===false||!node.geometry) return [];
  if(node.geometry.kind==='primitive'&&node.geometry.primitive==='cube'){
    return CUBE_EDGES.map(([a,b])=>({
      a:transformPoint(node,CUBE_VERTICES[a]),
      b:transformPoint(node,CUBE_VERTICES[b]),
    }));
  }
  if(node.geometry.kind==='editable_mesh'){
    const edges=uniqueFaceEdges(node.geometry.mesh.faces);
    return edges.map(([a,b])=>({
      a:transformPoint(node,node.geometry!.kind==='editable_mesh'?node.geometry.mesh.vertices[a]:{x:0,y:0,z:0}),
      b:transformPoint(node,node.geometry!.kind==='editable_mesh'?node.geometry.mesh.vertices[b]:{x:0,y:0,z:0}),
    }));
  }
  return [];
}

function cameraBasis(camera:WorldForgeNode){
  if(camera.kind!=='camera'||!camera.camera) throw new Error('native_preview_camera_invalid');
  const eye=camera.transform.position;
  const target=camera.camera.lookAt??{x:0,y:0,z:0};
  const forward=normalize(sub(target,eye));
  const worldUp:Vec3={x:0,y:0,z:1};
  let right=normalize(cross(forward,worldUp));
  if(Math.hypot(right.x,right.y,right.z)<1e-6) right={x:1,y:0,z:0};
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

function escapeXml(value:string){
  return value.replace(/[&<>"']/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;',
  }[char]||char));
}

export function renderWorldForgeNativePreview(input:{
  project:WorldForgeProject;
  renderIntentId:string;
}):WorldForgeNativePreviewResult{
  const validation=validateWorldForgeProject(input.project);
  if(validation.status!=='accepted'){
    throw new Error(`native_preview_project_invalid:${validation.errors.join('|')}`);
  }
  const intent=input.project.renderIntents.find(item=>item.id===input.renderIntentId);
  if(!intent) throw new Error(`native_preview_intent_missing:${input.renderIntentId}`);
  if(intent.quality!=='preview') throw new Error('native_preview_production_intent_forbidden');

  const camera=input.project.nodes.find(node=>node.id===intent.cameraNodeId);
  if(!camera||camera.kind!=='camera'||!camera.camera){
    throw new Error(`native_preview_camera_invalid:${intent.cameraNodeId}`);
  }

  const unsupportedFeatures:string[]=[];
  if(input.project.simulations.length) unsupportedFeatures.push('simulation');
  if(input.project.nodes.some(node=>node.kind==='volume')) unsupportedFeatures.push('volumetrics');
  if(input.project.nodes.some(node=>node.geometry?.kind==='procedural')) unsupportedFeatures.push('procedural_geometry');
  if(input.project.nodes.some(node=>node.geometry?.kind==='asset')) unsupportedFeatures.push('asset_mesh_geometry');
  if(input.project.nodes.some(node=>node.geometry?.kind==='primitive'&&node.geometry.primitive!=='cube')){
    unsupportedFeatures.push('non_cube_primitives');
  }
  if(unsupportedFeatures.length){
    throw new Error(`native_preview_unsupported:${[...new Set(unsupportedFeatures)].join(',')}`);
  }

  const basis=cameraBasis(camera);
  const focalLengthMm=camera.camera.focalLengthMm??50;
  const sensorWidthMm=camera.camera.sensorWidthMm??36;
  const near=camera.camera.near??.01;
  const lines=input.project.nodes.flatMap(node=>nodeLines(node));

  const projected=lines.map(line=>{
    const a=projectPoint({
      point:line.a,camera:basis,width:intent.width,height:intent.height,
      focalLengthMm,sensorWidthMm,near,
    });
    const b=projectPoint({
      point:line.b,camera:basis,width:intent.width,height:intent.height,
      focalLengthMm,sensorWidthMm,near,
    });
    return a&&b?{a,b}:null;
  }).filter((line):line is NonNullable<typeof line>=>Boolean(line));

  const body=projected.map(line=>
    `<line x1="${line.a.x.toFixed(2)}" y1="${line.a.y.toFixed(2)}" x2="${line.b.x.toFixed(2)}" y2="${line.b.y.toFixed(2)}"/>`
  ).join('');

  const label=`${input.project.title} · v${input.project.version} · ${worldForgeDigest(input.project).slice(0,12)}`;
  const svg=[
    `<svg xmlns="http://www.w3.org/2000/svg" width="${intent.width}" height="${intent.height}" viewBox="0 0 ${intent.width} ${intent.height}">`,
    '<rect width="100%" height="100%" fill="#090d12"/>',
    '<g stroke="#72c9ff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">',
    body,
    '</g>',
    `<text x="24" y="38" fill="#8aa0b5" font-family="monospace" font-size="16">${escapeXml(label)}</text>`,
    '</svg>',
  ].join('');

  const svgSha256=crypto.createHash('sha256').update(svg).digest('hex');
  const receipt:WorldForgeNativePreviewReceipt={
    schema:'evercraft.fallen.world-forge-native-preview-receipt.v1',
    renderer:'evercraft-native-wireframe-v1',
    projectId:input.project.id,
    projectVersion:input.project.version,
    projectDigest:worldForgeDigest(input.project),
    renderIntentId:intent.id,
    cameraNodeId:camera.id,
    svgSha256,
    width:intent.width,
    height:intent.height,
    lineCount:projected.length,
    productionGrade:false,
    unsupportedFeatures:[],
    boundaries:{
      publicationAuthorityGranted:false,
      productionRenderAuthorityGranted:false,
    },
    createdAt:new Date().toISOString(),
  };

  return {
    schema:'evercraft.fallen.world-forge-native-preview.v1',
    svg,
    receipt,
  };
}
