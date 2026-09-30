import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { IdentityEvidence } from './types.js';

export interface NormalizedRegion {
  x:number;
  y:number;
  width:number;
  height:number;
}

export interface IdentityReferenceInput {
  id:string;
  path:string;
  sha256:string;
  region?:NormalizedRegion;
  sourceRefs:string[];
}

export interface IdentitySampleInput {
  timestampSec:number;
  region:NormalizedRegion;
}

export interface IdentityFingerprintRequest {
  schema:'evercraft.fallen.identity-fingerprint-request.v1';
  id:string;
  entityId:string;
  candidatePath:string;
  candidateSha256:string;
  references:IdentityReferenceInput[];
  samples:IdentitySampleInput[];
  visualVerifierRequired?:boolean;
}

export interface VisualIdentityFingerprint {
  perceptualHash:string;
  meanRgb:[number,number,number];
  luminance:number;
  edgeEnergy:number;
  contrast:number;
}

export interface IdentitySampleFingerprint {
  timestampSec:number;
  frameSha256:string;
  cropSha256:string;
  region:NormalizedRegion;
  fingerprint:VisualIdentityFingerprint;
  bestReferenceId:string;
  bestLocalDistance:number;
}

export interface IdentityFingerprintPacket {
  schema:'evercraft.fallen.identity-fingerprint-packet.v1';
  id:string;
  entityId:string;
  candidateSha256:string;
  referenceDigests:Array<{id:string;sha256:string}>;
  samples:IdentitySampleFingerprint[];
  aggregate:{
    meanBestDistance:number;
    maxBestDistance:number;
    p90BestDistance:number;
  };
  packetDigest:string;
  boundaries:{
    localFingerprintIsGrossAppearanceCheck:true;
    localFingerprintIsNotBiometricIdentityProof:true;
    verifiedVisualIdentityReceiptRequired:true;
    exactCandidateDigestBound:true;
    exactReferenceDigestsBound:true;
    publicationAuthorityGranted:false;
  };
  createdAt:string;
}

export interface VisualIdentityVerifierReceipt {
  schema:'evercraft.fallen.visual-identity-verifier-receipt.v1';
  packetDigest:string;
  entityId:string;
  candidateSha256:string;
  referenceIds:string[];
  verifierId:string;
  verifierState:'declared'|'verified';
  identityScore:number;
  threshold:number;
  sampledFrameSha256s:string[];
  findings?:string[];
}

export interface IdentityFingerprintAdmission {
  schema:'evercraft.fallen.identity-fingerprint-admission.v1';
  packetDigest:string;
  entityId:string;
  candidateSha256:string;
  status:'accepted'|'rejected';
  reasons:string[];
  warnings:string[];
  localMeanDistance:number;
  localMaxDistance:number;
  verifiedIdentityScore?:number;
  admissionDigest:string;
  boundaries:{
    grossAppearanceGateRequired:true;
    verifiedIdentityGateRequired:true;
    noBiometricClaim:true;
    publicationAuthorityGranted:false;
  };
  admittedAt:string;
}

export interface IdentityFingerprintPolicy {
  maxMeanDistance?:number;
  maxSampleDistance?:number;
  verifierMinScore?:number;
  maxWarningDistance?:number;
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

function run(command:string,args:string[],encoding:BufferEncoding|null='utf8'){
  const result=spawnSync(command,args,{encoding,maxBuffer:128*1024*1024});
  if(result.error) throw new Error(command+'_failed:'+result.error.message);
  if(result.status!==0) throw new Error(command+'_failed:'+String(result.stderr||'').trim().slice(-1200));
  return result.stdout;
}

function checkRegion(region:NormalizedRegion,label:string){
  for(const [key,value] of Object.entries(region)){
    if(!Number.isFinite(value)) throw new Error('identity_region_invalid:'+label+':'+key);
  }
  if(region.x<0||region.y<0||region.width<=0||region.height<=0||
     region.x+region.width>1.0001||region.y+region.height>1.0001){
    throw new Error('identity_region_out_of_bounds:'+label);
  }
  if(region.width<.04||region.height<.04){
    throw new Error('identity_region_too_small:'+label);
  }
}

function cropFilter(region:NormalizedRegion|undefined){
  if(!region) return 'scale=96:96:force_original_aspect_ratio=increase,crop=96:96';
  checkRegion(region,'crop');
  return [
    'crop=iw*'+region.width+':ih*'+region.height+':iw*'+region.x+':ih*'+region.y,
    'scale=96:96:flags=lanczos'
  ].join(',');
}

function renderCrop(input:{
  sourcePath:string;
  outputPath:string;
  timestampSec?:number;
  region?:NormalizedRegion;
}){
  const args=['-y','-v','error'];
  if(input.timestampSec!==undefined) args.push('-ss',String(input.timestampSec));
  args.push(
    '-i',input.sourcePath,
    '-frames:v','1',
    '-vf',cropFilter(input.region),
    input.outputPath
  );
  run('ffmpeg',args);
}

function rawRgb(filePath:string){
  const data=run('ffmpeg',[
    '-v','error','-i',filePath,'-frames:v','1',
    '-vf','scale=32:32:flags=area,format=rgb24',
    '-f','rawvideo','-pix_fmt','rgb24','pipe:1'
  ],null);
  return Buffer.isBuffer(data)?data:Buffer.from(data||[]);
}

function dhash(filePath:string){
  const data=run('ffmpeg',[
    '-v','error','-i',filePath,'-frames:v','1',
    '-vf','scale=9:8:flags=area,format=gray',
    '-f','rawvideo','-pix_fmt','gray','pipe:1'
  ],null);
  const bytes=Buffer.isBuffer(data)?data:Buffer.from(data||[]);
  if(bytes.length<72) throw new Error('identity_dhash_bytes_missing');
  let bits=0n,index=0n;
  for(let y=0;y<8;y+=1){
    for(let x=0;x<8;x+=1){
      if(bytes[y*9+x]>bytes[y*9+x+1]) bits|=1n<<index;
      index+=1n;
    }
  }
  return bits.toString(16).padStart(16,'0');
}

function fingerprint(filePath:string):VisualIdentityFingerprint{
  const data=rawRgb(filePath);
  if(data.length<32*32*3) throw new Error('identity_rgb_bytes_missing');
  const pixels=32*32;
  const gray=new Float64Array(pixels);
  let r=0,g=0,b=0,luma=0,variance=0,edges=0,edgeCount=0;
  for(let i=0;i<pixels;i+=1){
    const rr=data[i*3],gg=data[i*3+1],bb=data[i*3+2];
    r+=rr;g+=gg;b+=bb;
    const y=.2126*rr+.7152*gg+.0722*bb;
    gray[i]=y;luma+=y;
  }
  const mean=luma/pixels;
  for(let i=0;i<pixels;i+=1) variance+=(gray[i]-mean)**2;
  for(let y=0;y<32;y+=1){
    for(let x=0;x<32;x+=1){
      const i=y*32+x;
      if(x<31){edges+=Math.abs(gray[i]-gray[i+1]);edgeCount+=1;}
      if(y<31){edges+=Math.abs(gray[i]-gray[i+32]);edgeCount+=1;}
    }
  }
  return {
    perceptualHash:dhash(filePath),
    meanRgb:[
      Number((r/pixels/255).toFixed(4)),
      Number((g/pixels/255).toFixed(4)),
      Number((b/pixels/255).toFixed(4)),
    ],
    luminance:Number((mean/255).toFixed(4)),
    edgeEnergy:Number((edges/Math.max(1,edgeCount)/255).toFixed(4)),
    contrast:Number((Math.sqrt(variance/pixels)/255).toFixed(4)),
  };
}

function hamming(a:string,b:string){
  let v=BigInt('0x'+a)^BigInt('0x'+b),count=0;
  while(v){count+=Number(v&1n);v>>=1n;}
  return count/64;
}

function euclid(a:number[],b:number[]){
  const n=Math.min(a.length,b.length);
  let sum=0;
  for(let i=0;i<n;i+=1) sum+=(a[i]-b[i])**2;
  return Math.sqrt(sum/Math.max(1,n));
}

function localDistance(a:VisualIdentityFingerprint,b:VisualIdentityFingerprint){
  const hash=hamming(a.perceptualHash,b.perceptualHash);
  const color=euclid(a.meanRgb,b.meanRgb);
  const luma=Math.abs(a.luminance-b.luminance);
  const edge=Math.abs(a.edgeEnergy-b.edgeEnergy);
  const contrast=Math.abs(a.contrast-b.contrast);
  return Number((hash*.5+color*.18+luma*.1+edge*.12+contrast*.1).toFixed(4));
}

function percentile(values:number[],p:number){
  const sorted=[...values].sort((a,b)=>a-b);
  if(!sorted.length) return 0;
  const index=Math.min(sorted.length-1,Math.max(0,Math.ceil(p*sorted.length)-1));
  return sorted[index];
}

export function prepareIdentityFingerprintPacket(
  request:IdentityFingerprintRequest,
):IdentityFingerprintPacket{
  if(request.schema!=='evercraft.fallen.identity-fingerprint-request.v1') throw new Error('identity_fingerprint_schema_invalid');
  if(!request.id?.trim()) throw new Error('identity_fingerprint_id_missing');
  if(!request.entityId?.trim()) throw new Error('identity_fingerprint_entity_missing');
  if(request.references.length<1) throw new Error('identity_fingerprint_references_missing');
  if(request.samples.length<2) throw new Error('identity_fingerprint_samples_insufficient');
  if(!fs.existsSync(request.candidatePath)) throw new Error('identity_candidate_missing');
  const candidateSha256=hashFile(request.candidatePath);
  if(candidateSha256!==request.candidateSha256.replace(/^sha256:/,'').toLowerCase()){
    throw new Error('identity_candidate_digest_mismatch');
  }

  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-identity-'));
  const refs=request.references.map((reference,index)=>{
    if(!reference.sourceRefs?.length) throw new Error('identity_reference_source_refs_missing:'+reference.id);
    if(!fs.existsSync(reference.path)) throw new Error('identity_reference_missing:'+reference.id);
    const observed=hashFile(reference.path);
    const expected=reference.sha256.replace(/^sha256:/,'').toLowerCase();
    if(observed!==expected) throw new Error('identity_reference_digest_mismatch:'+reference.id);
    if(reference.region) checkRegion(reference.region,'reference:'+reference.id);
    const crop=path.join(root,'ref-'+String(index).padStart(2,'0')+'.png');
    renderCrop({sourcePath:reference.path,outputPath:crop,region:reference.region});
    return {id:reference.id,sha256:observed,fingerprint:fingerprint(crop)};
  });

  const samples=request.samples.map((sample,index):IdentitySampleFingerprint=>{
    checkRegion(sample.region,'sample:'+index);
    if(!Number.isFinite(sample.timestampSec)||sample.timestampSec<0){
      throw new Error('identity_sample_timestamp_invalid:'+index);
    }
    const crop=path.join(root,'sample-'+String(index).padStart(2,'0')+'.png');
    const frame=path.join(root,'frame-'+String(index).padStart(2,'0')+'.png');
    renderCrop({sourcePath:request.candidatePath,outputPath:frame,timestampSec:sample.timestampSec});
    renderCrop({sourcePath:request.candidatePath,outputPath:crop,timestampSec:sample.timestampSec,region:sample.region});
    const fp=fingerprint(crop);
    const ranked=refs
      .map(reference=>({id:reference.id,distance:localDistance(fp,reference.fingerprint)}))
      .sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id));
    return {
      timestampSec:sample.timestampSec,
      frameSha256:hashFile(frame),
      cropSha256:hashFile(crop),
      region:sample.region,
      fingerprint:fp,
      bestReferenceId:ranked[0].id,
      bestLocalDistance:ranked[0].distance,
    };
  });

  const distances=samples.map(sample=>sample.bestLocalDistance);
  const aggregate={
    meanBestDistance:Number((distances.reduce((a,b)=>a+b,0)/distances.length).toFixed(4)),
    maxBestDistance:Number(Math.max(...distances).toFixed(4)),
    p90BestDistance:Number(percentile(distances,.9).toFixed(4)),
  };

  const core={
    schema:'evercraft.fallen.identity-fingerprint-packet.v1' as const,
    id:request.id,
    entityId:request.entityId,
    candidateSha256,
    referenceDigests:refs.map(reference=>({id:reference.id,sha256:reference.sha256})),
    samples,
    aggregate,
    boundaries:{
      localFingerprintIsGrossAppearanceCheck:true as const,
      localFingerprintIsNotBiometricIdentityProof:true as const,
      verifiedVisualIdentityReceiptRequired:true as const,
      exactCandidateDigestBound:true as const,
      exactReferenceDigestsBound:true as const,
      publicationAuthorityGranted:false as const,
    },
    createdAt:new Date().toISOString(),
  };
  return {...core,packetDigest:digest({...core,createdAt:undefined})};
}

export function admitIdentityFingerprint(input:{
  packet:IdentityFingerprintPacket;
  verifierReceipt?:VisualIdentityVerifierReceipt;
  policy?:IdentityFingerprintPolicy;
}):IdentityFingerprintAdmission{
  const policy={
    maxMeanDistance:input.policy?.maxMeanDistance??.38,
    maxSampleDistance:input.policy?.maxSampleDistance??.58,
    verifierMinScore:input.policy?.verifierMinScore??.86,
    maxWarningDistance:input.policy?.maxWarningDistance??.48,
  };
  const {packet}=input;
  const reasons:string[]=[];
  const warnings:string[]=[];

  if(packet.aggregate.meanBestDistance>policy.maxMeanDistance) reasons.push('gross_appearance_mean_drift');
  if(packet.aggregate.maxBestDistance>policy.maxSampleDistance) reasons.push('gross_appearance_sample_drift');
  else if(packet.aggregate.maxBestDistance>policy.maxWarningDistance) warnings.push('gross_appearance_near_limit');

  const receipt=input.verifierReceipt;
  let verifiedIdentityScore:number|undefined;
  if(!receipt){
    reasons.push('verified_visual_identity_receipt_missing');
  }else{
    if(receipt.schema!=='evercraft.fallen.visual-identity-verifier-receipt.v1') reasons.push('identity_verifier_schema_invalid');
    if(receipt.packetDigest!==packet.packetDigest) reasons.push('identity_verifier_packet_mismatch');
    if(receipt.entityId!==packet.entityId) reasons.push('identity_verifier_entity_mismatch');
    if(receipt.candidateSha256!==packet.candidateSha256) reasons.push('identity_verifier_candidate_mismatch');
    if(receipt.verifierState!=='verified') reasons.push('identity_verifier_unverified');
    const requiredRefs=new Set(packet.referenceDigests.map(item=>item.id));
    if([...requiredRefs].some(id=>!receipt.referenceIds.includes(id))) reasons.push('identity_verifier_reference_coverage_missing');
    const requiredFrames=new Set(packet.samples.map(sample=>sample.frameSha256));
    if([...requiredFrames].some(id=>!receipt.sampledFrameSha256s.includes(id))) reasons.push('identity_verifier_frame_coverage_missing');
    const threshold=Math.max(policy.verifierMinScore,receipt.threshold);
    if(!Number.isFinite(receipt.identityScore)||receipt.identityScore<threshold) reasons.push('verified_identity_score_failed');
    else verifiedIdentityScore=receipt.identityScore;
  }

  const core={
    packetDigest:packet.packetDigest,
    entityId:packet.entityId,
    candidateSha256:packet.candidateSha256,
    status:reasons.length?'rejected':'accepted',
    reasons:[...new Set(reasons)],
    warnings:[...new Set(warnings)],
    localMeanDistance:packet.aggregate.meanBestDistance,
    localMaxDistance:packet.aggregate.maxBestDistance,
    verifiedIdentityScore,
  };

  return {
    schema:'evercraft.fallen.identity-fingerprint-admission.v1',
    ...core,
    status:core.status as 'accepted'|'rejected',
    admissionDigest:digest(core),
    boundaries:{
      grossAppearanceGateRequired:true,
      verifiedIdentityGateRequired:true,
      noBiometricClaim:true,
      publicationAuthorityGranted:false,
    },
    admittedAt:new Date().toISOString(),
  };
}

export function identityAdmissionToEvidence(input:{
  admission:IdentityFingerprintAdmission;
  referenceAssetIds:string[];
  verifierId?:string;
  threshold?:number;
}):IdentityEvidence{
  if(input.admission.status!=='accepted') throw new Error('identity_admission_not_accepted');
  if(input.admission.verifiedIdentityScore===undefined) throw new Error('identity_admission_verified_score_missing');
  if(!input.referenceAssetIds.length) throw new Error('identity_evidence_reference_assets_missing');
  return {
    entityId:input.admission.entityId,
    verifierId:input.verifierId??'fallen-identity-fingerprint-v1',
    verifierState:'verified',
    score:input.admission.verifiedIdentityScore,
    threshold:input.threshold??.86,
    referenceAssetIds:[...new Set(input.referenceAssetIds)],
    candidateDigest:input.admission.candidateSha256,
  };
}
