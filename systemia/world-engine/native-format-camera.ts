/**
 * Native 3D camera composition in three aspect ratios.
 * No image crop/letterbox: each viewport has a distinct real-world
 * camera path compiled through the existing World Engine + WebGPU plan.
 * Film is synthetic and review-only. This is an optical staging contract,
 * not an AI subject tracking or production-grade feature-detection claim.
 */
import type {CinematicCameraTake,CinematicCameraSequence} from './cinematic-rig.js';
import {buildCinematicCameraSequence} from './cinematic-rig.js';
import type {WorldDefinition,Vec3} from './engine.js';
import type {GeometryAsset} from './webgpu.js';
import type {TextureAsset} from './texture.js';
import {autoFitOrbitCamera,type AutoFitReceipt} from './optical-autofit.js';

export type NativeFilmFormat='wide'|'square'|'vertical';
export interface NativeFrameSpec{
  format:NativeFilmFormat;
  viewport:{width:number;height:number};
  cameraTake:CinematicCameraTake;
  cameraSource:'new_3d_camera_plan_not_post_crop';
  sourceResolutionDerivedFromTargetViewport:true;
  publishAuthority:false;
}
export interface ProjectedLandmark{
  id:string;
  x:number;
  y:number;
  clipDepth:number;
  inPicture:boolean;
}
export interface NativeCompositionReview{
  format:NativeFilmFormat;
  landmarks:ProjectedLandmark[];
  visibleSubjectLandmarks:number;
  bounds:{left:number;right:number;top:number;bottom:number};
  warning:string|null;
  publicationAuthority:false;
}
const formatError=(msg:string):never=>{throw Error('world_native_camera_'+msg);};
const specs:Record<NativeFilmFormat,{viewport:[number,number],radius:number,start:number,end:number,height0:number,height1:number,fov0:number,fov1:number}>={
  wide:{viewport:[640,360],radius:36,start:-59,end:-22,height0:7.2,height1:5.3,fov0:44,fov1:40},
  square:{viewport:[480,480],radius:42,start:-39,end:-12,height0:8.2,height1:6.0,fov0:44,fov1:40},
  vertical:{viewport:[360,640],radius:48,start:-22,end:-7,height0:7.2,height1:5.1,fov0:43,fov1:39}
};
export function composeNativeBattleshipCamera(format:NativeFilmFormat):NativeFrameSpec{
  if(!Object.hasOwn(specs,format))formatError('format_unsupported');
  const s=specs[format];
  const take:CinematicCameraTake={
    schema:'evercraft.world-engine.cinematic-camera-take.v1',
    id:'battleship-native-'+format,
    cameraEntityId:'cinema-camera',
    targetEntityId:'ship-hull',
    durationSec:4,
    fps:24,
    move:'orbit',
    ease:'smootherstep',
    orbit:{
      radius:s.radius,startAngleDeg:s.start,endAngleDeg:s.end,
      startHeight:s.height0,endHeight:s.height1
    },
    lookAtOffset:{x:0,y:4,z:0},
    startFovYDeg:s.fov0,endFovYDeg:s.fov1
  };
  return {format,viewport:{width:s.viewport[0],height:s.viewport[1]},
    cameraTake:take,cameraSource:'new_3d_camera_plan_not_post_crop',
    sourceResolutionDerivedFromTargetViewport:true,publishAuthority:false};
}
// Grounded to canonical procedural battleship scene with actual World Engine
// entity transforms: visible hull edges + high mast. Not all ocean pixels.
export const BATTLESHIP_STAGING_LANDMARKS=[
  {id:'bow',point:{x:0,y:2,z:17.8}},
  {id:'stern',point:{x:0,y:2,z:-18}},
  {id:'port',point:{x:-4.6,y:2,z:0}},
  {id:'starboard',point:{x:4.6,y:2,z:0}},
  {id:'bridge',point:{x:0,y:6,z:-5.5}},
  {id:'mast',point:{x:0,y:11.9,z:-6.5}}
] as const;
function project(matrix:number[],point:Vec3):{x:number;y:number;z:number;w:number}{
  if(matrix.length!==16||matrix.some(n=>!Number.isFinite(n)))formatError('vp_matrix_invalid');
  const {x,y,z}=point;
  const w=matrix[3]*x+matrix[7]*y+matrix[11]*z+matrix[15];
  if(!Number.isFinite(w)||Math.abs(w)<1e-7)formatError('projection_divide_zero');
  return {
    x:(matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12])/w,
    y:(matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13])/w,
    z:(matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14])/w,
    w
  };
}
export function auditNativeSubjectComposition(
  format:NativeFilmFormat,viewProjectionMatrix:number[],
  landmarks:ReadonlyArray<{id:string;point:Vec3}>=BATTLESHIP_STAGING_LANDMARKS
):NativeCompositionReview {
  if(!Object.hasOwn(specs,format))formatError('format_unsupported');
  if(!Array.isArray(landmarks)||landmarks.length<3||landmarks.length>40)
    formatError('landmarks_invalid');
  const ids=new Set<string>();
  const projected=landmarks.map(l=>{
    if(typeof l.id!=='string'||ids.has(l.id)||!l.id.trim())formatError('duplicate_landmark');
    ids.add(l.id);
    for(const axis of ['x','y','z'] as const){
      if(!Number.isFinite(l.point?.[axis]))formatError('landmark_not_finite');
    }
    const screen=project(viewProjectionMatrix,l.point);
    const inPicture=screen.w>0&&screen.z>=0&&screen.z<=1&&
      Math.abs(screen.x)<=1&&Math.abs(screen.y)<=1;
    return {id:l.id,x:screen.x,y:screen.y,clipDepth:screen.z,inPicture};
  });
  const visible=projected.filter(p=>p.inPicture).length;
  const left=Math.min(...projected.map(p=>p.x)),right=Math.max(...projected.map(p=>p.x));
  const top=Math.max(...projected.map(p=>p.y)),bottom=Math.min(...projected.map(p=>p.y));
  // Pixel-free scene framing sanity guard, not a full visual quality score.
  const warning=visible<landmarks.length?'important_subject_landmarks_outside_frame'
    :right-left<.2?'subject_occupancy_too_small_for_review'
    :null;
  return {
    format,landmarks:projected,visibleSubjectLandmarks:visible,
    bounds:{left,right,top,bottom},warning,publicationAuthority:false
  };
}
export function makeNativeBattleshipSequence(input:{
  world:WorldDefinition;
  geometries:GeometryAsset[];
  textures?:TextureAsset[];
  format:NativeFilmFormat;
  overrideTake?:CinematicCameraTake;
}):{spec:NativeFrameSpec;sequence:CinematicCameraSequence;review:NativeCompositionReview[];autoFit:AutoFitReceipt|null}{
  const spec=composeNativeBattleshipCamera(input.format);
  const autoFit=input.overrideTake?null:autoFitOrbitCamera({
    world:input.world,
    take:spec.cameraTake,
    geometries:input.geometries,
    textures:input.textures,
    viewport:spec.viewport,
    subject:{id:'battleship-hero',entityIds:['ship-hull','bridge-house','mast-main']}
  });
  const sequence=buildCinematicCameraSequence({
    world:input.world,
    take:input.overrideTake??autoFit?.take??spec.cameraTake,
    geometries:input.geometries,
    textures:input.textures??[],
    viewport:spec.viewport
  });
  const review=[
    auditNativeSubjectComposition(input.format,sequence.frames[0].renderPlan.viewProjectionMatrix),
    auditNativeSubjectComposition(input.format,sequence.frames[Math.floor((sequence.frames.length-1)/2)].renderPlan.viewProjectionMatrix),
    auditNativeSubjectComposition(input.format,sequence.frames.at(-1)!.renderPlan.viewProjectionMatrix)
  ];
  return {spec,sequence,review,autoFit:autoFit?.receipt??null};
}
