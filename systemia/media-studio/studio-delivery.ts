import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FallenTimelineProject } from './timeline.js';
import { renderTimelineExport, type TimelineExportReceipt } from './timeline-export.js';
import { assessStudioMaster } from './master-qc.js';

export type ClipDestination =
  | 'youtube'
  | 'facebook'
  | 'instagram'
  | 'linkedin'
  | 'tiktok';

export interface StudioDeliveryRequest {
  schema:'evercraft.fallen.studio-delivery-request.v1';
  id:string;
  slug:string;
  project:FallenTimelineProject;
  destinations:ClipDestination[];
  metadata:{
    title:string;
    description?:string;
    tags?:string[];
    language?:string;
  };
  sourceApp?:string;
}

export interface ClipDeliveryManifest {
  schema:'evercraft.clip.media-intake.v1';
  deliveryId:string;
  sourceApp:'fallen';
  sourceProjectId:string;
  sourceProjectVersion:number;
  state:'ready_for_clip_intake';
  media:{
    path:string;
    sha256:string;
    sizeBytes:number;
    width:number;
    height:number;
    fps:number;
    durationSec:number;
    videoCodec?:string;
    audioCodec?:string;
  };
  captions:Array<{
    assetId:string;
    path:string;
    sha256:string;
    sourceRefs:string[];
  }>;
  metadata:{
    title:string;
    description?:string;
    tags:string[];
    language?:string;
  };
  destinations:ClipDestination[];
  provenance:{
    inputAssetIds:string[];
    sourceRefs:string[];
    continuityDigests:string[];
    renderReceiptPath:string;
    masterQcReceiptPath:string;
  };
  boundaries:{
    publicationAuthorityGranted:false;
    platformCredentialsConsumed:false;
    platformPublishStateAsserted:false;
    downstreamClipGateRequired:true;
  };
  createdAt:string;
}

export interface StudioDeliveryReceipt {
  schema:'evercraft.fallen.studio-delivery-receipt.v1';
  deliveryId:string;
  outputDir:string;
  videoPath:string;
  renderReceiptPath:string;
  masterQcReceiptPath:string;
  clipManifestPath:string;
  mediaSha256:string;
  manifestSha256:string;
  state:'ready_for_clip_intake';
  publicationAuthorityGranted:false;
}

function hashFile(filePath:string){
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function safeSlug(value:string){
  const slug=value.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .slice(0,100);
  if(!slug) throw new Error('studio_delivery_slug_invalid');
  return slug;
}

function unique<T>(values:T[]){
  return [...new Set(values)];
}

function projectDuration(project:FallenTimelineProject){
  const ends=project.tracks.flatMap(track=>track.clips.map(clip=>clip.startSec+clip.durationSec));
  if(!ends.length) throw new Error('studio_delivery_empty_timeline');
  return Math.max(...ends);
}

function captionAssets(project:FallenTimelineProject){
  const ids=new Set(
    project.tracks
      .filter(track=>track.kind==='captions')
      .flatMap(track=>track.clips.map(clip=>clip.assetId))
  );
  return project.assets.filter(asset=>ids.has(asset.id));
}

function validateRequest(request:StudioDeliveryRequest){
  if(request.schema!=='evercraft.fallen.studio-delivery-request.v1'){
    throw new Error('studio_delivery_schema_invalid');
  }
  if(!request.id?.trim()) throw new Error('studio_delivery_id_missing');
  if(!request.metadata?.title?.trim()) throw new Error('studio_delivery_title_missing');
  if(!request.destinations?.length) throw new Error('studio_delivery_destinations_missing');
  const allowed=new Set<ClipDestination>([
    'youtube','facebook','instagram','linkedin','tiktok'
  ]);
  for(const destination of request.destinations){
    if(!allowed.has(destination)) throw new Error('studio_delivery_destination_invalid:'+destination);
  }
}

export function buildClipDeliveryManifest(input:{
  request:StudioDeliveryRequest;
  renderReceipt:TimelineExportReceipt;
  renderReceiptPath:string;
  masterQcReceiptPath:string;
}):ClipDeliveryManifest{
  validateRequest(input.request);
  const project=input.request.project;
  if(input.renderReceipt.projectId!==project.id){
    throw new Error('studio_delivery_render_project_mismatch');
  }
  if(input.renderReceipt.projectVersion!==project.version){
    throw new Error('studio_delivery_render_version_mismatch');
  }

  const captions=captionAssets(project).map(asset=>({
    assetId:asset.id,
    path:path.resolve(asset.path),
    sha256:asset.digest,
    sourceRefs:[...asset.sourceRefs],
  }));

  const sourceRefs=unique(project.assets.flatMap(asset=>asset.sourceRefs));
  const continuityDigests=unique(
    project.assets.map(asset=>asset.continuityDigest).filter((value):value is string=>Boolean(value))
  );

  return {
    schema:'evercraft.clip.media-intake.v1',
    deliveryId:input.request.id,
    sourceApp:'fallen',
    sourceProjectId:project.id,
    sourceProjectVersion:project.version,
    state:'ready_for_clip_intake',
    media:{
      path:input.renderReceipt.outputPath,
      sha256:input.renderReceipt.sha256,
      sizeBytes:input.renderReceipt.sizeBytes,
      width:input.renderReceipt.width,
      height:input.renderReceipt.height,
      fps:input.renderReceipt.fps,
      durationSec:input.renderReceipt.durationSec,
      videoCodec:input.renderReceipt.videoCodec,
      audioCodec:input.renderReceipt.audioCodec,
    },
    captions,
    metadata:{
      title:input.request.metadata.title.trim(),
      description:input.request.metadata.description?.trim()||undefined,
      tags:unique((input.request.metadata.tags??[]).map(tag=>tag.trim()).filter(Boolean)),
      language:input.request.metadata.language?.trim()||undefined,
    },
    destinations:unique(input.request.destinations),
    provenance:{
      inputAssetIds:[...input.renderReceipt.inputAssetIds],
      sourceRefs,
      continuityDigests,
      renderReceiptPath:path.resolve(input.renderReceiptPath),
      masterQcReceiptPath:path.resolve(input.masterQcReceiptPath),
    },
    boundaries:{
      publicationAuthorityGranted:false,
      platformCredentialsConsumed:false,
      platformPublishStateAsserted:false,
      downstreamClipGateRequired:true,
    },
    createdAt:new Date().toISOString(),
  };
}

export function finalizeStudioDelivery(input:{
  request:StudioDeliveryRequest;
  outputDir:string;
}):StudioDeliveryReceipt{
  validateRequest(input.request);
  const slug=safeSlug(input.request.slug);
  const outputDir=path.resolve(input.outputDir);
  fs.mkdirSync(outputDir,{recursive:true});

  const videoPath=path.join(outputDir,slug+'.mp4');
  const renderReceiptPath=path.join(outputDir,slug+'.render-receipt.json');
  const masterQcReceiptPath=path.join(outputDir,slug+'.master-qc.json');
  const clipManifestPath=path.join(outputDir,slug+'.clip-intake.json');

  const renderReceipt=renderTimelineExport({
    project:input.request.project,
    outputPath:videoPath,
  });
  fs.writeFileSync(
    renderReceiptPath,
    JSON.stringify(renderReceipt,null,2)+'\n',
    'utf8',
  );

  const masterQc=assessStudioMaster({
    filePath:videoPath,
    expectedSha256:renderReceipt.sha256,
    policy:{expectedDurationSec:projectDuration(input.request.project)},
  });
  fs.writeFileSync(
    masterQcReceiptPath,
    JSON.stringify(masterQc,null,2)+'\n',
    'utf8',
  );
  if(masterQc.status!=='accepted'){
    throw new Error('studio_delivery_master_qc_rejected:'+masterQc.reasons.join('|'));
  }

  const manifest=buildClipDeliveryManifest({
    request:input.request,
    renderReceipt,
    renderReceiptPath,
    masterQcReceiptPath,
  });
  fs.writeFileSync(
    clipManifestPath,
    JSON.stringify(manifest,null,2)+'\n',
    'utf8',
  );

  const observedVideoDigest=hashFile(videoPath);
  if(observedVideoDigest!==renderReceipt.sha256){
    throw new Error('studio_delivery_video_digest_mismatch');
  }

  return {
    schema:'evercraft.fallen.studio-delivery-receipt.v1',
    deliveryId:input.request.id,
    outputDir,
    videoPath,
    renderReceiptPath,
    masterQcReceiptPath,
    clipManifestPath,
    mediaSha256:renderReceipt.sha256,
    manifestSha256:hashFile(clipManifestPath),
    state:'ready_for_clip_intake',
    publicationAuthorityGranted:false,
  };
}
