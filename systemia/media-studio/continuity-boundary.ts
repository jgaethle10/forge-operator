import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { ShotCandidate } from './shot-tournament.js';

export type BoundaryContinuityMetric =
  | 'identity'
  | 'wardrobe'
  | 'prop_state'
  | 'environment'
  | 'lighting'
  | 'action_phase'
  | 'screen_geography';

export interface BoundaryFrameSignature {
  sha256:string;
  perceptualHash:string;
  averageRgb:[number,number,number];
  luminance:number;
  edgeEnergy:number;
}

export interface BoundaryFrameEvidence {
  artifactDigest:string;
  candidateId:string;
  shotId:string;
  timestampSec:number;
  framePath:string;
  signature:BoundaryFrameSignature;
}

export interface ContinuityBoundaryPacket {
  schema:'evercraft.fallen.continuity-boundary-packet.v1';
  id:string;
  continuityDigest:string;
  previous:BoundaryFrameEvidence;
  current:BoundaryFrameEvidence;
  entityIds:string[];
  requiredMetrics:BoundaryContinuityMetric[];
  localComparison:{
    perceptualDistance:number;
    colorDistance:number;
    luminanceDelta:number;
    edgeEnergyDelta:number;
  };
  packetDigest:string;
  createdAt:string;
}

export interface BoundaryVisualReceipt {
  schema:'evercraft.fallen.boundary-visual-receipt.v1';
  packetDigest:string;
  metric:BoundaryContinuityMetric;
  verifierId:string;
  verifierState:'declared'|'verified';
  score:number;
  threshold:number;
  previousArtifactDigest:string;
  currentArtifactDigest:string;
  previousFrameSha256:string;
  currentFrameSha256:string;
  entityIds:string[];
  findings?:string[];
}

export interface BoundaryContinuityAdmission {
  schema:'evercraft.fallen.boundary-continuity-admission.v1';
  packetDigest:string;
  previousArtifactDigest:string;
  currentArtifactDigest:string;
  status:'accepted'|'rejected';
  reasons:string[];
  warnings:string[];
  verifiedMetrics:BoundaryContinuityMetric[];
  receiptDigest:string;
  boundaries:{
    exactBoundaryFramesBound:true;
    verifierReceiptsRequired:true;
    localSimilarityIsNotIdentityProof:true;
    timelineAdmissionMayFailClosed:true;
    publicationAuthorityGranted:false;
  };
  admittedAt:string;
}

export interface BoundaryContinuityPolicy {
  requiredMetrics?:BoundaryContinuityMetric[];
  minScore?:number;
  matchCutExpected?:boolean;
  maxPerceptualDistance?:number;
  maxColorDistance?:number;
  maxLuminanceDelta?:number;
}

const DEFAULT_METRICS:BoundaryContinuityMetric[]=[
  'identity',
  'wardrobe',
  'prop_state',
  'environment',
  'lighting',
  'action_phase',
  'screen_geography',
];

function run(command:string,args:string[],encoding:BufferEncoding|null='utf8'){
  const result=spawnSync(command,args,{encoding,maxBuffer:128*1024*1024});
  if(result.error) throw new Error(command+'_failed:'+result.error.message);
  if(result.status!==0){
    throw new Error(command+'_failed:'+String(result.stderr||'').trim().slice(-1200));
  }
  return result;
}

function hashFile(filePath:string){
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
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

function expectedDigest(candidate:ShotCandidate){
  return candidate.artifactDigest.replace(/^sha256:/,'').toLowerCase();
}

function verifyCandidate(candidate:ShotCandidate){
  if(!fs.existsSync(candidate.artifactPath)){
    throw new Error('continuity_candidate_missing:'+candidate.id);
  }
  const observed=hashFile(candidate.artifactPath);
  const expected=expectedDigest(candidate);
  if(expected&&observed!==expected){
    throw new Error('continuity_candidate_digest_mismatch:'+candidate.id);
  }
  return observed;
}

function durationSec(candidate:ShotCandidate){
  if(candidate.kind==='image') return 0;
  if(Number.isFinite(candidate.durationSec)&&Number(candidate.durationSec)>0){
    return Number(candidate.durationSec);
  }
  const result=run('ffprobe',[
    '-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',
    candidate.artifactPath,
  ]);
  const observed=Number(String(result.stdout||'').trim());
  if(!Number.isFinite(observed)||observed<=0){
    throw new Error('continuity_candidate_duration_invalid:'+candidate.id);
  }
  return observed;
}

function extractJpeg(candidate:ShotCandidate,timestampSec:number,outputPath:string){
  const args=['-y','-v','error'];
  if(candidate.kind==='video') args.push('-ss',String(timestampSec));
  args.push('-i',candidate.artifactPath,'-frames:v','1','-vf','scale=960:-2:flags=lanczos',outputPath);
  run('ffmpeg',args);
}

function rawFrame(candidate:ShotCandidate,timestampSec:number,filter:string,pixFmt:string){
  const args=['-v','error'];
  if(candidate.kind==='video') args.push('-ss',String(timestampSec));
  args.push(
    '-i',candidate.artifactPath,
    '-frames:v','1',
    '-vf',filter,
    '-f','rawvideo',
    '-pix_fmt',pixFmt,
    'pipe:1'
  );
  const result=run('ffmpeg',args,null);
  return Buffer.isBuffer(result.stdout)?result.stdout:Buffer.from(result.stdout||[]);
}

function dhash(candidate:ShotCandidate,timestampSec:number){
  const data=rawFrame(candidate,timestampSec,'scale=9:8:flags=area,format=gray','gray');
  if(data.length<72) throw new Error('continuity_frame_hash_bytes_missing:'+candidate.id);
  let bits=0n;
  let index=0n;
  for(let y=0;y<8;y+=1){
    for(let x=0;x<8;x+=1){
      const left=data[y*9+x];
      const right=data[y*9+x+1];
      if(left>right) bits|=(1n<<index);
      index+=1n;
    }
  }
  return bits.toString(16).padStart(16,'0');
}

function visualStats(candidate:ShotCandidate,timestampSec:number){
  const width=32,height=18;
  const data=rawFrame(candidate,timestampSec,`scale=${width}:${height}:flags=area,format=rgb24`,'rgb24');
  const pixels=width*height;
  if(data.length<pixels*3) throw new Error('continuity_frame_rgb_bytes_missing:'+candidate.id);
  let r=0,g=0,b=0,luma=0,edges=0,edgeCount=0;
  const gray=new Float64Array(pixels);
  for(let i=0;i<pixels;i+=1){
    const rr=data[i*3],gg=data[i*3+1],bb=data[i*3+2];
    r+=rr; g+=gg; b+=bb;
    const y=.2126*rr+.7152*gg+.0722*bb;
    gray[i]=y; luma+=y;
  }
  for(let y=0;y<height;y+=1){
    for(let x=0;x<width;x+=1){
      const i=y*width+x;
      if(x+1<width){edges+=Math.abs(gray[i]-gray[i+1]);edgeCount+=1;}
      if(y+1<height){edges+=Math.abs(gray[i]-gray[i+width]);edgeCount+=1;}
    }
  }
  return {
    averageRgb:[
      Number((r/pixels/255).toFixed(4)),
      Number((g/pixels/255).toFixed(4)),
      Number((b/pixels/255).toFixed(4)),
    ] as [number,number,number],
    luminance:Number((luma/pixels/255).toFixed(4)),
    edgeEnergy:Number((edges/Math.max(1,edgeCount)/255).toFixed(4)),
  };
}

function signature(candidate:ShotCandidate,timestampSec:number,framePath:string):BoundaryFrameSignature{
  const stats=visualStats(candidate,timestampSec);
  return {
    sha256:hashFile(framePath),
    perceptualHash:dhash(candidate,timestampSec),
    averageRgb:stats.averageRgb,
    luminance:stats.luminance,
    edgeEnergy:stats.edgeEnergy,
  };
}

function hamming(a:string,b:string){
  let value=BigInt('0x'+a)^BigInt('0x'+b);
  let count=0;
  while(value){
    count+=Number(value&1n);
    value>>=1n;
  }
  return count/64;
}

function colorDistance(a:[number,number,number],b:[number,number,number]){
  const sum=a.reduce((total,value,index)=>total+(value-b[index])**2,0);
  return Number((Math.sqrt(sum)/Math.sqrt(3)).toFixed(4));
}

function frameEvidence(
  candidate:ShotCandidate,
  timestampSec:number,
  outputDir:string,
  label:string,
):BoundaryFrameEvidence{
  const framePath=path.join(outputDir,label+'.jpg');
  extractJpeg(candidate,timestampSec,framePath);
  return {
    artifactDigest:verifyCandidate(candidate),
    candidateId:candidate.id,
    shotId:candidate.shotId,
    timestampSec,
    framePath,
    signature:signature(candidate,timestampSec,framePath),
  };
}

export function prepareContinuityBoundary(input:{
  id:string;
  continuityDigest:string;
  previous:ShotCandidate;
  current:ShotCandidate;
  entityIds?:string[];
  requiredMetrics?:BoundaryContinuityMetric[];
  outputDir?:string;
}):ContinuityBoundaryPacket{
  if(!input.id?.trim()) throw new Error('continuity_boundary_id_missing');
  if(!input.continuityDigest?.trim()) throw new Error('continuity_boundary_digest_missing');

  const root=path.resolve(
    input.outputDir??fs.mkdtempSync(path.join(os.tmpdir(),'fallen-continuity-boundary-')),
    input.id
  );
  fs.mkdirSync(root,{recursive:true});

  const previousDuration=durationSec(input.previous);
  const currentDuration=durationSec(input.current);
  const previousTime=input.previous.kind==='video'?Math.max(0,previousDuration-.05):0;
  const currentTime=input.current.kind==='video'?Math.min(.05,Math.max(0,currentDuration-.001)):0;

  const previous=frameEvidence(input.previous,previousTime,root,'previous-end');
  const current=frameEvidence(input.current,currentTime,root,'current-start');
  const localComparison={
    perceptualDistance:Number(hamming(
      previous.signature.perceptualHash,
      current.signature.perceptualHash
    ).toFixed(4)),
    colorDistance:colorDistance(previous.signature.averageRgb,current.signature.averageRgb),
    luminanceDelta:Number(Math.abs(
      previous.signature.luminance-current.signature.luminance
    ).toFixed(4)),
    edgeEnergyDelta:Number(Math.abs(
      previous.signature.edgeEnergy-current.signature.edgeEnergy
    ).toFixed(4)),
  };

  const withoutDigest={
    schema:'evercraft.fallen.continuity-boundary-packet.v1' as const,
    id:input.id,
    continuityDigest:input.continuityDigest,
    previous,
    current,
    entityIds:[...new Set(input.entityIds??[])],
    requiredMetrics:[...new Set(input.requiredMetrics??DEFAULT_METRICS)],
    localComparison,
    createdAt:new Date().toISOString(),
  };

  return {
    ...withoutDigest,
    packetDigest:digest({...withoutDigest,createdAt:undefined}),
  };
}

export function admitContinuityBoundary(input:{
  packet:ContinuityBoundaryPacket;
  receipts:BoundaryVisualReceipt[];
  policy?:BoundaryContinuityPolicy;
}):BoundaryContinuityAdmission{
  const packet=input.packet;
  if(packet.schema!=='evercraft.fallen.continuity-boundary-packet.v1'){
    throw new Error('continuity_boundary_packet_schema_invalid');
  }

  const policy={
    requiredMetrics:input.policy?.requiredMetrics??packet.requiredMetrics,
    minScore:input.policy?.minScore??.8,
    matchCutExpected:input.policy?.matchCutExpected??false,
    maxPerceptualDistance:input.policy?.maxPerceptualDistance??.55,
    maxColorDistance:input.policy?.maxColorDistance??.35,
    maxLuminanceDelta:input.policy?.maxLuminanceDelta??.35,
  };

  const reasons:string[]=[];
  const warnings:string[]=[];
  const verifiedMetrics=new Set<BoundaryContinuityMetric>();

  for(const receipt of input.receipts){
    if(receipt.schema!=='evercraft.fallen.boundary-visual-receipt.v1'){
      reasons.push('receipt_schema_invalid');
      continue;
    }
    if(receipt.packetDigest!==packet.packetDigest){
      reasons.push('receipt_packet_digest_mismatch:'+receipt.metric);
      continue;
    }
    if(
      receipt.previousArtifactDigest!==packet.previous.artifactDigest||
      receipt.currentArtifactDigest!==packet.current.artifactDigest||
      receipt.previousFrameSha256!==packet.previous.signature.sha256||
      receipt.currentFrameSha256!==packet.current.signature.sha256
    ){
      reasons.push('receipt_boundary_evidence_mismatch:'+receipt.metric);
      continue;
    }
    if(receipt.verifierState!=='verified'){
      reasons.push('receipt_verifier_unverified:'+receipt.metric);
      continue;
    }
    if(!Number.isFinite(receipt.score)||!Number.isFinite(receipt.threshold)){
      reasons.push('receipt_score_invalid:'+receipt.metric);
      continue;
    }
    const threshold=Math.max(policy.minScore,receipt.threshold);
    if(receipt.score<threshold){
      reasons.push('continuity_metric_failed:'+receipt.metric);
      continue;
    }
    const requiredEntities=new Set(packet.entityIds);
    if(
      (receipt.metric==='identity'||receipt.metric==='wardrobe'||receipt.metric==='prop_state')&&
      [...requiredEntities].some(entity=>!receipt.entityIds.includes(entity))
    ){
      reasons.push('receipt_entity_coverage_missing:'+receipt.metric);
      continue;
    }
    verifiedMetrics.add(receipt.metric);
  }

  for(const metric of policy.requiredMetrics){
    if(!verifiedMetrics.has(metric)) reasons.push('required_continuity_metric_missing:'+metric);
  }

  const local=packet.localComparison;
  if(policy.matchCutExpected){
    if(local.perceptualDistance>policy.maxPerceptualDistance){
      reasons.push('match_cut_perceptual_jump_excessive');
    }
    if(local.colorDistance>policy.maxColorDistance){
      reasons.push('match_cut_color_jump_excessive');
    }
    if(local.luminanceDelta>policy.maxLuminanceDelta){
      reasons.push('match_cut_luminance_jump_excessive');
    }
  }else{
    if(local.perceptualDistance>.9) warnings.push('gross_boundary_perceptual_change');
    if(local.colorDistance>.65) warnings.push('gross_boundary_color_change');
    if(local.luminanceDelta>.65) warnings.push('gross_boundary_luminance_change');
  }

  const receiptCore={
    packetDigest:packet.packetDigest,
    previousArtifactDigest:packet.previous.artifactDigest,
    currentArtifactDigest:packet.current.artifactDigest,
    status:reasons.length?'rejected':'accepted',
    reasons:[...new Set(reasons)],
    warnings:[...new Set(warnings)],
    verifiedMetrics:[...verifiedMetrics].sort(),
  };

  return {
    schema:'evercraft.fallen.boundary-continuity-admission.v1',
    ...receiptCore,
    status:receiptCore.status as 'accepted'|'rejected',
    verifiedMetrics:receiptCore.verifiedMetrics as BoundaryContinuityMetric[],
    receiptDigest:digest(receiptCore),
    boundaries:{
      exactBoundaryFramesBound:true,
      verifierReceiptsRequired:true,
      localSimilarityIsNotIdentityProof:true,
      timelineAdmissionMayFailClosed:true,
      publicationAuthorityGranted:false,
    },
    admittedAt:new Date().toISOString(),
  };
}
