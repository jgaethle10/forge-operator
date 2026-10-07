import crypto from 'node:crypto';
import {
  validateAnimationComponent,
  type AnimationClip,
  type AnimationParameter,
  type AnimationStateDefinition,
  type AnimationTransitionDefinition,
  type SkeletalAnimationComponent,
  type SkeletalRig
} from './animation.js';

export type FallenAnimationRightsState=
  | 'owned'
  | 'licensed'
  | 'public_domain'
  | 'restricted'
  | 'unknown';

export interface FallenAnimationProvenance {
  sourceRef:string;
  rightsState:FallenAnimationRightsState;
  license:string;
  attribution?:string;
}

export interface FallenAnimationAsset {
  schema:'evercraft.fallen.animation.v1';
  id:string;
  coordinateSystem:'right_handed_y_up';
  units:'meters';
  rotationUnits:'degrees';
  rig:SkeletalRig;
  clips:AnimationClip[];
  states:AnimationStateDefinition[];
  initialState:string;
  transitions:AnimationTransitionDefinition[];
  parameters?:Record<string,AnimationParameter>;
  provenance:FallenAnimationProvenance;
}

export interface FallenAnimationImportReceipt {
  schema:'evercraft.world-engine.fallen-animation-import.v1';
  sourceAssetId:string;
  sourceDigest:string;
  sourceRef:string;
  rightsState:FallenAnimationRightsState;
  license:string;
  provenanceDigest:string;
  componentDigest:string;
  rigId:string;
  boneCount:number;
  clipCount:number;
  trackCount:number;
  eventCount:number;
  stateCount:number;
  transitionCount:number;
  coordinateSystem:'right_handed_y_up';
  units:'meters';
  rotationUnits:'degrees';
  retargeting:'none';
  digest:string;
}

export interface FallenAnimationImportResult {
  component:SkeletalAnimationComponent;
  receipt:FallenAnimationImportReceipt;
}

function clone<T>(value:T):T{
  return structuredClone(value);
}

function stable(value:unknown):unknown{
  if(Array.isArray(value)) return value.map(stable);
  if(value && typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value as Record<string,unknown>)
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,item])=>[key,stable(item)])
    );
  }
  return value;
}

function digest(value:unknown){
  return crypto.createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex');
}

function safeId(value:string,label:string){
  const id=String(value||'').trim();
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,255}$/.test(id)){
    throw new Error(`fallen_animation_${label}_invalid`);
  }
  return id;
}

function validateProvenance(provenance:FallenAnimationProvenance){
  if(!String(provenance?.sourceRef||'').trim()){
    throw new Error('fallen_animation_provenance_source_missing');
  }
  if(!['owned','licensed','public_domain','restricted','unknown'].includes(
    provenance?.rightsState
  )){
    throw new Error('fallen_animation_provenance_rights_invalid');
  }
  if(!String(provenance?.license||'').trim()){
    throw new Error('fallen_animation_provenance_license_missing');
  }
  return true;
}

function canonicalRig(rig:SkeletalRig):SkeletalRig{
  return {
    id:rig.id,
    bones:[...rig.bones]
      .sort((a,b)=>a.id.localeCompare(b.id))
      .map(clone)
  };
}

function canonicalClip(clip:AnimationClip):AnimationClip{
  return {
    ...clone(clip),
    tracks:[...(clip.tracks || [])]
      .sort((a,b)=>a.boneId.localeCompare(b.boneId))
      .map(clone),
    events:clip.events
      ? [...clip.events]
          .sort((a,b)=>a.timeSec-b.timeSec || a.id.localeCompare(b.id))
          .map(clone)
      : undefined
  };
}

function canonicalParameters(
  parameters:Record<string,AnimationParameter>|undefined
){
  if(!parameters) return undefined;
  return Object.fromEntries(
    Object.entries(parameters)
      .sort(([a],[b])=>a.localeCompare(b))
      .map(([key,value])=>[key,clone(value)])
  );
}

export function animationFromFallenAsset(
  asset:FallenAnimationAsset
):FallenAnimationImportResult{
  if(asset?.schema!=='evercraft.fallen.animation.v1'){
    throw new Error('fallen_animation_schema_invalid');
  }
  safeId(asset.id,'id');
  if(asset.coordinateSystem!=='right_handed_y_up'){
    throw new Error('fallen_animation_coordinate_system_unsupported');
  }
  if(asset.units!=='meters'){
    throw new Error('fallen_animation_units_unsupported');
  }
  if(asset.rotationUnits!=='degrees'){
    throw new Error('fallen_animation_rotation_units_unsupported');
  }
  validateProvenance(asset.provenance);

  const component:SkeletalAnimationComponent={
    schema:'evercraft.world-engine.animation.v1',
    rig:canonicalRig(asset.rig),
    clips:[...(asset.clips || [])]
      .sort((a,b)=>a.id.localeCompare(b.id))
      .map(canonicalClip),
    states:[...(asset.states || [])]
      .sort((a,b)=>a.id.localeCompare(b.id))
      .map(clone),
    initialState:asset.initialState,
    transitions:[...(asset.transitions || [])]
      .sort((a,b)=>a.id.localeCompare(b.id))
      .map(clone),
    parameters:canonicalParameters(asset.parameters)
  };

  validateAnimationComponent(component);

  const sourceDigest=digest(asset);
  const provenanceDigest=digest(asset.provenance);
  const componentDigest=digest(component);
  const trackCount=component.clips
    .reduce((sum,clip)=>sum+clip.tracks.length,0);
  const eventCount=component.clips
    .reduce((sum,clip)=>sum+(clip.events?.length || 0),0);

  const core:Omit<FallenAnimationImportReceipt,'digest'>={
    schema:'evercraft.world-engine.fallen-animation-import.v1',
    sourceAssetId:asset.id,
    sourceDigest,
    sourceRef:asset.provenance.sourceRef,
    rightsState:asset.provenance.rightsState,
    license:asset.provenance.license,
    provenanceDigest,
    componentDigest,
    rigId:component.rig.id,
    boneCount:component.rig.bones.length,
    clipCount:component.clips.length,
    trackCount,
    eventCount,
    stateCount:component.states.length,
    transitionCount:component.transitions.length,
    coordinateSystem:'right_handed_y_up' as const,
    units:'meters' as const,
    rotationUnits:'degrees' as const,
    retargeting:'none' as const
  };

  return {
    component,
    receipt:{...core,digest:digest(core)}
  };
}

export function verifyFallenAnimationImportReceipt(
  receipt:FallenAnimationImportReceipt
){
  if(
    receipt?.schema!==
    'evercraft.world-engine.fallen-animation-import.v1'
  ){
    return false;
  }
  const {digest:claimed,...core}=receipt;
  return typeof claimed==='string' && claimed===digest(core);
}
