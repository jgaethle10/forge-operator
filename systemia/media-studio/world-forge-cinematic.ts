import crypto from 'node:crypto';
import {
  validateWorldForgeProject,
  worldForgeDigest,
  type WorldForgeProject,
  type WorldForgeRenderIntent,
} from './world-forge.js';

export interface WorldForgeCinematicShot {
  schema:'evercraft.fallen.world-forge-cinematic-shot.v1';
  id:string;
  projectId:string;
  projectVersion:number;
  projectDigest:string;
  cameraNodeId:string;
  cameraName:string;
  lensMm:number;
  frameRange:{start:number;end:number;fps:number};
  durationSec:number;
  output:{width:number;height:number;colorPipeline:'srgb'|'aces';transparentBackground:boolean};
  sceneRefs:string[];
  continuity:{
    worldDigest:string;
    cameraTransformDigest:string;
    assetDigests:string[];
  };
  downstream:{
    requiresRenderReceipt:true;
    requiresShotTournament:true;
    directTimelineMutationAllowed:false;
    directPublicationAuthority:false;
  };
  digest:string;
  createdAt:string;
}

function stable(value:unknown):unknown{
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value as Record<string,unknown>)
        .filter(([key])=>key!=='createdAt'&&key!=='digest')
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,item])=>[key,stable(item)])
    );
  }
  return value;
}

function digest(value:unknown){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function sceneRefs(project:WorldForgeProject){
  const refs=new Set<string>();
  for(const asset of project.assets){
    for(const ref of asset.sourceRefs) refs.add(ref);
  }
  for(const node of project.nodes){
    for(const ref of node.sourceRefs??[]) refs.add(ref);
  }
  return [...refs].sort();
}

function buildShot(
  project:WorldForgeProject,
  intent:WorldForgeRenderIntent,
  id:string,
):WorldForgeCinematicShot{
  const camera=project.nodes.find(node=>node.id===intent.cameraNodeId);
  if(!camera||camera.kind!=='camera'||!camera.camera){
    throw new Error(`world_forge_cinematic_camera_invalid:${intent.cameraNodeId}`);
  }

  const frames=intent.endFrame-intent.startFrame+1;
  const durationSec=frames/intent.fps;
  const projectDigest=worldForgeDigest(project);
  const assetDigests=project.assets
    .map(asset=>asset.digest)
    .filter((value):value is string=>Boolean(value))
    .sort();

  const shot:WorldForgeCinematicShot={
    schema:'evercraft.fallen.world-forge-cinematic-shot.v1',
    id,
    projectId:project.id,
    projectVersion:project.version,
    projectDigest,
    cameraNodeId:camera.id,
    cameraName:camera.name,
    lensMm:camera.camera.focalLengthMm??50,
    frameRange:{
      start:intent.startFrame,
      end:intent.endFrame,
      fps:intent.fps,
    },
    durationSec,
    output:{
      width:intent.width,
      height:intent.height,
      colorPipeline:intent.colorPipeline,
      transparentBackground:intent.transparentBackground===true,
    },
    sceneRefs:sceneRefs(project),
    continuity:{
      worldDigest:projectDigest,
      cameraTransformDigest:digest(camera.transform),
      assetDigests,
    },
    downstream:{
      requiresRenderReceipt:true,
      requiresShotTournament:true,
      directTimelineMutationAllowed:false,
      directPublicationAuthority:false,
    },
    digest:'',
    createdAt:new Date().toISOString(),
  };
  shot.digest=digest(shot);
  return shot;
}

export function buildWorldForgeCinematicShot(input:{
  project:WorldForgeProject;
  renderIntentId:string;
  shotId:string;
}){
  const validation=validateWorldForgeProject(input.project);
  if(validation.status!=='accepted'){
    throw new Error(`world_forge_cinematic_project_invalid:${validation.errors.join('|')}`);
  }
  const intent=input.project.renderIntents.find(item=>item.id===input.renderIntentId);
  if(!intent) throw new Error(`world_forge_cinematic_render_intent_missing:${input.renderIntentId}`);
  if(!input.shotId?.trim()) throw new Error('world_forge_cinematic_shot_id_missing');
  return buildShot(input.project,intent,input.shotId.trim());
}
