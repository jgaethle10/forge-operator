#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MODULE_FILE=fileURLToPath(import.meta.url);
const BLOCKED_BRANDS=new Set(['rnb-chicken-and-soul','r-and-b-chicken-and-soul','r&b-chicken-and-soul']);
const DESTINATIONS=['facebook','instagram','linkedin','youtube'];
const HELD_UNVERIFIED_DESTINATIONS=['tiktok'];

const clean=(value,max=4000)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
const unique=(values=[])=>[...new Set(values.map(v=>clean(v)).filter(Boolean))];
const sha=value=>crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');

function arg(argv,name,fallback=''){
  const i=argv.indexOf(name);
  return i>=0&&argv[i+1]?argv[i+1]:fallback;
}

function safeId(value){
  const out=clean(value,180).replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,120);
  if(!out) throw new Error('spectacle_production_id_invalid');
  return out;
}

function readJson(file){
  return JSON.parse(fs.readFileSync(path.resolve(file),'utf8'));
}

function writeJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o750});
  fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{mode:0o600});
}

function run(command,args,{env=process.env,cwd=process.cwd()}={}){
  const result=spawnSync(command,args,{cwd,env,encoding:'utf8',maxBuffer:32*1024*1024});
  if(result.error) throw new Error('spectacle_subprocess_failed:'+result.error.message);
  if(result.status!==0){
    throw new Error('spectacle_subprocess_nonzero:'+command+':'+String(result.stderr||result.stdout||'').slice(-3000));
  }
  return String(result.stdout||'').trim();
}

function npmCommand(){
  return process.platform==='win32'?'npm.cmd':'npm';
}

function phenomenonEvidenceState(value){
  const state=clean(value).toLowerCase();
  if(state==='modeled') return 'modeled';
  if(state==='observed'||state==='verified') return 'observed';
  return 'public_source';
}

function freshnessState(candidate,createdAt){
  const observed=Date.parse(String(candidate?.observed_at||''));
  const built=Date.parse(String(createdAt||''));
  if(!Number.isFinite(observed)||!Number.isFinite(built)) return 'unknown';
  const age=built-observed;
  return age>=0&&age<=24*60*60*1000?'fresh':'stale';
}

function uncertaintyFor(candidate){
  if(candidate.evidence_state==='modeled'){
    return 'This visualization is driven by modeled data. It can reveal structure and motion in the system, but it should not be read as a direct instrument measurement at every point shown.';
  }
  if(candidate.evidence_state==='observed'||candidate.evidence_state==='verified'){
    return 'The visual is grounded in observed or verified evidence, but real-world feeds can still contain gaps, delays, and local conditions that are not represented at every point.';
  }
  return 'The visual is grounded in source-reported evidence. The source lineage is preserved, and the display should not be read as stronger evidence than the underlying reporting supports.';
}

export function phenomenonInputFromCandidate(candidate,{aspectRatio='9:16'}={}){
  if(candidate?.schema!=='evercraft.social-spectacle.candidate.v1') throw new Error('spectacle_candidate_schema_invalid');
  if(candidate?.production?.visual_path!=='fallen_phenomenon') throw new Error('spectacle_candidate_not_phenomenon');
  const p=candidate.production.phenomenon;
  if(!p||p.kind!=='flow') throw new Error('spectacle_phenomenon_missing');
  const refs=unique(candidate.source_refs||[]);
  if(!refs.length) throw new Error('spectacle_source_refs_missing');
  const sourceLabel=clean(candidate.source_family||p.sourceLabel||'Source-grounded Worldstate evidence',240);
  const streamlines=(p.streamlines||[]).map((stream,index)=>({
    ...stream,
    id:clean(stream.id)||'stream-'+String(index+1),
    sourceRefs:unique(stream.sourceRefs?.length?stream.sourceRefs:refs),
  }));
  return {
    schema:'evercraft.fallen.phenomenon.v1',
    id:safeId(candidate.candidate_id+'-'+aspectRatio.replace(':','x')),
    title:clean(p.title||candidate.title_seed||'A physical system in motion',220),
    subtitle:clean(p.subtitle||unique(candidate.region_keys||[]).join(' · '),180),
    callout:clean(p.callout||candidate.title_seed||'',260),
    durationSec:Math.max(8,Math.min(45,Number(p.durationSec||24))),
    aspectRatio,
    ...(p.time?{time:p.time}:{}),
    geography:p.geography,
    encoding:p.encoding,
    field:{
      kind:'flow',
      evidenceState:phenomenonEvidenceState(candidate.evidence_state),
      sourceRefs:refs,
      streamlines,
      particleDensity:p.particleDensity,
      trailFraction:p.trailFraction,
    },
    source:{
      label:sourceLabel,
      refs,
    },
  };
}

export function captionFromCandidate(candidate){
  const p=candidate.production?.phenomenon||{};
  const title=clean(p.title||candidate.title_seed||'The world is moving');
  const motion=clean(p.encoding?.motionLabel||'movement through the system');
  const region=unique(candidate.region_keys||[]).join(', ')||'this system';
  const source=clean(candidate.source_family||'the cited source');
  const callout=clean(p.callout||candidate.title_seed||'');
  const first=`${title}. This animation turns ${motion} across ${region} into something you can actually watch instead of burying it in a dashboard. ${callout ? callout+' ' : ''}The motion is the story: direction, timing, and the encoded measurements are all tied to the underlying evidence rather than decorative movement.`;
  const second=`${uncertaintyFor(candidate)} Evidence state: ${clean(candidate.evidence_label||candidate.evidence_state).toUpperCase()}. Source: ${source}. Evercraft keeps the source references attached to the production package so the pretty version does not outrun the evidence.`;
  return first+'\n\n'+second;
}

export function assessSpectacleEditorialPreflight({candidate,caption,masterQc}={}){
  const sourceRefs=unique(candidate?.source_refs||[]);
  const paragraphs=String(caption||'').split(/\n\s*\n/).map((value)=>clean(value)).filter(Boolean);
  const p=candidate?.production?.phenomenon||{};
  const checks=[
    ['source_lineage',sourceRefs.length>0],
    ['evidence_state_explicit',Boolean(clean(candidate?.evidence_label||candidate?.evidence_state))],
    ['visual_semantics',Boolean(clean(p?.encoding?.motionLabel))],
    ['not_text_card_first',candidate?.production?.no_text_card_first===true],
    ['specific_title',clean(p?.title||candidate?.title_seed).length>=12],
    ['substantive_caption',String(caption||'').length>=320&&paragraphs.length>=2],
    ['uncertainty_visible',/modeled data|observed or verified evidence|source-reported evidence/i.test(String(caption||''))],
    ['source_attribution_visible',/Source:/i.test(String(caption||''))],
    ['master_qc',masterQc?.status==='accepted'],
    ['brand_and_destination_policy',!BLOCKED_BRANDS.has(clean(candidate?.brand_key).toLowerCase())&&DESTINATIONS.length===4],
  ];
  const failures=checks.filter(([,ok])=>!ok).map(([name])=>name);
  return {
    schema:'evercraft.social-spectacle.editorial-preflight.v1',
    status:failures.length?'rejected':'accepted',
    score:checks.length-failures.length,
    maximum_score:checks.length,
    checks:Object.fromEntries(checks),
    failures,
    publication_authority:false,
  };
}

function buildClipManifest({candidate,stage,videoPath,renderReceiptPath,masterQcPath,masterQc,caption,editorialGate,createdAt}){
  const stat=fs.statSync(videoPath);
  const mediaSha=crypto.createHash('sha256').update(fs.readFileSync(videoPath)).digest('hex');
  if(mediaSha!==masterQc.sha256) throw new Error('spectacle_master_qc_digest_mismatch');
  return {
    schema:'evercraft.clip.media-intake.v1',
    contentClass:'social_spectacle',
    deliveryId:safeId(candidate.candidate_id+'-vertical-hero'),
    sourceApp:'fallen',
    sourceProjectId:stage.id,
    sourceProjectVersion:1,
    state:'ready_for_clip_intake',
    media:{
      path:path.resolve(videoPath),
      sha256:mediaSha,
      sizeBytes:stat.size,
      width:stage.width,
      height:stage.height,
      fps:stage.fps,
      durationSec:stage.durationSec,
      videoCodec:'h264',
    },
    captions:[],
    metadata:{
      title:clean(candidate.production?.phenomenon?.title||candidate.title_seed,100),
      description:caption,
      tags:unique(['evercraft',...(candidate.domains||[]),...(candidate.region_keys||[])]).slice(0,20),
      language:'en',
    },
    sourceObservedAt:clean(candidate.observed_at,100),
    freshnessState:freshnessState(candidate,createdAt),
    destinations:[...DESTINATIONS],
    heldUnverifiedDestinations:[...HELD_UNVERIFIED_DESTINATIONS],
    provenance:{
      inputAssetIds:[],
      sourceRefs:unique(candidate.source_refs||[]),
      continuityDigests:['spectacle-candidate:'+sha(candidate)],
      renderReceiptPath:path.resolve(renderReceiptPath),
      masterQcReceiptPath:path.resolve(masterQcPath),
    },
    editorialGate,
    productionGrade:{
      status:'accepted',
      hero_kind:'data_visualization',
      text_primary:false,
      source_grounded:true,
    },
    boundaries:{
      publicationAuthorityGranted:false,
      platformCredentialsConsumed:false,
      platformPublishStateAsserted:false,
      downstreamClipGateRequired:true,
    },
    createdAt,
  };
}

export function produceCandidate(candidate,{
  outputRoot='artifacts/social-spectacle/production',
  clipQueueDir='artifacts/clip-intake-queue',
  now=new Date(),
  executeRender=Boolean(process.env.FALLEN_RENDER_WORKERS),
}={}){
  const id=safeId(candidate.candidate_id);
  const root=path.resolve(outputRoot,id);
  fs.mkdirSync(root,{recursive:true,mode:0o750});
  const receiptPath=path.join(root,'production-receipt.json');
  if(fs.existsSync(receiptPath)){
    const prior=readJson(receiptPath);
    if(prior.status==='ready_for_clip_publish') return prior;
    if(prior.status==='ready_to_render'&&!executeRender) return prior;
  }

  if(BLOCKED_BRANDS.has(clean(candidate.brand_key).toLowerCase())){
    const held={schema:'evercraft.social-spectacle.production-receipt.v1',candidate_id:candidate.candidate_id,status:'held',reason:'brand_explicitly_blocked',publication_authority:false,at:now.toISOString()};
    writeJson(receiptPath,held);
    return held;
  }

  const phenomenon=phenomenonInputFromCandidate(candidate,{aspectRatio:'9:16'});
  const phenomenonPath=path.join(root,'phenomenon.vertical.json');
  const stagePath=path.join(root,'stage.vertical.json');
  const phenomenonReceiptPath=path.join(root,'phenomenon.vertical.receipt.json');
  const renderInputPath=path.join(root,'render-input.vertical.json');
  const renderPlanPath=path.join(root,'render-plan.vertical.json');
  writeJson(phenomenonPath,phenomenon);

  run(npmCommand(),['run','media:studio','--','phenomenon-stage',phenomenonPath,stagePath,phenomenonReceiptPath]);
  const stage=readJson(stagePath);
  writeJson(renderInputPath,{
    id:safeId(candidate.candidate_id+'-vertical'),
    stage,
    assetScopeId:safeId(candidate.candidate_id+'-assets'),
    assets:[],
    maxFramesPerShard:60,
  });
  run(npmCommand(),['run','media:studio','--','render-plan',renderInputPath,renderPlanPath]);

  const landscape=phenomenonInputFromCandidate(candidate,{aspectRatio:'16:9'});
  const landscapeInput=path.join(root,'phenomenon.landscape.json');
  const landscapeStage=path.join(root,'stage.landscape.json');
  const landscapeReceipt=path.join(root,'phenomenon.landscape.receipt.json');
  writeJson(landscapeInput,landscape);
  run(npmCommand(),['run','media:studio','--','phenomenon-stage',landscapeInput,landscapeStage,landscapeReceipt]);

  if(!executeRender){
    const ready={
      schema:'evercraft.social-spectacle.production-receipt.v1',
      candidate_id:candidate.candidate_id,
      status:'ready_to_render',
      vertical_stage:stagePath,
      vertical_render_plan:renderPlanPath,
      landscape_stage:landscapeStage,
      reason:'render_workers_not_configured',
      publication_authority:false,
      at:now.toISOString(),
    };
    writeJson(receiptPath,ready);
    return ready;
  }

  const videoPath=path.join(root,'vertical-hero.mp4');
  const renderReceiptPath=path.join(root,'vertical-hero.render-receipt.json');
  run(process.execPath,['systemia/media-studio/distributed-render-coordinator.mjs',renderPlanPath,videoPath,renderReceiptPath]);

  const qcPolicyPath=path.join(root,'master-qc-policy.json');
  const masterQcPath=path.join(root,'vertical-hero.master-qc.json');
  writeJson(qcPolicyPath,{
    expectedDurationSec:stage.durationSec,
    requireAudio:false,
    minShortEdge:1080,
    minFps:23.9,
    maxBlackRatio:.08,
    maxFreezeRatio:.5,
    maxSilenceRatio:1,
  });
  run(npmCommand(),['run','media:studio','--','master-qc',videoPath,masterQcPath,qcPolicyPath]);
  const masterQc=readJson(masterQcPath);
  const caption=captionFromCandidate(candidate);
  const editorialGate=assessSpectacleEditorialPreflight({candidate,caption,masterQc});
  const editorialPath=path.join(root,'editorial-preflight.json');
  writeJson(editorialPath,editorialGate);
  if(editorialGate.status!=='accepted'||editorialGate.score!==10){
    const rejected={
      schema:'evercraft.social-spectacle.production-receipt.v1',
      candidate_id:candidate.candidate_id,
      status:'held',
      reason:'editorial_preflight_rejected',
      failures:editorialGate.failures,
      vertical_video:videoPath,
      publication_authority:false,
      at:now.toISOString(),
    };
    writeJson(receiptPath,rejected);
    return rejected;
  }

  const manifest=buildClipManifest({
    candidate,stage,videoPath,renderReceiptPath,masterQcPath,masterQc,caption,editorialGate,createdAt:now.toISOString()
  });
  const manifestPath=path.join(root,'clip-intake.json');
  writeJson(manifestPath,manifest);
  run(process.execPath,['systemia/clip/media-intake.mjs','--manifest',manifestPath,'--queue-dir',path.resolve(clipQueueDir)]);

  const intakeReceiptPath=path.join(path.resolve(clipQueueDir),safeId(manifest.deliveryId),'intake-receipt.json');
  if(!fs.existsSync(intakeReceiptPath)) throw new Error('spectacle_clip_intake_receipt_missing');
  const intake=readJson(intakeReceiptPath);
  if(intake.status!=='staged') throw new Error('spectacle_clip_intake_not_staged');

  const receipt={
    schema:'evercraft.social-spectacle.production-receipt.v1',
    candidate_id:candidate.candidate_id,
    status:'ready_for_clip_publish',
    vertical_video:videoPath,
    render_receipt:renderReceiptPath,
    master_qc_receipt:masterQcPath,
    editorial_preflight:editorialPath,
    clip_manifest:manifestPath,
    clip_intake_receipt:intakeReceiptPath,
    destinations:manifest.destinations,
    media_sha256:manifest.media.sha256,
    publication_authority:false,
    at:now.toISOString(),
  };
  writeJson(receiptPath,receipt);
  return receipt;
}

export function produceQueue({
  queueFile='artifacts/social-spectacle/latest-queue.json',
  outputRoot='artifacts/social-spectacle/production',
  clipQueueDir='artifacts/clip-intake-queue',
  now=new Date(),
  executeRender=Boolean(process.env.FALLEN_RENDER_WORKERS),
}={}){
  const file=path.resolve(queueFile);
  if(!fs.existsSync(file)){
    return {schema:'evercraft.social-spectacle.production-run.v1',status:'no_op',reason:'spectacle_queue_missing',items:[],publication_authority:false,at:now.toISOString()};
  }
  const queue=readJson(file);
  if(queue?.schema!=='evercraft.social-spectacle.queue.v1') throw new Error('spectacle_queue_schema_invalid');
  const items=[];
  for(const candidate of queue.queue||[]){
    if(candidate?.production?.visual_path!=='fallen_phenomenon'){
      items.push({candidate_id:candidate?.candidate_id||null,status:'held',reason:'production_path_not_yet_automated'});
      continue;
    }
    items.push(produceCandidate(candidate,{outputRoot,clipQueueDir,now,executeRender}));
  }
  return {
    schema:'evercraft.social-spectacle.production-run.v1',
    status:items.some(item=>item.status==='ready_for_clip_publish')?'produced':items.length?'held':'no_op',
    items,
    publication_authority:false,
    at:now.toISOString(),
  };
}

async function cli(){
  const argv=process.argv.slice(2);
  const queueFile=arg(argv,'--queue',process.env.SYSTEMIA_SOCIAL_SPECTACLE_QUEUE||'artifacts/social-spectacle/latest-queue.json');
  const outputRoot=arg(argv,'--out',process.env.SYSTEMIA_SOCIAL_SPECTACLE_PRODUCTION_DIR||'artifacts/social-spectacle/production');
  const clipQueueDir=arg(argv,'--clip-queue',process.env.EVERCRAFT_CLIP_QUEUE_DIR||'artifacts/clip-intake-queue');
  const result=produceQueue({queueFile,outputRoot,clipQueueDir});
  console.log(JSON.stringify(result,null,2));
}

if(process.argv[1]&&path.resolve(process.argv[1])===MODULE_FILE){
  cli().catch(error=>{
    console.error(JSON.stringify({ok:false,error:clean(error?.message||error,3000)}));
    process.exitCode=1;
  });
}
