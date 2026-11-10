import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCHEMA='evercraft.fallen.commercial-visual-qc.v1';
const W=32,H=18,FPS=4,BYTES=W*H;
const HEX=/^[a-f0-9]{64}$/i;
const round=n=>Number(n.toFixed(5));

function run(binary,args,encoding='utf8') {
  const r=spawnSync(binary,args,{encoding,maxBuffer:64*1024*1024});
  if(r.error) throw new Error('visual_'+binary+'_unavailable:'+r.error.message);
  if(r.status!==0) throw new Error('visual_'+binary+'_failed:'+String(r.stderr).slice(-1000));
  return r.stdout;
}
function digest(file) {
  const h=crypto.createHash('sha256'),fd=fs.openSync(file,'r'),b=Buffer.allocUnsafe(1048576);
  try {
    for(;;){const n=fs.readSync(fd,b,0,b.length,null);if(!n) break;h.update(b.subarray(0,n));}
  } finally {fs.closeSync(fd);}
  return h.digest('hex');
}
export function lumaActivity(a,b) {
  if(a.length!==BYTES||b.length!==BYTES) throw new Error('visual_frame_size_invalid');
  let sum=0;
  for(let i=0;i<BYTES;i++)sum+=Math.abs(a[i]-b[i]);
  return sum/(BYTES*255);
}
function validateBeats(beats,duration) {
  if(!Array.isArray(beats)||!beats.length)throw new Error('visual_beats_missing');
  const ids=new Set();let total=0;
  for(const beat of beats){
    if(typeof beat?.id!=='string'||!beat.id.trim()||ids.has(beat.id))throw new Error('visual_beat_id_invalid');
    if(!Number.isFinite(beat.durationSec)||beat.durationSec<=0)throw new Error('visual_beat_duration_invalid');
    ids.add(beat.id);total+=beat.durationSec;
  }
  if(Math.abs(total-duration)>0.22)throw new Error('visual_storyboard_duration_mismatch');
}
/**
 * Output measures small-grid luma activity, not artistic quality or continuity.
 * It requires independent human review before client delivery.
 */
export function inspectCommercialPicture({filePath,expectedSha256,beats,policy={}}) {
  if(!filePath||!fs.existsSync(filePath)||!fs.statSync(filePath).isFile())throw new Error('visual_master_missing');
  const p={minMotionDifference:0.006,maxStillRunSec:3,maxStillFraction:0.75,...policy};
  if(!Number.isFinite(p.minMotionDifference)||p.minMotionDifference<0||p.minMotionDifference>0.2||
    !Number.isFinite(p.maxStillRunSec)||p.maxStillRunSec<=0||
    !Number.isFinite(p.maxStillFraction)||p.maxStillFraction<0||p.maxStillFraction>1){
    throw new Error('visual_policy_invalid');
  }
  const masterSha256=digest(filePath);
  if(expectedSha256 && (!HEX.test(expectedSha256.replace(/^sha256:/i,''))||
      masterSha256!==expectedSha256.replace(/^sha256:/i,'').toLowerCase()))throw new Error('visual_digest_mismatch');
  const probe=JSON.parse(run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',filePath]));
  const video=(probe.streams||[]).filter(s=>s.codec_type==='video');
  if(video.length!==1)throw new Error('visual_video_stream_count_invalid');
  const duration=Number(probe.format?.duration);
  if(!Number.isFinite(duration)||duration<=0||duration>60)throw new Error('visual_duration_invalid');
  validateBeats(beats,duration);
  const out=run('ffmpeg',['-nostdin','-hide_banner','-v','error','-i',filePath,'-map','0:v:0',
    '-vf','fps='+FPS+',scale='+W+':'+H+':flags=area,format=gray',
    '-f','rawvideo','-pix_fmt','gray','pipe:1'],null);
  const raw=Buffer.isBuffer(out)?out:Buffer.from(out||[]);
  if(!raw.length||raw.length%BYTES)throw new Error('visual_decoded_frames_invalid');
  const count=raw.length/BYTES;
  if(count<2)throw new Error('visual_sample_count_invalid');
  const activity=[null];
  for(let i=1;i<count;i++){
    const a=raw.subarray((i-1)*BYTES,i*BYTES),b=raw.subarray(i*BYTES,(i+1)*BYTES);
    activity.push(round(lumaActivity(a,b)));
  }
  const segments=[];let cursor=0;
  for(const beat of beats){
    const start=cursor,end=cursor+beat.durationSec;
    const first=Math.max(0,Math.ceil(start*FPS)),last=Math.min(count,Math.ceil(end*FPS));
    const samples=[];
    for(let i=first+1;i<last;i++)if(activity[i]!==null)samples.push(activity[i]);
    let still=0,runLength=0,longest=0;
    for(const diff of samples){
      if(diff<p.minMotionDifference){still++;runLength++;longest=Math.max(longest,runLength);}
      else runLength=0;
    }
    const stillFraction=samples.length?round(still/samples.length):null;
    const maxStillRunSec=round(longest/FPS);
    const flags=[];
    if(samples.length<2)flags.push('motion_sampling_insufficient');
    if(maxStillRunSec>p.maxStillRunSec)flags.push('long_low_activity_run');
    if(samples.length>=4&&stillFraction>p.maxStillFraction)flags.push('predominantly_low_motion');
    segments.push({
      beatId:beat.id,startSec:round(start),endSec:round(end),sampleCount:samples.length,
      meanLumaDifference:samples.length?round(samples.reduce((a,b)=>a+b,0)/samples.length):null,
      stillFraction,maxStillRunSec,flags,
    });
    cursor=end;
  }
  return {
    schema:SCHEMA,
    status:segments.some(s=>s.flags.length)?'review_required':'accepted',
    masterSha256,durationSec:round(duration),sampleFps:FPS,sampledFrames:count,
    policy:p,segments,evidenceRefs:['sha256:'+masterSha256,'ffprobe:video','ffmpeg:4fps-luma'],
    boundaries:{objectiveLumaMotionOnly:true,stillnessMayBeIntentional:true,
      noVisualRealismOrQualityGuarantee:true,humanFrameAndMobileReviewRequired:true,
      publicationAuthorityGranted:false},
  };
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [, ,master,story,output]=process.argv;
  try{
    if(!master||!story)throw new Error('Usage: node commercial-visual-qc.mjs <master.mp4> <storyboard.json> [receipt.json]');
    const obj=JSON.parse(fs.readFileSync(story,'utf8'));
    const receipt=inspectCommercialPicture({filePath:master,beats:obj.beats||obj});
    if(output){fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});fs.writeFileSync(output,JSON.stringify(receipt,null,2)+'\n');}
    console.log(JSON.stringify(receipt,null,2));
    if(receipt.status!=='accepted')process.exitCode=2;
  }catch(err){console.error(err instanceof Error?err.message:String(err));process.exitCode=1;}
}
