#!/usr/bin/env node
// Local-only, fail-closed real-footage intake for the Website Audit flagship.
// No network, no provider calls, no checkout, no publishing. Uses existing Fallen renderer.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const REPO=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const SHOTS=[
  {id:'human_after_hours',durationSec:5,sourceKind:'human_filmed_video',truthState:'filmed_source'},
  {id:'visitor_journey',durationSec:5,sourceKind:'spatial_illustration_video',truthState:'synthetic_visualization'},
  {id:'real_audit_capture',durationSec:5,sourceKind:'real_product_screen_capture',truthState:'observed_product_capture'},
  {id:'five_verified_fixes',durationSec:6,sourceKind:'real_fixes_screen_capture',truthState:'observed_product_capture'},
  {id:'offer_end_card',durationSec:4,sourceKind:'brand_approved_video',truthState:'brand_artifact'}
];
export const FILM_SHOTS=Object.freeze(SHOTS.map(x=>Object.freeze({...x})));
function sha256File(file){
  // 4 MiB bounded buffer instead of loading an entire multi-gigabyte source video.
  const hash=crypto.createHash('sha256');
  const fd=fs.openSync(file,'r');
  const block=Buffer.allocUnsafe(4*1024*1024);
  try{
    let read;
    while((read=fs.readSync(fd,block,0,block.length,null))>0)hash.update(block.subarray(0,read));
    return hash.digest('hex');
  }finally{fs.closeSync(fd);}
}
function safeRelative(root,relative){
  if(typeof relative!=='string'||!relative.trim()||path.isAbsolute(relative))throw new Error('relative_asset_path_required');
  const full=path.resolve(root,relative);
  if(full===root||!full.startsWith(root+path.sep))throw new Error('asset_path_outside_workspace');
  return full;
}
function regularFile(root,relative){
  let candidate;
  try{candidate=safeRelative(root,relative);}catch{return {error:'unsafe_path'};}
  let current=root;
  for(const item of path.relative(root,candidate).split(path.sep)){
    current=path.join(current,item);
    try{
      const stat=fs.lstatSync(current);
      if(stat.isSymbolicLink())return {error:'symlink_rejected'};
      if(current===candidate&&!stat.isFile())return {error:'not_regular_file'};
    }catch(e){return {error:e.code==='ENOENT'?'missing_file':'file_unreadable'};}
  }
  return {path:candidate};
}
export function probeVideo(file){
  const p=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries',
    'stream=codec_type,width,height:format=duration','-of','json',file],{
      encoding:'utf8',timeout:12000,maxBuffer:256*1024
    });
  if(p.status!==0||p.error)return null;
  try{
    const data=JSON.parse(p.stdout);
    const video=data.streams?.[0];
    return {
      width:Number(video?.width||0),
      height:Number(video?.height||0),
      durationSec:Number(data.format?.duration||0),
      videoPresent:video?.codec_type==='video'
    };
  }catch{return null;}
}
export function template(){
  return {
    schema:'evercraft.website-audit.film-intake.v1',
    campaignId:'website-audit-attention-001',
    rightsPolicy:'no_unknown_rights',
    checkoutState:'unverified',
    productFunctionState:'unverified',
    humanPictureApproval:false,
    releaseAuthority:false,
    shots:SHOTS.map(s=>({
      id:s.id,
      sourceKind:s.sourceKind,
      truthState:s.truthState,
      file:'media/'+s.id+'.mp4',
      sha256:'REPLACE_WITH_ACTUAL_SHA256',
      sourceRef:'REPLACE_WITH_PROVENANCE',
      rights:'unknown',
      rightsEvidenceFile:'rights/'+s.id+'.txt',
      evidenceRefs:s.id==='five_verified_fixes'?[]:undefined
    }))
  };
}
export function inspectFilm(input,{workspace,probe=probeVideo}={}){
  if(!workspace||!fs.existsSync(workspace))throw new Error('workspace_missing');
  const root=fs.realpathSync(workspace);
  if(input?.schema!=='evercraft.website-audit.film-intake.v1')throw new Error('film_intake_schema_invalid');
  if(input.campaignId!=='website-audit-attention-001')throw new Error('film_campaign_invalid');
  const shots=Array.isArray(input.shots)?input.shots:[];
  if(shots.length!==SHOTS.length)throw new Error('film_shots_count_invalid');
  const findings=[];
  const admitted=[];
  const used=new Set();
  for(let i=0;i<SHOTS.length;i++){
    const expected=SHOTS[i], row=shots[i];
    const errors=[];
    if(!row||row.id!==expected.id||row.sourceKind!==expected.sourceKind||row.truthState!==expected.truthState){
      errors.push('shot_identity_or_truth_mismatch');
    }
    const file=regularFile(root,row?.file);
    if(file.error)errors.push('source_'+file.error);
    const rights=regularFile(root,row?.rightsEvidenceFile);
    if(rights.error)errors.push('rights_evidence_'+rights.error);
    if(!['owned','licensed','public_domain'].includes(row?.rights))errors.push('commercial_rights_unknown');
    if(!row?.sourceRef||String(row.sourceRef).startsWith('REPLACE_'))errors.push('provenance_missing');
    if(typeof row?.sha256!=='string'||!/^[0-9a-f]{64}$/.test(row.sha256))errors.push('asset_sha256_missing');
    if(file.path){
      if(used.has(file.path))errors.push('duplicate_shot_asset');
      used.add(file.path);
      try{
        const actual=sha256File(file.path);
        if(actual!==row?.sha256)errors.push('asset_sha256_mismatch');
      }catch{errors.push('asset_read_failed');}
      const media=probe(file.path);
      if(!media?.videoPresent||media.width<640||media.height<360||
         !Number.isFinite(media.durationSec)||media.durationSec<expected.durationSec){
        errors.push('video_probe_or_duration_invalid');
      }
    }
    if(expected.id==='real_audit_capture'&&!Array.isArray(row?.evidenceRefs)){
      errors.push('product_evidence_refs_missing');
    }else if(expected.id==='real_audit_capture'&&row.evidenceRefs.length<1){
      errors.push('product_evidence_refs_missing');
    }
    if(expected.id==='five_verified_fixes'&&(
      !Array.isArray(row?.evidenceRefs)||new Set(row.evidenceRefs.filter(x=>typeof x==='string'&&x.trim())).size<5
    ))errors.push('five_fixes_evidence_missing');
    const entry={id:expected.id,status:errors.length?'blocked':'admitted',
      durationSec:expected.durationSec,issues:errors,sourceKind:expected.sourceKind};
    findings.push(entry);
    if(!errors.length)admitted.push({id:expected.id,path:file.path,durationSec:expected.durationSec,
      sourceRef:row.sourceRef,rights:row.rights,sha256:row.sha256});
  }
  const ready=findings.every(x=>x.status==='admitted');
  // Self-declared form values do not independently verify product function,
  // commercial rights, founder approval or live customer payments.
  const editorialHolds=[
    'independent_checkout_verification_required',
    'observed_product_function_verification_required',
    'independent_asset_rights_review_required',
    'human_picture_approval_required',
    'mastered_audio_missing',
  ];
  return {
    schema:'evercraft.website-audit.film-admission.v1',
    state:ready?'picture_preview_ready':'blocked_missing_real_media',
    campaignId:input.campaignId,
    shots:findings,
    admittedSourceCount:admitted.length,
    missingSourceCount:SHOTS.length-admitted.length,
    targetDurationSec:25,
    renderMode:'silent_picture_preview_only',
    audioStatus:'not_produced',
    cinematicMasterStatus:'not_produced',
    visualEvidenceReview:'not_performed',
    rightsVerification:'document_present_only_independent_review_required',
    editorialHolds,
    publicationAuthority:false,
    releaseAuthority:false,
    admitted,
  };
}
export function toFilmPlan(report){
  if(report.state!=='picture_preview_ready')throw new Error('picture_plan_requires_admitted_sources');
  return {
    schema:'evercraft.media.plan.v1',
    projectId:'website-audit-cinematic-preview',
    title:'Website Audit | Source-backed picture preview',
    prompt:'Real footage editorial preview. No fake customer data. Sound and release are separate gates.',
    format:'commercial',
    aspectRatio:'16:9',
    durationSec:25,
    scenes:report.admitted.map((shot,i)=>({
      id:shot.id,beat:['hook','setup','proof','proof','cta'][i],assetId:shot.id,
      sourcePath:shot.path,mediaKind:'video',durationSec:shot.durationSec,
      motion:'cover',transition:'cut',intent:shot.sourceRef
    })),
    generationRequests:[],provenance:report.admitted.map(shot=>({
      assetId:shot.id,sourcePath:shot.path,rights:shot.rights,usedInScenes:[shot.id]
    })),
    warnings:['Preview only: no mastered audio, editorial approval or checkout verification.'],
    createdAt:new Date().toISOString()
  };
}
function writeJson(file,data){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n',{mode:0o600});
}
function cli(){
  const args=process.argv.slice(2);
  const option=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
  const mode=args[0];
  if(!['--init','--inspect','--render'].includes(mode))throw Error('Usage: --init <workspace> | --inspect/--render <workspace> <intake.json> <output-dir>');
  const workspace=path.resolve(args[1]||'');
  if(mode==='--init'){
    fs.mkdirSync(workspace,{recursive:true,mode:0o700});
    const file=path.join(workspace,'film-intake.json');
    if(fs.existsSync(file))throw Error('film_intake_exists_refusing_overwrite');
    writeJson(file,template());
    console.log(JSON.stringify({status:'initialized',file,assetsNeeded:SHOTS.map(x=>x.id),publicationAuthority:false}));
    return;
  }
  const inputPath=path.resolve(args[2]||'');
  const outputRoot=path.resolve(args[3]||'');
  if(!args[2]||!args[3])throw Error('intake_json_and_output_dir_required');
  const input=JSON.parse(fs.readFileSync(inputPath,'utf8'));
  const report=inspectFilm(input,{workspace});
  writeJson(path.join(outputRoot,'film-admission.json'),{
    ...report, admitted:report.admitted.map(x=>({id:x.id,sha256:x.sha256,sourceRef:x.sourceRef,rights:x.rights}))
  });
  if(report.state!=='picture_preview_ready'){
    console.log(JSON.stringify({state:report.state,missing:report.shots.filter(x=>x.status==='blocked'),
      report:path.join(outputRoot,'film-admission.json')},null,2));
    process.exitCode=2;return;
  }
  const plan=toFilmPlan(report);
  const planPath=path.join(outputRoot,'fallen-picture-plan.json');
  writeJson(planPath,plan);
  if(mode==='--inspect'){
    console.log(JSON.stringify({state:'picture_preview_ready',plan:planPath,
      publicationAuthority:false,editorialHolds:report.editorialHolds},null,2));return;
  }
  const target=path.join(outputRoot,'website-audit-PREVIEW-SILENT.mp4');
  if(fs.existsSync(target))throw Error('preview_exists_refusing_overwrite');
  const child=spawnSync('npm',['run','media:studio','--','render',planPath,target],{
    cwd:REPO,encoding:'utf8',timeout:300000,maxBuffer:2*1024*1024
  });
  if(child.status!==0||child.error){
    console.error((child.stderr||child.error?.message||'render_failed').slice(-1200));
    process.exitCode=1;return;
  }
  const renderedDigest=sha256File(target);
  writeJson(path.join(outputRoot,'film-preview-receipt.json'),{
    schema:'evercraft.website-audit.picture-preview-receipt.v1',
    sha256:renderedDigest,file:path.basename(target),durationExpectedSec:25,
    sourceSha256s:report.admitted.map(x=>({id:x.id,sha256:x.sha256})),
    renderState:'silent_picture_preview_only',audioMastered:false,
    cinematicQualityApproved:false,checkoutVerified:false,publicationAuthority:false
  });
  console.log(JSON.stringify({state:'silent_picture_preview_rendered',video:target,
    sha256:renderedDigest,publicationAuthority:false}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{cli();}catch(e){console.error(JSON.stringify({state:'failed_closed',reason:e.message}));process.exitCode=1;}
}
