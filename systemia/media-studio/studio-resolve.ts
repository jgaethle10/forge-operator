import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { admitProductionResult } from './production-runtime.js';
import {
  replaceTimelineClipAsset,
  type TimelineMutationReceipt,
} from './timeline.js';
import type { StudioDraftBundle, StudioCaptionCue } from './studio-create.js';
import type { ProductionRoute } from './departments.js';
import type {
  IdentityEvidence,
  ProductionAdmission,
  ProductionArtifact,
  ProductionReceipt,
  ShotSelectionReceipt,
} from './types.js';

export interface StudioResolutionItem {
  needId:string;
  route:ProductionRoute;
  artifact:ProductionArtifact;
  receipt:ProductionReceipt;
  sourceRefs:string[];
  identityEvidence?:IdentityEvidence[];
  selectionReceipt?:ShotSelectionReceipt;
}

export interface StudioResolutionResult {
  schema:'evercraft.fallen.studio-resolution.v1';
  status:'ready_for_export'|'partial'|'blocked';
  bundle:StudioDraftBundle;
  admissions:ProductionAdmission[];
  mutationReceipts:TimelineMutationReceipt[];
  remainingNeedIds:string[];
  captionAssetId?:string;
  boundaries:{
    visualGenerationRequiresTournamentSelection:true;
    productionAdmissionEnforced:true;
    captionTimingMaterializedDeterministically:true;
    outputDigestsPreserved:true;
    publicationAuthorityGranted:false;
  };
}

function hashFile(filePath:string){
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function cloneBundle(bundle:StudioDraftBundle):StudioDraftBundle{
  return JSON.parse(JSON.stringify(bundle)) as StudioDraftBundle;
}

function requireSelection(kind:string,item:StudioResolutionItem){
  if(kind==='video'||kind==='image'||kind==='lip_sync'){
    if(!item.selectionReceipt) throw new Error('studio_resolution_visual_selection_missing:'+item.needId);
    if(item.selectionReceipt.artifactDigest!==item.artifact.digest){
      throw new Error('studio_resolution_visual_selection_digest_mismatch:'+item.needId);
    }
  }
}

function timestamp(seconds:number){
  const ms=Math.max(0,Math.round(seconds*1000));
  const hours=Math.floor(ms/3_600_000);
  const minutes=Math.floor((ms%3_600_000)/60_000);
  const secs=Math.floor((ms%60_000)/1000);
  const millis=ms%1000;
  return [hours,minutes,secs].map(v=>String(v).padStart(2,'0')).join(':')+','+String(millis).padStart(3,'0');
}

export function captionsToSrt(cues:StudioCaptionCue[]){
  return [...cues]
    .sort((a,b)=>a.startSec-b.startSec||a.id.localeCompare(b.id))
    .map((cue,index)=>[
      String(index+1),
      timestamp(cue.startSec)+' --> '+timestamp(cue.endSec),
      cue.text.trim(),
      '',
    ].join('\n'))
    .join('\n')
    .trimEnd()+'\n';
}

function materializeCaptions(bundle:StudioDraftBundle,outputPath:string){
  const resolved=path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved),{recursive:true});
  fs.writeFileSync(resolved,captionsToSrt(bundle.captions),'utf8');
  const observedDigest=hashFile(resolved);
  const assetId='captions-'+observedDigest.slice(0,16);
  bundle.project.assets.push({
    id:assetId,
    path:resolved,
    digest:observedDigest,
    kind:'captions',
    sourceRefs:bundle.captions.map(cue=>'caption-cue:'+cue.id),
  });
  const duration=Math.max(...bundle.captions.map(cue=>cue.endSec),0);
  if(duration>0){
    bundle.project.tracks.push({
      id:'captions',
      kind:'captions',
      name:'Captions',
      clips:[{
        id:'captions-master',
        trackId:'captions',
        assetId,
        startSec:0,
        durationSec:duration,
        label:'Burned captions',
      }],
    });
  }
  return assetId;
}

export function resolveStudioDraft(input:{
  bundle:StudioDraftBundle;
  resolutions:StudioResolutionItem[];
  captionOutputPath?:string;
}):StudioResolutionResult{
  if(input.bundle.schema!=='evercraft.fallen.studio-draft-bundle.v1'){
    throw new Error('studio_resolution_bundle_schema_invalid');
  }
  const bundle=cloneBundle(input.bundle);
  const needs=new Map(bundle.productionNeeds.map(need=>[need.id,need] as const));
  const admissions:ProductionAdmission[]=[];
  const mutationReceipts:TimelineMutationReceipt[]=[];
  const resolvedIds=new Set<string>();

  for(const item of input.resolutions){
    const need=needs.get(item.needId);
    if(!need) throw new Error('studio_resolution_need_missing:'+item.needId);
    if(!item.sourceRefs?.length) throw new Error('studio_resolution_source_refs_missing:'+item.needId);
    if(item.receipt.needId!==item.needId) throw new Error('studio_resolution_receipt_need_mismatch:'+item.needId);
    requireSelection(need.kind,item);

    const admission=admitProductionResult({
      need,
      route:item.route,
      artifact:item.artifact,
      receipt:item.receipt,
      identityEvidence:item.identityEvidence,
      selectionReceipt:item.selectionReceipt,
    });
    admissions.push(admission);
    if(admission.status!=='accepted') continue;

    const placeholderId='asset-'+need.id;
    const clipIds=bundle.project.tracks.flatMap(track=>
      track.clips.filter(clip=>clip.assetId===placeholderId).map(clip=>clip.id)
    );
    if(!clipIds.length) throw new Error('studio_resolution_placeholder_clip_missing:'+need.id);

    const newAsset={
      id:'resolved-'+need.id+'-'+item.artifact.digest.slice(0,12),
      path:item.artifact.path,
      digest:item.artifact.digest,
      kind:item.artifact.kind,
      sourceRefs:[
        ...item.sourceRefs,
        'production-receipt:'+item.receipt.needId,
        ...(item.receipt.providerModel?['provider-model:'+item.receipt.providerModel]:[]),
        ...(item.receipt.providerRequestId?['provider-request:'+item.receipt.providerRequestId]:[]),
        ...(item.selectionReceipt?['shot-selection:'+item.selectionReceipt.tournamentReceiptDigest]:[]),
      ],
      evidenceState:(need.kind==='video'||need.kind==='image'||need.kind==='lip_sync')
        ?('synthetic_visualization' as const)
        :undefined,
      continuityDigest:need.continuityDigest,
    };

    for(const clipId of clipIds){
      const mutation=replaceTimelineClipAsset({
        project:bundle.project,
        clipId,
        newAsset,
        expectedVersion:bundle.project.version,
      });
      bundle.project=mutation.project;
      mutationReceipts.push(mutation.receipt);
    }
    resolvedIds.add(need.id);
  }

  const captionAssetId=input.captionOutputPath&&bundle.captions.length
    ?materializeCaptions(bundle,input.captionOutputPath)
    :undefined;

  const remainingNeedIds=bundle.productionNeeds
    .filter(need=>!resolvedIds.has(need.id))
    .map(need=>need.id);

  const rejected=admissions.some(item=>item.status==='rejected');
  const captionBlocked=bundle.captions.length>0&&!captionAssetId;
  const status:StudioResolutionResult['status']=
    rejected?'blocked':
    remainingNeedIds.length||captionBlocked?'partial':
    'ready_for_export';

  return {
    schema:'evercraft.fallen.studio-resolution.v1',
    status,
    bundle,
    admissions,
    mutationReceipts,
    remainingNeedIds,
    captionAssetId,
    boundaries:{
      visualGenerationRequiresTournamentSelection:true,
      productionAdmissionEnforced:true,
      captionTimingMaterializedDeterministically:true,
      outputDigestsPreserved:true,
      publicationAuthorityGranted:false,
    },
  };
}
