/**
 * Evercraft-owned cinematic video adapter for Fallen Visual Model Fabric.
 * Local executable protocol. No vendor API, paid inference or publication authority.
 * Worker MUST generate shot.mp4 and worker-receipt.json inside its assigned job directory.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';

const SHA=/^[a-f0-9]{64}$/i;
const hash=b=>createHash('sha256').update(b).digest('hex');
const safe=s=>String(s).replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100);
function ensure(ok,message){if(!ok)throw new Error(message);}
const inside=(child,parent)=>child===parent || (child.startsWith(parent+path.sep));

async function subprocess(command,args,{timeoutMs=180_000,cwd}={}){
  return await new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd,stdio:['ignore','pipe','pipe'],shell:false,env:{
      ...process.env,
      EVERCRAFT_VIDEO_LOCAL_ONLY:'1',
      EVERCRAFT_VIDEO_NO_PUBLISH:'1',
    }});
    let stderr='';let done=false;
    const fail=e=>{if(done)return;done=true;clearTimeout(timer);reject(e);};
    const timer=setTimeout(()=>{child.kill('SIGKILL');fail(new Error('owned_video_worker_timeout'));},timeoutMs);
    child.once('error',e=>fail(new Error('owned_video_worker_spawn_failed:'+e.message)));
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-5000);});
    child.stdout.on('data',()=>{});
    child.once('close',code=>{
      if(done)return;done=true;clearTimeout(timer);
      if(code!==0) reject(new Error('owned_video_worker_failed:'+code+':'+stderr.slice(-500)));
      else resolve();
    });
  });
}

async function probe(file,ffprobePath){
  const out=[];
  await new Promise((resolve,reject)=>{
    const child=spawn(ffprobePath,['-v','error','-select_streams','v:0','-show_entries','stream=codec_name,width,height,nb_frames,avg_frame_rate,pix_fmt,duration','-show_entries','format=duration','-of','json',file],{stdio:['ignore','pipe','pipe']});
    let err='';child.stdout.on('data',c=>out.push(c));child.stderr.on('data',c=>{err+=c;});
    child.once('error',reject);child.once('close',code=>code===0?resolve():reject(new Error('owned_video_ffprobe_failed:'+err.slice(0,150))));
  });
  const data=JSON.parse(Buffer.concat(out).toString());const s=data.streams?.[0]??{};
  const duration=Number(s.duration??data.format?.duration);
  const [n,d]=String(s.avg_frame_rate||'0/1').split('/').map(Number);
  const fps=d>0?n/d:0;
  return {codec:s.codec_name,pix_fmt:s.pix_fmt,width:s.width,height:s.height,duration,fps,frames:s.nb_frames?Number(s.nb_frames):Math.floor(duration*fps)};
}

/** Decoded low-resolution video activity check. Prevent still-video passing as generated action. */
async function motionAudit(file,ffmpegPath){
  const parts=[];const errors=[];
  await new Promise((resolve,reject)=>{
    const child=spawn(ffmpegPath,['-v','error','-i',file,'-vf','fps=3,scale=32:18,format=gray','-an','-f','rawvideo','pipe:1'],{stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',c=>parts.push(c));child.stderr.on('data',c=>errors.push(c));
    child.once('error',reject);child.once('close',code=>code===0?resolve():reject(new Error('owned_video_motion_decode_failed:'+Buffer.concat(errors).toString().slice(0,160))));
  });
  const frames=Buffer.concat(parts),size=32*18,count=Math.floor(frames.length/size);
  ensure(count>=3,'owned_video_motion_samples_insufficient');
  let change=0,compared=0,active=0;
  for(let i=1;i<count;i++){
    let delta=0;for(let j=0;j<size;j++) delta+=Math.abs(frames[i*size+j]-frames[(i-1)*size+j]);
    const mean=delta/size;change+=mean;compared++;
    if(mean>0.55)active++;
  }
  return {sampledFrames:count,meanFrameDelta:Number((change/compared).toFixed(3)),activePairs:active,activeRatio:Number((active/compared).toFixed(3)),algorithm:'grayscale-32x18-3fps-v1'};
}

async function localRefs(job,rootList){
  const result=[];
  for(const ref of job.references??[]){
    ensure(ref?.digest&&SHA.test(ref.digest.replace(/^sha256:/,'')),'owned_video_reference_digest_required');
    const locator=ref.locator;
    ensure(locator?.kind==='url'&&locator.value?.startsWith('file://'),'owned_video_local_file_reference_required');
    const file=fileURLToPath(locator.value),real=fs.realpathSync(file);
    ensure(rootList.some(root=>inside(real,root)),'owned_video_reference_outside_input_roots');
    ensure(fs.statSync(real).isFile(),'owned_video_reference_not_file');
    ensure(hash(fs.readFileSync(real))===ref.digest.replace(/^sha256:/,'').toLowerCase(),'owned_video_reference_digest_mismatch');
    ensure(ref.sourceRefs?.length,'owned_video_reference_source_evidence_required');
    result.push({id:ref.id,role:ref.role,kind:ref.kind,path:real,digest:ref.digest.replace(/^sha256:/,'').toLowerCase(),sourceRefs:ref.sourceRefs});
  }
  return result;
}

/** Only a preflighted, explicitly attested OWNED worker can advertise verified:true. */
export function ownedVideoEndpoint(verified=false){
  return {
    id:'evercraft:owned-video-v1',providerId:'evercraft-local',displayName:'Evercraft Owned Cinematic Worker',
    enabled:true,executionState:verified?'verified':'declared',
    capabilities:[{
      task:'video',inputModes:['text'],
      requirements:['commercial_rights','provenance_receipt','timing_control'],
      aspectRatios:['9:16','16:9'],maxDurationSec:10,maxReferences:0,
      resolutions:['720p'],qualityTier:3,costTier:1,latencyTier:4,
    }]
  };
}

/**
 * @param {{verified:boolean,runnerCommand:string,runnerArgs?:string[],workerArtifactPath:string,outputDir:string,inputRoots?:string[],weightsSha256:string,
 *   modelLicenseId:string,licenseEvidenceRefs:string[],rightsApproved:boolean,workerBuildDigest:string,
 *   ffmpegPath?:string,ffprobePath?:string,timeoutMs?:number,maxBytes?:number,minimumMotionDelta?:number}} config
 */
export function createOwnedVideoAdapter(config){
  const allowedRoots=(config.inputRoots??[]).map(v=>fs.realpathSync(v));
  const attested=Boolean(config.verified===true&&config.rightsApproved===true&&SHA.test(config.weightsSha256??'')&&
    SHA.test(config.workerBuildDigest??'')&&config.modelLicenseId?.trim()&&config.licenseEvidenceRefs?.length&&
    path.isAbsolute(config.runnerCommand??'')&&fs.existsSync(config.runnerCommand)&&
    path.isAbsolute(config.workerArtifactPath??'')&&fs.existsSync(config.workerArtifactPath)&&
    hash(fs.readFileSync(config.workerArtifactPath))===config.workerBuildDigest);
  return {
    id:'evercraft-local-owned-video-v1',modelId:'evercraft:owned-video-v1',providerId:'evercraft-local',verified:attested,
    async execute(job){
      ensure(attested,'owned_video_worker_not_attested');
      ensure(hash(fs.readFileSync(config.workerArtifactPath))===config.workerBuildDigest,'owned_video_worker_build_changed');
      ensure(job?.schema==='evercraft.fallen.visual-model-job.v1','owned_video_job_schema_invalid');
      ensure(job.modelId==='evercraft:owned-video-v1'&&job.providerId==='evercraft-local','owned_video_job_binding_mismatch');
      ensure(job.task==='video'&&typeof job.prompt==='string'&&job.prompt.trim().length>=12,'owned_video_request_invalid');
      ensure(job.durationSec>=1&&job.durationSec<=10,'owned_video_duration_invalid');
      ensure(['9:16','16:9'].includes(job.aspectRatio),'owned_video_aspect_invalid');
      ensure(job.targetResolution==='720p','owned_video_resolution_invalid');
      ensure(typeof job.continuityDigest==='string'&&job.continuityDigest.trim(),'owned_video_continuity_missing');
      const refs=await localRefs(job,allowedRoots);
      ensure(refs.length===0,'owned_video_v1_text_to_video_only');
      const tempRoot=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-owned-video-'));
      try{
        const request={
          schema:'evercraft.local-video.worker-request.v1',
          jobId:job.id,modelId:job.modelId,prompt:job.prompt,durationSec:job.durationSec,
          aspectRatio:job.aspectRatio,resolution:job.targetResolution,continuityDigest:job.continuityDigest,
          weightsSha256:config.weightsSha256,modelLicenseId:config.modelLicenseId,
          workerBuildDigest:config.workerBuildDigest,references:refs,
          publicationAuthority:false,
        };
        const reqPath=path.join(tempRoot,'request.json');
        fs.writeFileSync(reqPath,JSON.stringify(request,null,2)+'\n',{mode:0o600});
        await subprocess(config.runnerCommand,[...(config.runnerArgs??[]),'--request',reqPath,'--output',tempRoot],{
          timeoutMs:config.timeoutMs??600_000,cwd:tempRoot,
        });
        const receiptPath=path.join(tempRoot,'worker-receipt.json');
        ensure(fs.existsSync(receiptPath),'owned_video_worker_receipt_missing');
        const worker=JSON.parse(fs.readFileSync(receiptPath,'utf8'));
        ensure(worker.schema==='evercraft.local-video.worker-receipt.v1','owned_video_worker_receipt_schema_invalid');
        ensure(worker.jobId===job.id&&worker.modelId===job.modelId,'owned_video_worker_receipt_binding_mismatch');
        ensure(worker.weightsSha256===config.weightsSha256&&worker.workerBuildDigest===config.workerBuildDigest,'owned_video_worker_attestation_mismatch');
        ensure(worker.modelLicenseId===config.modelLicenseId&&worker.localInference===true,'owned_video_local_inference_not_proven');
        ensure(worker.continuityDigest===job.continuityDigest,'owned_video_worker_continuity_mismatch');
        const sourcePath=path.join(tempRoot,'shot.mp4');
        ensure(fs.existsSync(sourcePath)&&fs.lstatSync(sourcePath).isFile(),'owned_video_worker_output_missing');
        const bytes=fs.readFileSync(sourcePath);
        ensure(bytes.length>1000&&bytes.length<=(config.maxBytes??150_000_000),'owned_video_output_size_invalid');
        const digest=hash(bytes);
        ensure(worker.artifactSha256===digest,'owned_video_worker_artifact_digest_mismatch');
        const meta=await probe(sourcePath,config.ffprobePath??'ffprobe');
        ensure(meta.codec==='h264'&&meta.pix_fmt==='yuv420p','owned_video_delivery_codec_invalid');
        ensure(meta.width>0&&meta.height>0&&meta.fps>=12&&meta.frames>=12,'owned_video_delivery_shape_invalid');
        const ratio=meta.width/meta.height;
        ensure(Math.abs(ratio-(job.aspectRatio==='9:16'?9/16:16/9))<0.03,'owned_video_delivery_aspect_mismatch');
        ensure(Math.abs(meta.duration-job.durationSec)<=1,'owned_video_delivery_duration_mismatch');
        const motion=await motionAudit(sourcePath,config.ffmpegPath??'ffmpeg');
        ensure(motion.meanFrameDelta>=(config.minimumMotionDelta??0.60),'owned_video_static_or_low_motion_rejected');
        fs.mkdirSync(config.outputDir,{recursive:true});
        const final=path.resolve(config.outputDir,safe(job.id)+'-'+digest.slice(0,12)+'.mp4');
        fs.copyFileSync(sourcePath,final);
        ensure(hash(fs.readFileSync(final))===digest,'owned_video_saved_artifact_hash_mismatch');
        const proof={schema:'evercraft.local-video.verification.v1',jobId:job.id,artifactSha256:digest,
          weightsSha256:config.weightsSha256,workerBuildDigest:config.workerBuildDigest,
          modelLicenseId:config.modelLicenseId,licenseEvidenceRefs:config.licenseEvidenceRefs,
          sourceRefs:refs.flatMap(x=>x.sourceRefs),motion,probe:meta,
          acceptedForTournament:true,publicationAuthority:false};
        fs.writeFileSync(final+'.receipt.json',JSON.stringify(proof,null,2)+'\n');
        return {
          schema:'evercraft.fallen.visual-execution-receipt.v1',jobId:job.id,requestId:job.requestId,
          needId:job.needId,modelId:job.modelId,providerId:job.providerId,providerRequestId:job.id,
          artifact:{path:final,digest,mimeType:'video/mp4',width:meta.width,height:meta.height,durationSec:meta.duration,aspectRatio:job.aspectRatio},
          commercialRights:'allowed',provenance:'complete',continuityDigest:job.continuityDigest,
          sourceRefs:[...config.licenseEvidenceRefs,...refs.flatMap(x=>x.sourceRefs),
            'owned-weights-sha256:'+config.weightsSha256,'owned-worker-sha256:'+config.workerBuildDigest],
          generatedAt:new Date().toISOString(),
        };
      }finally{
        fs.rmSync(tempRoot,{recursive:true,force:true});
      }
    }
  };
}