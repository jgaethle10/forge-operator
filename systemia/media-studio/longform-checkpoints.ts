import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { StudioMasterQcReceipt } from './master-qc.js';

export interface LongformSceneMaster {
  sceneId:string;
  actId:string;
  order:number;
  path:string;
  sha256:string;
  durationSec:number;
  continuityDigest:string;
  masterQc:StudioMasterQcReceipt;
}

export interface LongformProjectInput {
  schema:'evercraft.fallen.longform-project.v1';
  id:string;
  title:string;
  scenes:LongformSceneMaster[];
}

export interface LongformActPlan {
  actId:string;
  sceneIds:string[];
  inputDigests:string[];
  expectedDurationSec:number;
  technicalSignature:string;
  manifestDigest:string;
}

export interface LongformPlan {
  schema:'evercraft.fallen.longform-plan.v1';
  projectId:string;
  title:string;
  acts:LongformActPlan[];
  scenes:LongformSceneMaster[];
  technicalSignature:string;
  planDigest:string;
  boundaries:{
    sceneQcRequired:true;
    sceneDigestsVerified:true;
    technicalFormatMustMatch:true;
    checkpointReuseDigestBound:true;
    noSceneRegenerationAuthority:true;
    publicationAuthorityGranted:false;
  };
  createdAt:string;
}

export interface LongformCheckpointReceipt {
  schema:'evercraft.fallen.longform-checkpoint.v1';
  projectId:string;
  scope:'act'|'master';
  scopeId:string;
  manifestDigest:string;
  inputDigests:string[];
  outputPath:string;
  outputSha256:string;
  sizeBytes:number;
  durationSec:number;
  state:'rendered'|'reused';
  boundaries:{
    byteReuseRequiresExactManifest:true;
    inputSceneMastersImmutable:true;
    publicationAuthorityGranted:false;
  };
  createdAt:string;
}

export interface LongformRenderReceipt {
  schema:'evercraft.fallen.longform-render-receipt.v1';
  projectId:string;
  outputPath:string;
  outputSha256:string;
  actReceipts:LongformCheckpointReceipt[];
  masterCheckpoint:LongformCheckpointReceipt;
  reusedActCount:number;
  renderedActCount:number;
  publicationAuthorityGranted:false;
  completedAt:string;
}

function stable(value:unknown):unknown{
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value as Record<string,unknown>)
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,item])=>[key,stable(item)])
    );
  }
  return value;
}

function digest(value:unknown){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function hashFile(filePath:string){
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function run(binary:string,args:string[]){
  const result=spawnSync(binary,args,{encoding:'utf8',maxBuffer:64*1024*1024});
  if(result.error) throw new Error(binary+'_failed:'+result.error.message);
  if(result.status!==0){
    throw new Error(binary+'_failed:'+String(result.stderr||'').trim().slice(-1600));
  }
  return String(result.stdout||'');
}

function safe(value:string){
  const out=value.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,100);
  if(!out) throw new Error('longform_safe_id_invalid');
  return out;
}

function technicalSignature(scene:LongformSceneMaster){
  const m=scene.masterQc.measurements;
  return [
    m.videoCodec,
    m.audioCodec??'none',
    m.width+'x'+m.height,
    Number(m.fps.toFixed(3)),
  ].join('|');
}

function verifyScene(scene:LongformSceneMaster){
  if(!scene.sceneId?.trim()) throw new Error('longform_scene_id_missing');
  if(!scene.actId?.trim()) throw new Error('longform_act_id_missing:'+scene.sceneId);
  if(!Number.isInteger(scene.order)||scene.order<0) throw new Error('longform_scene_order_invalid:'+scene.sceneId);
  if(!Number.isFinite(scene.durationSec)||scene.durationSec<=0) throw new Error('longform_scene_duration_invalid:'+scene.sceneId);
  if(!scene.continuityDigest?.trim()) throw new Error('longform_continuity_digest_missing:'+scene.sceneId);
  if(!fs.existsSync(scene.path)) throw new Error('longform_scene_file_missing:'+scene.sceneId);

  const observed=hashFile(scene.path);
  const expected=scene.sha256.replace(/^sha256:/,'').toLowerCase();
  if(observed!==expected) throw new Error('longform_scene_digest_mismatch:'+scene.sceneId);
  if(scene.masterQc.schema!=='evercraft.fallen.master-qc-receipt.v1'){
    throw new Error('longform_scene_qc_schema_invalid:'+scene.sceneId);
  }
  if(scene.masterQc.status!=='accepted'){
    throw new Error('longform_scene_qc_rejected:'+scene.sceneId);
  }
  if(scene.masterQc.sha256!==observed){
    throw new Error('longform_scene_qc_digest_mismatch:'+scene.sceneId);
  }
  if(Math.abs(scene.masterQc.measurements.durationSec-scene.durationSec)>.2){
    throw new Error('longform_scene_duration_receipt_mismatch:'+scene.sceneId);
  }
}

export function compileLongformPlan(input:LongformProjectInput):LongformPlan{
  if(input.schema!=='evercraft.fallen.longform-project.v1') throw new Error('longform_project_schema_invalid');
  if(!input.id?.trim()) throw new Error('longform_project_id_missing');
  if(!input.scenes?.length) throw new Error('longform_project_scenes_missing');

  const ids=new Set<string>();
  const orders=new Set<number>();
  const sorted=[...input.scenes].sort((a,b)=>a.order-b.order);
  for(const scene of sorted){
    verifyScene(scene);
    if(ids.has(scene.sceneId)) throw new Error('longform_duplicate_scene_id:'+scene.sceneId);
    if(orders.has(scene.order)) throw new Error('longform_duplicate_scene_order:'+String(scene.order));
    ids.add(scene.sceneId);
    orders.add(scene.order);
  }

  const expectedOrders=Array.from({length:sorted.length},(_,index)=>index);
  if(sorted.some((scene,index)=>scene.order!==expectedOrders[index])){
    throw new Error('longform_scene_order_not_contiguous');
  }

  const signature=technicalSignature(sorted[0]);
  for(const scene of sorted){
    if(technicalSignature(scene)!==signature){
      throw new Error('longform_scene_technical_format_mismatch:'+scene.sceneId);
    }
  }

  const actOrder:string[]=[];
  const actMap=new Map<string,LongformSceneMaster[]>();
  let previousAct:string|undefined;
  const closedActs=new Set<string>();
  for(const scene of sorted){
    if(scene.actId!==previousAct){
      if(previousAct) closedActs.add(previousAct);
      if(closedActs.has(scene.actId)) throw new Error('longform_act_not_contiguous:'+scene.actId);
      actOrder.push(scene.actId);
      previousAct=scene.actId;
    }
    const rows=actMap.get(scene.actId)??[];
    rows.push(scene);
    actMap.set(scene.actId,rows);
  }

  const acts=actOrder.map(actId=>{
    const scenes=actMap.get(actId)??[];
    const core={
      actId,
      sceneIds:scenes.map(scene=>scene.sceneId),
      inputDigests:scenes.map(scene=>scene.sha256.replace(/^sha256:/,'')),
      expectedDurationSec:Number(scenes.reduce((sum,scene)=>sum+scene.durationSec,0).toFixed(3)),
      technicalSignature:signature,
    };
    return {...core,manifestDigest:digest(core)};
  });

  const core={
    schema:'evercraft.fallen.longform-plan.v1' as const,
    projectId:input.id,
    title:input.title,
    acts,
    scenes:sorted,
    technicalSignature:signature,
    boundaries:{
      sceneQcRequired:true as const,
      sceneDigestsVerified:true as const,
      technicalFormatMustMatch:true as const,
      checkpointReuseDigestBound:true as const,
      noSceneRegenerationAuthority:true as const,
      publicationAuthorityGranted:false as const,
    },
    createdAt:new Date().toISOString(),
  };
  return {...core,planDigest:digest({...core,createdAt:undefined})};
}

function ffconcatLine(filePath:string){
  if(/[\r\n]/.test(filePath)) throw new Error('longform_path_contains_newline');
  return "file '"+path.resolve(filePath).replace(/'/g,"'\\''")+"'";
}

function probeDuration(filePath:string){
  const out=run('ffprobe',[
    '-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',filePath
  ]);
  const value=Number(out.trim());
  if(!Number.isFinite(value)||value<=0) throw new Error('longform_output_duration_invalid');
  return value;
}

function readCheckpoint(checkpointPath:string){
  if(!fs.existsSync(checkpointPath)) return undefined;
  try{
    return JSON.parse(fs.readFileSync(checkpointPath,'utf8')) as LongformCheckpointReceipt;
  }catch{
    return undefined;
  }
}

function concatenate(input:{
  projectId:string;
  scope:'act'|'master';
  scopeId:string;
  manifestDigest:string;
  inputs:Array<{path:string;sha256:string}>;
  expectedDurationSec:number;
  outputPath:string;
  checkpointPath:string;
}):LongformCheckpointReceipt{
  const prior=readCheckpoint(input.checkpointPath);
  if(
    prior?.schema==='evercraft.fallen.longform-checkpoint.v1'&&
    prior.projectId===input.projectId&&
    prior.scope===input.scope&&
    prior.scopeId===input.scopeId&&
    prior.manifestDigest===input.manifestDigest&&
    fs.existsSync(prior.outputPath)&&
    hashFile(prior.outputPath)===prior.outputSha256
  ){
    return {...prior,state:'reused'};
  }

  for(const item of input.inputs){
    if(!fs.existsSync(item.path)) throw new Error('longform_concat_input_missing:'+item.path);
    if(hashFile(item.path)!==item.sha256.replace(/^sha256:/,'')){
      throw new Error('longform_concat_input_digest_mismatch:'+item.path);
    }
  }

  fs.mkdirSync(path.dirname(input.outputPath),{recursive:true});
  fs.mkdirSync(path.dirname(input.checkpointPath),{recursive:true});
  const listPath=input.outputPath+'.concat.txt';
  fs.writeFileSync(listPath,input.inputs.map(item=>ffconcatLine(item.path)).join('\n')+'\n','utf8');
  try{
    run('ffmpeg',[
      '-y','-v','error','-f','concat','-safe','0','-i',listPath,
      '-map','0:v:0','-map','0:a:0',
      '-c','copy','-movflags','+faststart',
      input.outputPath
    ]);
  }finally{
    try{fs.unlinkSync(listPath);}catch{}
  }

  const duration=probeDuration(input.outputPath);
  const durationTolerance=Math.max(.35,input.inputs.length*.03);
  if(Math.abs(duration-input.expectedDurationSec)>durationTolerance){
    throw new Error(
      'longform_output_duration_mismatch:'+input.scopeId+
      ':expected='+input.expectedDurationSec+':observed='+duration+
      ':tolerance='+durationTolerance
    );
  }

  const receipt:LongformCheckpointReceipt={
    schema:'evercraft.fallen.longform-checkpoint.v1',
    projectId:input.projectId,
    scope:input.scope,
    scopeId:input.scopeId,
    manifestDigest:input.manifestDigest,
    inputDigests:input.inputs.map(item=>item.sha256.replace(/^sha256:/,'')),
    outputPath:path.resolve(input.outputPath),
    outputSha256:hashFile(input.outputPath),
    sizeBytes:fs.statSync(input.outputPath).size,
    durationSec:Number(duration.toFixed(3)),
    state:'rendered',
    boundaries:{
      byteReuseRequiresExactManifest:true,
      inputSceneMastersImmutable:true,
      publicationAuthorityGranted:false,
    },
    createdAt:new Date().toISOString(),
  };
  fs.writeFileSync(input.checkpointPath,JSON.stringify(receipt,null,2)+'\n','utf8');
  return receipt;
}

export function renderLongformPlan(input:{
  plan:LongformPlan;
  outputDir:string;
}):LongformRenderReceipt{
  const outputDir=path.resolve(input.outputDir);
  fs.mkdirSync(outputDir,{recursive:true});
  const sceneById=new Map(input.plan.scenes.map(scene=>[scene.sceneId,scene]));

  const actReceipts=input.plan.acts.map(act=>{
    const scenes=act.sceneIds.map(sceneId=>{
      const scene=sceneById.get(sceneId);
      if(!scene) throw new Error('longform_plan_scene_missing:'+sceneId);
      verifyScene(scene);
      return scene;
    });
    const actSlug=safe(act.actId);
    return concatenate({
      projectId:input.plan.projectId,
      scope:'act',
      scopeId:act.actId,
      manifestDigest:act.manifestDigest,
      inputs:scenes.map(scene=>({path:scene.path,sha256:scene.sha256})),
      expectedDurationSec:act.expectedDurationSec,
      outputPath:path.join(outputDir,'act-'+actSlug+'.mp4'),
      checkpointPath:path.join(outputDir,'act-'+actSlug+'.checkpoint.json'),
    });
  });

  const masterCore={
    projectId:input.plan.projectId,
    planDigest:input.plan.planDigest,
    actManifests:actReceipts.map(receipt=>receipt.manifestDigest),
    actDigests:actReceipts.map(receipt=>receipt.outputSha256),
  };
  const masterManifestDigest=digest(masterCore);
  const master=concatenate({
    projectId:input.plan.projectId,
    scope:'master',
    scopeId:'master',
    manifestDigest:masterManifestDigest,
    inputs:actReceipts.map(receipt=>({path:receipt.outputPath,sha256:receipt.outputSha256})),
    expectedDurationSec:Number(input.plan.acts.reduce((sum,act)=>sum+act.expectedDurationSec,0).toFixed(3)),
    outputPath:path.join(outputDir,safe(input.plan.projectId)+'-master.mp4'),
    checkpointPath:path.join(outputDir,safe(input.plan.projectId)+'-master.checkpoint.json'),
  });

  return {
    schema:'evercraft.fallen.longform-render-receipt.v1',
    projectId:input.plan.projectId,
    outputPath:master.outputPath,
    outputSha256:master.outputSha256,
    actReceipts,
    masterCheckpoint:master,
    reusedActCount:actReceipts.filter(receipt=>receipt.state==='reused').length,
    renderedActCount:actReceipts.filter(receipt=>receipt.state==='rendered').length,
    publicationAuthorityGranted:false,
    completedAt:new Date().toISOString(),
  };
}
