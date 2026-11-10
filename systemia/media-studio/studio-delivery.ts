import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FallenTimelineProject } from './timeline.js';
import {
  validateNarrativeFilmAdmissionForProject,
  type NarrativeFilmAdmissionReceipt,
} from './narrative-film-admission.js';
import { renderTimelineExport, type TimelineExportReceipt } from './timeline-export.js';
import { assessStudioMaster } from './master-qc.js';
import { auditCommercialAudio, masterCommercialAudio } from './commercial-audio-lab.mjs';

export type ClipDestination =
  | 'youtube'
  | 'facebook'
  | 'instagram'
  | 'linkedin'
  | 'tiktok';

export type StudioQualityMode='standard'|'narrative_film'|'commercial';

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
  qualityMode?:StudioQualityMode;
  narrativeFilmAdmission?:NarrativeFilmAdmissionReceipt;
  commercialAudioFinishing?:'none'|'two_pass';
  // Explicit technical dynamics floor; opt-in only for cinematic commercials.
  commercialAudioMinLraLu?:number;
}

export interface ClipDeliveryManifest {
  schema:'evercraft.clip.media-intake.v1';
  deliveryId:string;
  sourceApp:'fallen';
  sourceProjectId:string;
  sourceProjectVersion:number;
  qualityMode:StudioQualityMode;
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
    commercialAudioQcReceiptPath?:string;
    commercialAudioMasterReceiptPath?:string;
    narrativeFilmAdmissionDigest?:string;
  };
  boundaries:{
    publicationAuthorityGranted:false;
    platformCredentialsConsumed:false;
    platformPublishStateAsserted:false;
    downstreamClipGateRequired:true;
    narrativeFilmAdmissionRequired:boolean;
    commercialAudioQcRequired:boolean;
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
  commercialAudioQcReceiptPath?:string;
  commercialAudioMasterReceiptPath?:string;
  clipManifestPath:string;
  mediaSha256:string;
  manifestSha256:string;
  state:'ready_for_clip_intake';
  qualityMode:StudioQualityMode;
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
  const qualityMode=request.qualityMode??'standard';
  if(qualityMode!=='standard'&&qualityMode!=='narrative_film'&&qualityMode!=='commercial'){
    throw new Error('studio_delivery_quality_mode_invalid');
  }
  if(request.commercialAudioFinishing && request.commercialAudioFinishing!=='none' &&
     request.commercialAudioFinishing!=='two_pass'){
    throw new Error('studio_delivery_commercial_audio_finishing_invalid');
  }
  if(request.commercialAudioFinishing==='two_pass'&&qualityMode!=='commercial'){
    throw new Error('studio_delivery_commercial_audio_finishing_requires_commercial_mode');
  }
  if(request.commercialAudioMinLraLu!==undefined &&
     (qualityMode!=='commercial' || !Number.isFinite(request.commercialAudioMinLraLu) ||
      request.commercialAudioMinLraLu<0 || request.commercialAudioMinLraLu>20)){
    throw new Error('studio_delivery_commercial_dynamics_policy_invalid');
  }
  if(qualityMode==='narrative_film'){
    const validation=validateNarrativeFilmAdmissionForProject({
      project:request.project,
      admission:request.narrativeFilmAdmission,
    });
    if(validation.status!=='accepted'){
      throw new Error(
        'studio_delivery_narrative_film_admission_rejected:'+validation.reasons.join('|')
      );
    }
  }
}

export function buildClipDeliveryManifest(input:{
  request:StudioDeliveryRequest;
  renderReceipt:TimelineExportReceipt;
  renderReceiptPath:string;
  masterQcReceiptPath:string;
  commercialAudioQcReceiptPath?:string;
  commercialAudioMasterReceiptPath?:string;
}):ClipDeliveryManifest{
  validateRequest(input.request);
  const project=input.request.project;
  if(input.renderReceipt.projectId!==project.id){
    throw new Error('studio_delivery_render_project_mismatch');
  }
  if(input.renderReceipt.projectVersion!==project.version){
    throw new Error('studio_delivery_render_version_mismatch');
  }
  // Commercial Clip intake must carry measured QC for these precise encoded bytes.
  if(input.request.qualityMode==='commercial'){
    if(!input.commercialAudioQcReceiptPath) throw new Error('studio_delivery_commercial_audio_qc_missing');
    if(!fs.existsSync(input.commercialAudioQcReceiptPath)){
      throw new Error('studio_delivery_commercial_audio_qc_receipt_missing');
    }
    const audioQc=JSON.parse(fs.readFileSync(input.commercialAudioQcReceiptPath,'utf8')) as {
      schema?:string;status?:string;sha256?:string;path?:string;
      policy?:{minLraLu?:number};measurements?:{loudnessRangeLu?:number|null};
    };
    if(audioQc.schema!=='evercraft.fallen.commercial-audio-qc.v1' ||
       audioQc.status!=='accepted' ||
       audioQc.sha256!==input.renderReceipt.sha256 ||
       path.resolve(String(audioQc.path||''))!==path.resolve(input.renderReceipt.outputPath)){
      throw new Error('studio_delivery_commercial_audio_qc_unbound_or_rejected');
    }
    if((input.request.commercialAudioMinLraLu??0)>0 &&
       (audioQc.policy?.minLraLu!==input.request.commercialAudioMinLraLu ||
        !Number.isFinite(audioQc.measurements?.loudnessRangeLu) ||
        Number(audioQc.measurements?.loudnessRangeLu)<input.request.commercialAudioMinLraLu)){
      throw new Error('studio_delivery_cinematic_audio_dynamics_not_verified');
    }
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
    qualityMode:input.request.qualityMode??'standard',
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
      commercialAudioQcReceiptPath:input.commercialAudioQcReceiptPath?path.resolve(input.commercialAudioQcReceiptPath):undefined,
      commercialAudioMasterReceiptPath:input.commercialAudioMasterReceiptPath?path.resolve(input.commercialAudioMasterReceiptPath):undefined,
      narrativeFilmAdmissionDigest:input.request.narrativeFilmAdmission?.admissionDigest,
    },
    boundaries:{
      publicationAuthorityGranted:false,
      platformCredentialsConsumed:false,
      platformPublishStateAsserted:false,
      downstreamClipGateRequired:true,
      narrativeFilmAdmissionRequired:(input.request.qualityMode??'standard')==='narrative_film',
      commercialAudioQcRequired:input.request.qualityMode==='commercial',
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
  const commercialAudioQcReceiptPath=input.request.qualityMode==='commercial'?path.join(outputDir,slug+'.commercial-audio-qc.json'):undefined;
  const commercialAudioMasterReceiptPath=input.request.commercialAudioFinishing==='two_pass'?path.join(outputDir,slug+'.commercial-audio-master.json'):undefined;
  const clipManifestPath=path.join(outputDir,slug+'.clip-intake.json');

  const draftVideoPath=commercialAudioMasterReceiptPath?path.join(outputDir,slug+'.premaster.mp4'):videoPath;
  const preliminary=renderTimelineExport({
    project:input.request.project,
    outputPath:draftVideoPath,
  });
  let renderReceipt=preliminary;
  if(commercialAudioMasterReceiptPath){
    try{
      const finish=masterCommercialAudio({
        input:draftVideoPath,output:videoPath,expectedSha256:preliminary.sha256,
        ...(input.request.commercialAudioMinLraLu===undefined?{}:{standard:{minLraLu:input.request.commercialAudioMinLraLu}}),
      });
      fs.writeFileSync(commercialAudioMasterReceiptPath,JSON.stringify(finish,null,2)+'\n','utf8');
      renderReceipt={
        ...preliminary,
        outputPath:videoPath,
        sha256:finish.outputSha256,
        sizeBytes:fs.statSync(videoPath).size,
      };
    } finally {
      if(fs.existsSync(draftVideoPath))fs.rmSync(draftVideoPath,{force:true});
    }
  }
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

  // Technical audio acceptance is mandatory for the commercial quality mode.
  if(commercialAudioQcReceiptPath){
    const qc=auditCommercialAudio({input:videoPath,expectedSha256:renderReceipt.sha256,
      ...(input.request.commercialAudioMinLraLu===undefined?{}:{standard:{minLraLu:input.request.commercialAudioMinLraLu}})});
    fs.writeFileSync(commercialAudioQcReceiptPath,JSON.stringify(qc,null,2)+'\n','utf8');
    if(qc.status!=='accepted'){
      throw new Error('studio_delivery_commercial_audio_qc_rejected:'+qc.reasons.join('|'));
    }
  }

  const manifest=buildClipDeliveryManifest({
    request:input.request,
    renderReceipt,
    renderReceiptPath,
    masterQcReceiptPath,
    commercialAudioQcReceiptPath,
    commercialAudioMasterReceiptPath,
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
    commercialAudioQcReceiptPath,
    commercialAudioMasterReceiptPath,
    clipManifestPath,
    mediaSha256:renderReceipt.sha256,
    manifestSha256:hashFile(clipManifestPath),
    state:'ready_for_clip_intake',
    qualityMode:input.request.qualityMode??'standard',
    publicationAuthorityGranted:false,
  };
}
