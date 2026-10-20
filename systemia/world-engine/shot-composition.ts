/**
 * World Engine scene-space camera safety and framing preflight.
 * Uses the ACTUAL WebGPU render plan, world-space model matrices, and
 * declared hero geometry. No trained image detector, crop, fabricated pixels,
 * guessed labels or claim of visual-quality certification.
 */
import crypto from 'node:crypto';
import type {GeometryAsset,WebGpuRenderPlan} from './webgpu.js';
import {verifyWebGpuRenderPlan,validateGeometryAsset} from './webgpu.js';

export interface FramingSubject {
  id:string;
  entityIds:string[];
  minVisibleFraction?:number;
}
export interface GeometryFrameAudit {
  schema:'evercraft.world-engine.geometry-framing.v1';
  subjectId:string;
  worldId:string;
  sceneTick:number;
  planDigest:string;
  viewport:{width:number;height:number};
  entityIds:string[];
  pointsExamined:number;
  visibleProjectableVertices:number;
  normalizedBounds:{left:number;top:number;right:number;bottom:number};
  clippedBounds:{left:number;top:number;right:number;bottom:number};
  coverage:{width:number;height:number;area:number};
  center:{x:number;y:number};
  fractionBehindCamera:number;
  framingStatus:'good_technical_framing'|'subject_cropped'|'subject_too_small'|'subject_offscreen';
  notes:string[];
  sha256:string;
  creativeApproval:false;
  publicationAuthority:false;
}
const error=(reason:string):never=>{throw new Error('world_framing_'+reason);};
const clamp=(x:number,a:number,b:number)=>Math.min(Math.max(x,a),b);
function canonicalHash(data:unknown){
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}
function projectMatrix(m:number[],x:number,y:number,z:number){
  return [
    m[0]*x+m[4]*y+m[8]*z+m[12],
    m[1]*x+m[5]*y+m[9]*z+m[13],
    m[2]*x+m[6]*y+m[10]*z+m[14],
    m[3]*x+m[7]*y+m[11]*z+m[15]
  ];
}
function corners(geometry:GeometryAsset):Array<[number,number,number]>{
  const pos=geometry.positions;
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  for(let i=0;i<pos.length;i+=3){
    const x=pos[i],y=pos[i+1],z=pos[i+2];
    minX=Math.min(x,minX);minY=Math.min(y,minY);minZ=Math.min(z,minZ);
    maxX=Math.max(x,maxX);maxY=Math.max(y,maxY);maxZ=Math.max(z,maxZ);
  }
  return [[minX,minY,minZ],[minX,minY,maxZ],[minX,maxY,minZ],[minX,maxY,maxZ],
    [maxX,minY,minZ],[maxX,minY,maxZ],[maxX,maxY,minZ],[maxX,maxY,maxZ]];
}
/**
 * Uses a conservative axis-aligned box per selected real mesh. That bounds
 * real vertices but can include empty space: an optical safety estimate, not
 * computer-vision visibility or occlusion proof.
 */
export function auditWebGpuHeroFraming(input:{
  plan:WebGpuRenderPlan;geometries:GeometryAsset[];subject:FramingSubject;
}):GeometryFrameAudit{
  const {plan,geometries,subject}=input||{};
  if(!plan||!verifyWebGpuRenderPlan(plan))error('invalid_gpu_plan');
  if(!subject||typeof subject.id!=='string'||!/^[a-z0-9][a-z0-9._:-]{2,90}$/.test(subject.id))
    error('subject_id_invalid');
  if(!Array.isArray(subject.entityIds)||subject.entityIds.length<1||subject.entityIds.length>80||
    subject.entityIds.some(id=>typeof id!=='string'||id.length<1||id.length>160)||
    new Set(subject.entityIds).size!==subject.entityIds.length)
    error('subject_entity_ids_invalid');
  const threshold=subject.minVisibleFraction??.75;
  if(!Number.isFinite(threshold)||threshold<.2||threshold>1)
    error('visible_fraction_invalid');
  const ids=new Set(subject.entityIds);
  const selected=plan.draws.filter(d=>ids.has(d.entityId));
  if(selected.length!==subject.entityIds.length)error('subject_entity_not_drawn');
  const assetMap=new Map<string,GeometryAsset>();
  for(const g of geometries){
    validateGeometryAsset(g);
    if(assetMap.has(g.id))error('duplicate_geometry');
    assetMap.set(g.id,g);
  }
  let total=0,behind=0;
  const locations:Array<{x:number;y:number}>=[];
  for(const draw of selected){
    const geo=assetMap.get(draw.geometryId);
    if(!geo)error('selected_geometry_missing');
    const localCorners=corners(geo);
    for(const pt of localCorners){
      total++;
      const m=projectMatrix(draw.modelMatrix,...pt);
      const p=projectMatrix(plan.viewProjectionMatrix,m[0],m[1],m[2]);
      const w=p[3];
      if(w<=1e-6){behind++;continue;}
      const x=p[0]/w,y=p[1]/w,z=p[2]/w;
      if(![x,y,z].every(Number.isFinite))error('projection_non_finite');
      if(z<0||z>1){behind++;continue;}
      locations.push({x,y});
    }
  }
  if(!locations.length){
    const core={schema:'evercraft.world-engine.geometry-framing.v1' as const,
      subjectId:subject.id,worldId:plan.worldId,sceneTick:plan.tick,planDigest:plan.digest,
      viewport:{width:plan.width,height:plan.height},
      entityIds:[...subject.entityIds],pointsExamined:total,visibleProjectableVertices:0,
      normalizedBounds:{left:0,top:0,right:0,bottom:0},
      clippedBounds:{left:0,top:0,right:0,bottom:0},
      coverage:{width:0,height:0,area:0},center:{x:0,y:0},
      fractionBehindCamera:1,framingStatus:'subject_offscreen' as const,
      notes:['All selected geometry bounds behind camera or outside near/far depth'],
      creativeApproval:false as const,publicationAuthority:false as const};
    return {...core,sha256:canonicalHash(core)};
  }
  const left=Math.min(...locations.map(p=>p.x)),right=Math.max(...locations.map(p=>p.x));
  const bottom=Math.min(...locations.map(p=>p.y)),top=Math.max(...locations.map(p=>p.y));
  const clipped={left:clamp(left,-1,1),right:clamp(right,-1,1),
    bottom:clamp(bottom,-1,1),top:clamp(top,-1,1)};
  const coveredWidth=Math.max(0,clipped.right-clipped.left)/2;
  const coveredHeight=Math.max(0,clipped.top-clipped.bottom)/2;
  const center={x:(left+right)/2,y:(bottom+top)/2};
  const fractionBehind=behind/total;
  const partial=(left<-.96||right>.96||bottom<-.96||top>.96||
    fractionBehind>1-threshold);
  const hasPixels=coveredWidth>.005&&coveredHeight>.005;
  const small=coveredWidth<.22&&coveredHeight<.22;
  const status=(!hasPixels?'subject_offscreen':partial?'subject_cropped':
    small?'subject_too_small':'good_technical_framing') as GeometryFrameAudit['framingStatus'];
  const notes=[
    ...(fractionBehind>0?['Some selected box corners are behind camera or outside depth range']:[]),
    ...(partial?['Conservative projected subject bounds cross the image safety margin']:[]),
    ...(small?['Subject box projects to less than 22% of each image dimension']:[]),
    ...(Math.abs(center.x)>.5?['Subject appears off center horizontally']:[]),
    ...(Math.abs(center.y)>.5?['Subject appears off center vertically']:[])
  ];
  const core={schema:'evercraft.world-engine.geometry-framing.v1' as const,
    subjectId:subject.id,worldId:plan.worldId,sceneTick:plan.tick,planDigest:plan.digest,
    viewport:{width:plan.width,height:plan.height},entityIds:[...subject.entityIds],
    pointsExamined:total,visibleProjectableVertices:locations.length,
    normalizedBounds:{left,top,right,bottom},clippedBounds:clipped,
    coverage:{width:coveredWidth,height:coveredHeight,area:coveredWidth*coveredHeight},
    center,fractionBehindCamera:fractionBehind,
    framingStatus:status,notes,creativeApproval:false as const,publicationAuthority:false as const};
  return {...core,sha256:canonicalHash(core)};
}
export function auditSequenceHeroFraming(input:{
  frames:Array<{renderPlan:WebGpuRenderPlan}>;
  geometries:GeometryAsset[];
  subject:FramingSubject;
  indices?:number[];
}):{
  schema:'evercraft.world-engine.sequence-framing.v1';
  frameSamples:GeometryFrameAudit[];
  status:'needs_camera_review'|'technical_framing_pass';
  coverageRange:{minWidth:number;maxWidth:number;minHeight:number;maxHeight:number};
  originalPlanDigests:string[];
  publicationAuthority:false;
}{
  if(!Array.isArray(input?.frames)||input.frames.length<1)error('empty_sequence');
  const indexes=input.indices??[0,Math.floor((input.frames.length-1)/2),input.frames.length-1];
  if(!Array.isArray(indexes)||indexes.length<1||indexes.length>20||
    indexes.some(x=>!Number.isInteger(x)||x<0||x>=input.frames.length))
    error('invalid_sample_indices');
  const frameSamples=indexes.map(i=>auditWebGpuHeroFraming({
    plan:input.frames[i].renderPlan,geometries:input.geometries,subject:input.subject
  }));
  return {
    schema:'evercraft.world-engine.sequence-framing.v1',
    frameSamples,
    status:frameSamples.some(x=>x.framingStatus!=='good_technical_framing')
      ?'needs_camera_review':'technical_framing_pass',
    coverageRange:{
      minWidth:Math.min(...frameSamples.map(x=>x.coverage.width)),
      maxWidth:Math.max(...frameSamples.map(x=>x.coverage.width)),
      minHeight:Math.min(...frameSamples.map(x=>x.coverage.height)),
      maxHeight:Math.max(...frameSamples.map(x=>x.coverage.height))
    },
    originalPlanDigests:frameSamples.map(x=>x.planDigest),
    publicationAuthority:false
  };
}
