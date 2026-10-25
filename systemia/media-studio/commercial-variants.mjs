#!/usr/bin/env node
// Generate three independent customer-commercial edits and human-review packs.
// Strictly no generation/provider calls, customer publishing or automatic artistic approval.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {compileApprovedCommercial} from './commercial-assembly.mjs';
import {finalizeStudioDelivery} from './studio-delivery.ts';

const FORMAT_ORDER=['16:9','1:1','9:16'];
const FORMAT_DIRS={'16:9':'horizontal-16x9','1:1':'square-1x1','9:16':'vertical-9x16'};
function digest(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function run(binary,args){
  const r=spawnSync(binary,args,{encoding:'utf8',maxBuffer:2*1024*1024});
  if(r.error||r.status!==0)throw new Error('commercial_variant_'+binary+'_failed:'+String(r.error?.message||r.stderr).slice(-500));
}
function safeFocus(value,label){
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1){
    throw new Error('commercial_variant_focus_invalid:'+label);
  }
  return value;
}
function validateShotFraming(shot,scene,format){
  if(shot?.sceneId!==scene.id)throw new Error('commercial_variant_scene_order_mismatch:'+format+':'+scene.id);
  if(!Array.isArray(shot.reviewRefs)||!shot.reviewRefs.length||shot.reviewRefs.some(x=>!String(x).trim()))
    throw new Error('commercial_variant_framing_review_missing:'+format+':'+scene.id);
  return {sceneId:scene.id,focalX:safeFocus(shot.focalX,scene.id+':x'),
    focalY:safeFocus(shot.focalY,scene.id+':y'),reviewRefs:[...new Set(shot.reviewRefs)]};
}
export function compileCommercialVariantBatch(batch){
  if(batch?.schema!=='evercraft.fallen.commercial-variant-batch.v1')
    throw new Error('commercial_variant_batch_schema_invalid');
  const assembly=batch.assembly;
  if(!assembly?.brief?.scenes?.length)throw new Error('commercial_variant_brief_missing');
  if(!FORMAT_ORDER.every(x=>assembly.brief.formats.includes(x)))
    throw new Error('commercial_variant_brief_formats_incomplete');
  const rows=[];
  for(const format of FORMAT_ORDER){
    const decisions=batch.framing?.[format];
    if(!Array.isArray(decisions)||decisions.length!==assembly.brief.scenes.length)
      throw new Error('commercial_variant_framing_incomplete:'+format);
    const foci=decisions.map((shot,i)=>validateShotFraming(shot,assembly.brief.scenes[i],format));
    const compiled=compileApprovedCommercial({...assembly,format});
    const picture=compiled.deliveryRequest.project.tracks.find(track=>track.kind==='video');
    if(!picture || picture.clips.length!==foci.length)
      throw new Error('commercial_variant_picture_count_mismatch:'+format);
    picture.clips.forEach((clip,i)=>{
      clip.focalX=foci[i].focalX;clip.focalY=foci[i].focalY;
    });
    const {width,height}={
      '16:9':{width:1920,height:1080},
      '1:1':{width:1080,height:1080},
      '9:16':{width:1080,height:1920}
    }[format];
    rows.push({format,folder:FORMAT_DIRS[format],width,height,
      assembly:{...assembly,format},compiled,framing:foci});
  }
  const digests=new Set(rows.map(row=>row.compiled.sourceFirstPlanDigest));
  if(digests.size!==1)throw new Error('commercial_variant_story_identity_mismatch');
  const base=rows[0].compiled.deliveryRequest.project.tracks;
  const signature=tracks=>JSON.stringify(tracks.filter(t=>t.kind!=='video').map(t=>({
    kind:t.kind,assets:t.clips.map(c=>c.assetId),timing:t.clips.map(c=>[c.startSec,c.durationSec])
  })));
  if(rows.some(row=>signature(row.compiled.deliveryRequest.project.tracks)!==signature(base)))
    throw new Error('commercial_variant_soundtrack_identity_mismatch');
  return {schema:'evercraft.fallen.commercial-variant-plan.v1',
    status:'framing_plan_ready_no_video_rendered',sourceFirstPlanDigest:rows[0].compiled.sourceFirstPlanDigest,
    durationSec:rows[0].compiled.durationSec,formats:rows,publicationAuthorityGranted:false};
}
function reviewFrames(video,scenes,outDir){
  const result=[];
  fs.mkdirSync(outDir,{recursive:true});
  for(const [i,scene] of scenes.entries()){
    const t=Math.min(scene.startSec+scene.durationSec*.5,scene.startSec+scene.durationSec-0.08);
    const filename='shot-'+String(i+1).padStart(2,'0')+'-'+scene.id.replace(/[^a-zA-Z0-9_-]/g,'_')+'.jpg';
    const out=path.join(outDir,filename);
    run('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-y','-ss',String(Math.max(0,t)),
      '-i',video,'-frames:v','1','-q:v','3','-vf','scale=640:-2',out]);
    if(!fs.existsSync(out)||fs.statSync(out).size<1000)throw new Error('commercial_variant_review_frame_invalid:'+scene.id);
    result.push({sceneId:scene.id,timeSec:Number(t.toFixed(3)),path:out,sha256:digest(out),
      status:'needs_human_picture_review'});
  }
  return result;
}
export function renderCommercialVariantBatch(batch,outputRoot){
  const plan=compileCommercialVariantBatch(batch);
  const root=path.resolve(outputRoot);
  if(fs.existsSync(root))throw new Error('commercial_variant_output_exists');
  fs.mkdirSync(root,{recursive:true});
  const variants=[];
  for(const row of plan.formats){
    const dir=path.join(root,row.folder);
    // Reuse the exact ready-to-render project with reviewed, per-scene focal coordinates.
    const request=row.compiled.deliveryRequest;
    const output=renderCompiledVariant(request,dir);
    const frames=reviewFrames(output.videoPath,batch.assembly.brief.scenes,path.join(dir,'review-frames'));
    if(output.qualityMode!=='commercial')throw new Error('commercial_variant_wrong_quality_mode');
    variants.push({format:row.format,width:row.width,height:row.height,
      durationSec:output.durationSec,
      videoPath:output.videoPath,sha256:output.sha256,clipManifestPath:output.clipManifestPath,
      audioQcReceiptPath:output.audioQcReceiptPath,framing:row.framing,reviewFrames:frames,
      reviewState:'pending_independent_customer_quality_review'});
  }
  if(variants.some(v=>Math.abs(v.durationSec-plan.durationSec)>0.15))
    throw new Error('commercial_variant_render_timing_mismatch');
  if(new Set(variants.map(v=>v.sha256)).size!==FORMAT_ORDER.length)
    throw new Error('commercial_variant_encodes_not_distinct');
  const receipt={schema:'evercraft.fallen.commercial-variant-proof-pack.v1',
    sourceFirstPlanDigest:plan.sourceFirstPlanDigest,
    durationSec:plan.durationSec,variants,
    humanReviewRequirements:['watch_all_three_full_masters','inspect_every_framing_capture',
      'listen_to_actual_encoded_voice_music_sfx','confirm_captions_safe_area_per_platform',
      'confirm_source_rights_and_client_claims','approve_final_client_delivery'],
    releaseState:'blocked_pending_human_review',humanApproved:false,
    customerPublished:false,publicationAuthorityGranted:false,
    builtAt:new Date().toISOString()};
  fs.writeFileSync(path.join(root,'variant-review-pack.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  return receipt;
}
function renderCompiledVariant(request,dir){
  const result=finalizeStudioDelivery({request,outputDir:dir});
  const manifest=JSON.parse(fs.readFileSync(result.clipManifestPath,'utf8'));
  if(manifest.media.sha256!==result.mediaSha256 || manifest.media.path!==result.videoPath)
    throw new Error('commercial_variant_manifest_not_bound');
  if(!manifest.boundaries.commercialAudioQcRequired)
    throw new Error('commercial_variant_audio_qc_not_enforced');
  return {
    videoPath:result.videoPath,sha256:result.mediaSha256,qualityMode:result.qualityMode,
    durationSec:manifest.media.durationSec,clipManifestPath:result.clipManifestPath,
    audioQcReceiptPath:result.commercialAudioQcReceiptPath
  };
}
function main(){
  const [inputFile,root,mode]=process.argv.slice(2);
  if(!inputFile||!root||!['plan','render'].includes(mode))
    throw new Error('usage: commercial-variants.mjs <batch.json> <new-output-dir> plan|render');
  const payload=JSON.parse(fs.readFileSync(inputFile,'utf8'));
  if(mode==='plan'){
    const plan=compileCommercialVariantBatch(payload);
    fs.mkdirSync(root,{recursive:true});
    const serializable={...plan,formats:plan.formats.map(({compiled,assembly,...v})=>({
      ...v,project:compiled.deliveryRequest.project
    }))};
    fs.writeFileSync(path.join(root,'commercial-variant-plan.json'),JSON.stringify(serializable,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({status:plan.status,formats:plan.formats.map(x=>x.format)},null,2));
  }else{
    const result=renderCommercialVariantBatch(payload,root);
    console.log(JSON.stringify({status:result.releaseState,variants:result.variants.map(x=>({format:x.format,sha256:x.sha256}))},null,2));
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{main();}catch(e){console.error(e.stack||String(e));process.exitCode=2;}
}
