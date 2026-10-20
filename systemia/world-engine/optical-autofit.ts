/**
 * Deterministic camera orbit preflight from actual geometry and signed GPU
 * plans. Evaluates bounded candidates on a short, full-sweep proxy take
 * before spending GPU time on a full film. Never claims artistic approval.
 */
import type {WorldDefinition} from './engine.js';
import type {GeometryAsset} from './webgpu.js';
import type {TextureAsset} from './texture.js';
import type {CinematicCameraTake} from './cinematic-rig.js';
import {buildCinematicCameraSequence} from './cinematic-rig.js';
import {auditSequenceHeroFraming,type FramingSubject} from './shot-composition.js';

export interface AutoFitCandidate{
  radius:number;
  targetZ:number;
  cameraScore:number;
  overflow:number;
  minWidthCoverage:number;
  minHeightCoverage:number;
  statuses:string[];
}
export interface AutoFitReceipt{
  schema:'evercraft.world-engine.optical-autofit.v1';
  sampleDurationSec:number;
  sampleFrameCount:number;
  selectionBasis:'actual_geometry_bounds_from_verified_webgpu_plans';
  initial:AutoFitCandidate;
  selected:AutoFitCandidate;
  evaluated:AutoFitCandidate[];
  changed:boolean;
  creativeReviewRequired:true;
  noPostCrop:true;
  publicationAuthority:false;
}
const error=(s:string):never=>{throw Error('world_autofit_'+s);};
export function autoFitOrbitCamera(input:{
  world:WorldDefinition;
  geometries:GeometryAsset[];
  textures?:TextureAsset[];
  take:CinematicCameraTake;
  viewport:{width:number;height:number};
  subject:FramingSubject;
  radiusFactors?:number[];
  targetZOffsets?:number[];
}):{take:CinematicCameraTake;receipt:AutoFitReceipt}{
 const {world,geometries,take,subject,viewport}=input;
 if(!world||take?.move!=='orbit'||!take.orbit)error('orbit_required');
 if(!Number.isFinite(take.orbit.radius)||take.orbit.radius<=0)
   error('invalid_orbit_radius');
 const factors=input.radiusFactors??[1,1.14,1.3,1.5,1.75];
 const offsets=input.targetZOffsets??[0,2.5,5];
 if(!Array.isArray(factors)||!Array.isArray(offsets)||!factors.includes(1)||!offsets.includes(0)||
    factors.length>8||offsets.length>6||
    factors.some(x=>!Number.isFinite(x)||x<.7||x>2)||
    offsets.some(x=>!Number.isFinite(x)||x<-12||x>12))
    error('candidate_bounds_invalid');
 const initialZ=take.lookAtOffset?.z??0;
 const candidates:Array<{take:CinematicCameraTake;score:AutoFitCandidate}>=[];
 for(const factor of factors){
  for(const deltaZ of offsets){
   const radius=Math.round(take.orbit.radius*factor*1000)/1000;
   const focusZ=Math.round((initialZ+deltaZ)*1000)/1000;
   const choice:CinematicCameraTake={
    ...take,
    durationSec:.5,
    orbit:{...take.orbit,radius},
    lookAtOffset:{x:take.lookAtOffset?.x??0,y:take.lookAtOffset?.y??0,z:focusZ}
   };
   // .5 s/24 fps produces 13 plans covering the same orbit endpoints.
   const sequence=buildCinematicCameraSequence({world,take:choice,geometries,viewport,
      textures:input.textures??[]});
   const audit=auditSequenceHeroFraming({frames:sequence.frames,geometries,subject});
   let score=0,overflow=0;
   for(const sample of audit.frameSamples){
     const b=sample.normalizedBounds;
     const excursion=Math.max(0,-.94-b.left)+Math.max(0,b.right-.94)
       +Math.max(0,b.top-.94)+Math.max(0,-.94-b.bottom);
     overflow+=excursion;
     score+=50*excursion+12*sample.fractionBehindCamera+
       Math.max(0,.40-sample.coverage.width)*6+
       Math.max(0,.46-sample.coverage.height)*6+
       Math.abs(sample.center.x)*.35+
       Math.abs(sample.center.y)*.25+
       Math.abs(sample.coverage.width-.64)*.16;
   }
   const c:AutoFitCandidate={
    radius,targetZ:focusZ,cameraScore:Number(score.toFixed(6)),
    overflow:Number(overflow.toFixed(6)),
    minWidthCoverage:audit.coverageRange.minWidth,
    minHeightCoverage:audit.coverageRange.minHeight,
    statuses:audit.frameSamples.map(x=>x.framingStatus)
   };
   candidates.push({take:{...choice,durationSec:take.durationSec},score:c});
  }
 }
 const base=candidates.find(c=>c.score.radius===take.orbit!.radius&&
   c.score.targetZ===initialZ);
 if(!base)error('baseline_candidate_missing');
 candidates.sort((a,b)=>a.score.cameraScore-b.score.cameraScore||
   Math.abs(a.score.radius-take.orbit!.radius)-Math.abs(b.score.radius-take.orbit!.radius)||
   Math.abs(a.score.targetZ-initialZ)-Math.abs(b.score.targetZ-initialZ));
 const best=candidates[0];
 const receipt:AutoFitReceipt={
   schema:'evercraft.world-engine.optical-autofit.v1',
   sampleDurationSec:.5,sampleFrameCount:13,
   selectionBasis:'actual_geometry_bounds_from_verified_webgpu_plans',
   initial:base.score,selected:best.score,
   evaluated:candidates.map(c=>c.score),
   changed:best.score.radius!==take.orbit.radius||best.score.targetZ!==initialZ,
   creativeReviewRequired:true,noPostCrop:true,publicationAuthority:false
 };
 return {take:best.take,receipt};
}
