/**
 * World Engine: reusable director shot intentions from actual 3D scene geometry.
 * No imported/AI image; no post-crop; no autonomous publishing.
 * Each treatment is a NEW World Engine camera path with hash-verified GPU plans.
 */
import type {WorldDefinition} from './engine.js';
import type {GeometryAsset} from './webgpu.js';
import type {TextureAsset} from './texture.js';
import type {CinematicCameraTake,CinematicCameraSequence} from './cinematic-rig.js';
import {buildCinematicCameraSequence} from './cinematic-rig.js';
import {auditSequenceHeroFraming,type FramingSubject,type GeometryFrameAudit} from './shot-composition.js';
import {autoFitOrbitCamera,type AutoFitReceipt} from './optical-autofit.js';

export type DirectorShotType='hero_full'|'detail_closeup'|'title_safe';
export interface DirectorShotReceipt{
 schema:'evercraft.world-engine.director-shot.v1';
 intent:DirectorShotType;
 sourceWorldId:string;
 sourceGeometryAssetIds:string[];
 cameraPlanDigests:string[];
 composition:{
   subjectId:string;
   subjectEntityIds:string[];
   samples:Array<{
     score:number;
     status:string;
     coverage:{width:number;height:number};
     center:{x:number;y:number};
     bounds:{left:number;right:number;top:number;bottom:number};
   }>;
 };
 candidatesEvaluated:number;
 selected:{radius:number;focusOffset:{x:number;y:number;z:number};targetEntityId:string};
 titleSafeRegion:null|{left:number;right:number;top:number;bottom:number;axis:'right'};
 safeRegionClearanceScore:null|number;
 titleSafeClearance:null|{
   clearAtAllSamples:boolean;
   maxSubjectRight:number;
   maxSubjectOverflow:number;
   reservedNdcMinX:number;
 };
 fullHeroAutoFit:AutoFitReceipt|null;
 disclaimer:'synthetic_visual_study_no_observed_evidence';
 operatorCreativeReviewRequired:true;
 clientApproval:false;
 publicationAuthority:false;
}
export interface DirectedShotResult{
  take:CinematicCameraTake;
  sequence:CinematicCameraSequence;
  receipt:DirectorShotReceipt;
}
const err=(x:string):never=>{throw Error('world_director_'+x)};
const bounded=(v:number,lo:number,hi:number)=>Number.isFinite(v)&&v>=lo&&v<=hi;
const clone=<T>(x:T):T=>JSON.parse(JSON.stringify(x)) as T;
function analyze(input:{
 world:WorldDefinition;
 geometries:GeometryAsset[];
 textures?:TextureAsset[];
 viewport:{width:number;height:number};
 take:CinematicCameraTake;
 subject:FramingSubject;
}){
 const short:CinematicCameraTake={...input.take,durationSec:.5};
 const seq=buildCinematicCameraSequence({
  world:input.world,take:short,geometries:input.geometries,
  viewport:input.viewport,textures:input.textures??[]
 });
 const result=auditSequenceHeroFraming({
  frames:seq.frames,geometries:input.geometries,subject:input.subject
 });
 return result.frameSamples;
}
function partialPenalty(a:GeometryFrameAudit){
 const b=a.normalizedBounds;
 return Math.max(0,-.97-b.left)+Math.max(0,b.right-.97)+
  Math.max(0,b.top-.97)+Math.max(0,-.97-b.bottom);
}
function scoreDetail(a:GeometryFrameAudit){
 const clipped=partialPenalty(a);
 const width=a.coverage.width,height=a.coverage.height;
 // A close-up should occupy the screen substantially WITHOUT making the
 // selected detail unrecognizable by clipping more than 10% at any edge.
 return 75*clipped + Math.max(0,.25-width)*30 +
   Math.max(0,.35-height)*30 +
   Math.abs(a.center.x)*.3+Math.abs(a.center.y)*.4;
}
function scoreTitleSafe(a:GeometryFrameAudit){
 const b=a.normalizedBounds;
 // Explicit right-hand NDC copy-zone x>0.35, useful for educational
 // annotation/CTA placement. No text rendered or user rights inferred.
 const overlap=Math.max(0,b.right-.35);
 const cropped=partialPenalty(a);
 return 120*cropped + 150*overlap +
   Math.max(0,.22-a.coverage.width)*10 +
   Math.max(0,.25-a.coverage.height)*10 +
   Math.abs(a.center.y)*.4;
}
export function directWorldEngineShot(input:{
 world:WorldDefinition;
 geometries:GeometryAsset[];
 textures?:TextureAsset[];
 viewport:{width:number;height:number};
 take:CinematicCameraTake;
 intent:DirectorShotType;
 hero:FramingSubject;
 detail?:FramingSubject;
 detailTargetEntityId?:string;
}):DirectedShotResult{
 const {world,geometries,take,viewport}=input;
 if(!world||!Array.isArray(geometries)||!geometries.length)err('source_missing');
 if(!['hero_full','detail_closeup','title_safe'].includes(input.intent))
  err('intent_invalid');
 if(take.move!=='orbit'||!take.orbit||!bounded(take.orbit.radius,.5,500))
  err('orbit_only');
 if(!Number.isInteger(viewport?.width)||!Number.isInteger(viewport?.height)||
  viewport.width<240||viewport.height<240||viewport.width>1920||viewport.height>1920)
  err('viewport_invalid');
 if(!input.hero?.entityIds?.length)err('hero_missing');
 let chosen:CinematicCameraTake=clone(take);
 let subject:FramingSubject=input.hero;
 let autoFit:AutoFitReceipt|null=null;
 let candidateCount=1;
 let copyRegion:DirectorShotReceipt['titleSafeRegion']=null;
 let copyScore:number|null=null;
 if(input.intent==='hero_full'){
  const res=autoFitOrbitCamera({
   world,geometries,viewport,take,subject:input.hero,textures:input.textures
  });
  chosen=res.take;autoFit=res.receipt;
  candidateCount=res.receipt.evaluated.length;
 }else{
  const choices:Array<{take:CinematicCameraTake;measure:GeometryFrameAudit[];score:number}>=[];
  if(input.intent==='detail_closeup'){
   if(!input.detail?.entityIds?.length||!input.detailTargetEntityId)
    err('detail_subject_required');
   if(!input.detail.entityIds.includes(input.detailTargetEntityId))
    err('detail_target_must_be_hero');
   subject=input.detail;
   const radius=take.orbit.radius;
   for(const factor of [.16,.22,.28,.36,.48]){
    for(const z of [0,.5,1]){
     const candidate:CinematicCameraTake={
      ...take,id:take.id+'-detail',targetEntityId:input.detailTargetEntityId,
      orbit:{...take.orbit,radius:Math.max(.6,Math.round(radius*factor*100)/100),
       startAngleDeg:-32,endAngleDeg:-8,startHeight:2.2,endHeight:2.7},
      lookAtOffset:{x:0,y:.15,z}
     };
     const measures=analyze({...input,take:candidate,subject});
     choices.push({take:candidate,measure:measures,
       score:measures.reduce((s,a)=>s+scoreDetail(a),0)});
    }
   }
  }else{
   copyRegion={left:.35,right:1,top:.85,bottom:-.85,axis:'right'};
   for(const r of [1,1.3,1.6,1.9]){
    for(const shiftX of [6,9,12,15,18,21]){
     const candidate:CinematicCameraTake={
      ...take,id:take.id+'-title-safe',
      orbit:{...take.orbit,radius:Math.round(take.orbit.radius*r*100)/100},
      lookAtOffset:{x:shiftX,y:take.lookAtOffset?.y??0,z:take.lookAtOffset?.z??0}
     };
     const measures=analyze({...input,take:candidate,subject});
     choices.push({take:candidate,measure:measures,
       score:measures.reduce((s,a)=>s+scoreTitleSafe(a),0)});
    }
   }
  }
  if(!choices.length)err('candidate_pool_empty');
  candidateCount=choices.length;
  choices.sort((a,b)=>a.score-b.score||
    a.take.orbit!.radius-b.take.orbit!.radius||
    (a.take.lookAtOffset?.x??0)-(b.take.lookAtOffset?.x??0));
  chosen=choices[0].take;
  if(copyRegion)copyScore=Number(choices[0].score.toFixed(5));
 }
 const sequence=buildCinematicCameraSequence({
  world,take:chosen,geometries,viewport,textures:input.textures??[]
 });
 const checks=auditSequenceHeroFraming({
  frames:sequence.frames,geometries,subject
 });
 const receipt:DirectorShotReceipt={
  schema:'evercraft.world-engine.director-shot.v1',
  intent:input.intent,sourceWorldId:world.id,
  sourceGeometryAssetIds:[...new Set(geometries.map(x=>x.id))].sort(),
  cameraPlanDigests:checks.originalPlanDigests,
  composition:{
   subjectId:subject.id,subjectEntityIds:[...subject.entityIds],
   samples:checks.frameSamples.map(a=>({
    score:Number((input.intent==='detail_closeup'?scoreDetail(a):
      input.intent==='title_safe'?scoreTitleSafe(a):partialPenalty(a)).toFixed(5)),
    status:a.framingStatus,coverage:a.coverage,center:a.center,bounds:a.normalizedBounds
   }))
  },
  candidatesEvaluated:candidateCount,
  selected:{radius:chosen.orbit!.radius,
   focusOffset:clone(chosen.lookAtOffset??{x:0,y:0,z:0}),
   targetEntityId:chosen.targetEntityId},
  titleSafeRegion:copyRegion,safeRegionClearanceScore:copyScore,
  titleSafeClearance:copyRegion?{
    clearAtAllSamples:checks.frameSamples.every(a=>
      a.normalizedBounds.right<=.30&&a.normalizedBounds.left>=-.96
      &&a.normalizedBounds.top<=.96&&a.normalizedBounds.bottom>=-.96),
    maxSubjectRight:Math.max(...checks.frameSamples.map(a=>a.normalizedBounds.right)),
    maxSubjectOverflow:Math.max(...checks.frameSamples.map(a=>partialPenalty(a))),
    reservedNdcMinX:.35
  }:null,
  fullHeroAutoFit:autoFit,
  disclaimer:'synthetic_visual_study_no_observed_evidence',
  operatorCreativeReviewRequired:true,
  clientApproval:false,publicationAuthority:false
 };
 return {take:chosen,sequence,receipt};
}
