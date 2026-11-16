#!/usr/bin/env node
// Conservative pixel concordance between verified source footage and a rendered documentary master.
import crypto from 'node:crypto';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const W=96,H=54,N=W*H,round=x=>Number(x.toFixed(5));
function hashFile(file){
  const h=crypto.createHash('sha256'),fd=fs.openSync(file,'r'),buf=Buffer.allocUnsafe(1048576);
  try{for(;;){const n=fs.readSync(fd,buf,0,buf.length,null);if(!n)break;h.update(buf.subarray(0,n));}}
  finally{fs.closeSync(fd);}
  return h.digest('hex');
}
function decode(file,sec){
  const r=spawnSync('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-ss',
    String(sec.toFixed(4)),'-i',file,'-map','0:v:0','-frames:v','1',
    '-vf','scale='+W+':'+H+':flags=area,format=gray','-f','rawvideo','-pix_fmt','gray','pipe:1'],
    {encoding:null,timeout:25000,maxBuffer:1024*1024});
  if(r.error||r.status!==0||!Buffer.isBuffer(r.stdout)||r.stdout.length!==N)
    throw Error('frame_decode_failed');
  return r.stdout;
}
function similarity(a,b){
  if(a.length!==N||b.length!==N)throw Error('frame_size_invalid');
  let sa=0,sb=0,aa=0,bb=0,ab=0,difference=0;
  for(let i=0;i<N;i++){const x=a[i],y=b[i];sa+=x;sb+=y;aa+=x*x;bb+=y*y;ab+=x*y;difference+=Math.abs(x-y);}
  const covariance=ab-sa*sb/N;
  const deviation=Math.sqrt(Math.max(0,aa-sa*sa/N)*Math.max(0,bb-sb*sb/N));
  const correlation=deviation>0?covariance/deviation:(difference===0?1:0);
  return{correlation:round(correlation),meanAbsoluteLumaDifference:round(difference/(N*255))};
}
export function inspectDocumentarySourceConcordance({masterPath,expectedMasterSha256,sources,shots,minCorrelation=.58}){
  const report={schema:'evercraft.fallen.documentary-source-concordance.v1',
    status:'blocked',masterSha256:null,sourceMatches:[],blockers:[],
    boundaries:{sourceFramesComparedToExactMaster:true,notProofOfRightsOrNewsAuthenticity:true,
      cropsColorGradesAndOverlaysCanNeedHumanInspection:true,
      privateEditorialReviewStillRequired:true,clientApprovalGranted:false,publicationAuthorityGranted:false}};
  if(!masterPath||!fs.existsSync(masterPath)){report.blockers.push('master_missing');return report;}
  const masterSha256=hashFile(masterPath);
  report.masterSha256=masterSha256;
  if(!/^[a-f0-9]{64}$/i.test(expectedMasterSha256||'')||
    masterSha256!==expectedMasterSha256){report.blockers.push('master_digest_mismatch');return report;}
  if(!Number.isFinite(minCorrelation)||minCorrelation<.55||minCorrelation>.95){
    report.blockers.push('matching_policy_invalid');return report;}
  const sourceMap=new Map((sources||[]).filter(s=>s&&typeof s.id==='string').map(s=>[s.id,s]));
  const footage=(shots||[]).filter(s=>s?.type==='footage');
  if(!footage.length){report.blockers.push('real_footage_shots_missing');return report;}
  for(const shot of footage){
    const source=sourceMap.get(shot.sourceId),id=String(shot.id||'unknown');
    if(!source||!source.path||!Number.isFinite(shot.startSec)||!Number.isFinite(shot.sourceInSec)||
      !Number.isFinite(shot.durationSec)||shot.durationSec<=0){
      report.blockers.push('source_alignment_missing:'+id);continue;}
    const masterMid=shot.startSec+shot.durationSec*.5,sourceMid=shot.sourceInSec+shot.durationSec*.5;
    try{
      const match=similarity(decode(masterPath,masterMid),decode(source.path,sourceMid));
      const accepted=match.correlation>=minCorrelation;
      report.sourceMatches.push({shotId:id,sourceId:source.id,atMasterSec:round(masterMid),
        atSourceSec:round(sourceMid),...match,status:accepted?'correlated':'review_required'});
      if(!accepted)report.blockers.push('source_to_master_pixel_mismatch:'+id);
    }catch{report.blockers.push('source_to_master_pixel_inspection_failed:'+id);}
  }
  report.status=report.blockers.length?'blocked':'pixel_concordance_verified_for_private_review';
  return report;
}
