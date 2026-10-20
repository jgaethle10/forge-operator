#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const shaOK=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const err=x=>{throw Error('visual_lanes_'+x)};
function run(cmd,args){
 const r=spawnSync(cmd,args,{encoding:'utf8',maxBuffer:8e6,timeout:120000});
 if(r.error||r.status!==0)err(cmd+'_failed_'+String(r.stderr||r.error||r.status).slice(-400));
 return r.stdout;
}
function inspect(file){
 const d=JSON.parse(run('ffprobe',['-v','error','-show_entries',
 'format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate','-of','json',file]));
 const v=d.streams?.find(s=>s.codec_type==='video');
 if(!v||!v.width||!v.height)err('video_missing');
 const duration=Number(d.format?.duration),fps=v.avg_frame_rate.split('/').map(Number);
 if(!Number.isFinite(duration)||duration<.5||duration>120||v.width<240||v.height<135||fps[1]===0)
 err('source_media_invalid');
 return {duration,width:v.width,height:v.height,videoCodec:v.codec_name,
 fps:fps[0]/fps[1],audio:Boolean(d.streams.find(s=>s.codec_type==='audio'))};
}
function text(v,label,max=90){
 if(typeof v!=='string'||v.trim().length<2||v.trim().length>max||/[\x00-\x1f\x7f]/.test(v))
 err(label+'_invalid');
 return v.trim();
}
function check(req){
 if(req?.schema!=='evercraft.fallen.visual-lanes-request.v1')err('schema_invalid');
 if(!/^[a-z0-9_-]{3,80}$/.test(req.id||''))err('id_invalid');
 const s=req.source;
 if(!s||!shaOK(s.sha256)||typeof s.path!=='string'||
  !['owned','licensed'].includes(s.rights)||
  !['synthetic_visualization','modeled_visualization','observed','licensed_source','product_capture'].includes(s.evidenceState)||
  !Array.isArray(s.sourceRefs)||!s.sourceRefs.length)err('source_evidence_invalid');
 if(s.rights==='licensed'&&!text(s.licenseRef,'license_ref'))err('license_missing');
 if(!req.brand||!['owned_concept','authorized_client'].includes(req.brand.state))err('brand_state_invalid');
 text(req.brand.name,'brand_name',60);
 if(req.brand.state==='authorized_client'&&!req.brand.permissionRef)err('brand_permission_missing');
 if(!Array.isArray(req.cuts)||req.cuts.length!==3||
  new Set(req.cuts.map(c=>c.lane)).size!==3||
  !['cinematic','educational','commercial'].every(l=>req.cuts.some(c=>c.lane===l)))err('cuts_missing');
 for(const c of req.cuts){
  text(c.title,'title',70);
  if(!['16:9','9:16','1:1'].includes(c.aspectRatio)||
    !['silent','preserve'].includes(c.audio))err('cut_contract_invalid');
  if(c.lane==='educational'){
   if(!Array.isArray(c.claims)||!c.claims.length||c.claims.length>4)err('education_claims_missing');
   for(const claim of c.claims){
    text(claim.text,'claim',58);
    if(!['modeled','synthetic','verified_fact'].includes(claim.kind))err('claim_kind_invalid');
    if(claim.kind==='verified_fact'&&
     (!Array.isArray(claim.sourceRefs)||!claim.sourceRefs.length||!req.brand.factReviewRef))
     err('historical_claim_evidence_missing');
   }
  }
  if(c.lane==='commercial'){
   text(c.tagline,'tagline',80);
   if(req.brand.state!=='authorized_client'&&c.cta)err('unauthorized_cta');
  }
 }
}
const dims={'16:9':[640,360],'9:16':[360,640],'1:1':[480,480]};
function filterPath(p){
 return p.replaceAll('\\','/').replaceAll(':','\\:').replaceAll("'",'\\'+"'"+'').replaceAll(',','\\,');
}
function makeFilter(width,height,textfiles,font,duration){
 let base='scale='+width+':'+height+':force_original_aspect_ratio=decrease:flags=lanczos,'+
 'pad='+width+':'+height+':(ow-iw)/2:(oh-ih)/2:color=0x0b1624,setsar=1';
 for(let i=0;i<textfiles.length;i++){
  const fontsize=width<400?(i===0?17:13):(i===0?20:14);
  const y=i===0?18:(textfiles.length===4?height-124+(i-1)*34:(i===1?height-67:height-35));
  base+=',drawtext=fontfile='+filterPath(font)+':textfile='+filterPath(textfiles[i])+
  ':fontsize='+fontsize+':fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y='+y;
 }
 return base+',fade=t=in:st=0:d=0.15,fade=t=out:st='+Math.max(.2,duration-.25).toFixed(2)+':d=0.25';
}
const fontPath='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
export function produceVisualLanes(request,outputDir){
 check(request);
 if(!outputDir||fs.existsSync(outputDir))err('output_exists_or_missing');
 const source=fs.realpathSync(request.source.path),st=fs.statSync(source);
 if(!st.isFile()||st.size>500e6||st.size<1024)err('source_size_invalid');
 if(hash(fs.readFileSync(source))!==request.source.sha256)err('source_hash_mismatch');
 if(!fs.existsSync(fontPath))err('font_not_available');
 const srcInfo=inspect(source),tmp=path.resolve(outputDir)+'.partial-'+process.pid;
 if(fs.existsSync(tmp))err('partial_exists');
 const artifacts=[];
 try{
  fs.mkdirSync(tmp,{recursive:false,mode:0o700});
  for(const cut of request.cuts){
   const [w,h]=dims[cut.aspectRatio];
   const isSynthetic=['synthetic_visualization','modeled_visualization'].includes(request.source.evidenceState);
   const labels=[cut.title];
   if(cut.lane==='educational'){
    labels.push(cut.claims[0].text);
    labels.push(isSynthetic?'ILLUSTRATIVE RECONSTRUCTION':'SOURCE BASED VISUALIZATION');
    labels.push('NOT AN OBSERVED HISTORICAL RECORD');
   }else if(cut.lane==='commercial'){
    labels.push(request.brand.name.toUpperCase()+'  '+cut.tagline);
    labels.push('INTERNAL CONCEPT  NOT A CLIENT AD');
   }else{
    labels.push(isSynthetic?'SYNTHETIC CINEMATIC STUDY':'EDITORIAL CINEMATIC STUDY');
    labels.push('INTERNAL REVIEW ONLY');
   }
   const textfiles=labels.map((value,i)=>{
    const p=path.join(tmp,cut.lane+'-'+i+'.txt');
    fs.writeFileSync(p,value,{flag:'wx',mode:0o600});return p;
   });
   const out=path.join(tmp,cut.lane+'.mp4');
   const args=['-hide_banner','-loglevel','error','-y','-i',source,
    '-vf',makeFilter(w,h,textfiles,fontPath,srcInfo.duration),'-map','0:v:0'];
   if(cut.audio==='preserve'&&srcInfo.audio)args.push('-map','0:a:0','-c:a','aac');
   else args.push('-an');
   args.push('-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p',
    '-r','24','-t',String(srcInfo.duration),'-movflags','+faststart',out);
   run('ffmpeg',args);
   const result=inspect(out);
   if(result.width!==w||result.height!==h||
    Math.abs(result.duration-srcInfo.duration)>.1||(cut.audio==='silent'&&result.audio))
    err('output_qc_failed_'+cut.lane);
   const frame=path.join(tmp,cut.lane+'.png');
   run('ffmpeg',['-hide_banner','-loglevel','error','-y','-ss',String(srcInfo.duration/2),
    '-i',out,'-frames:v','1',frame]);
   const sourceAspect=srcInfo.width/srcInfo.height,destAspect=w/h;
   const contentCoverage=Math.min(sourceAspect/destAspect,destAspect/sourceAspect);
   const reframingRequired=contentCoverage<.6;
   artifacts.push({lane:cut.lane,width:w,height:h,
    codec:result.videoCodec,durationSec:result.duration,hasAudio:result.audio,
    sourceFrameCoverage:Number(contentCoverage.toFixed(4)),
    compositionState:reframingRequired?'needs_dedicated_camera_or_reframe':'review_required',
    releaseEligible:false,
    videoFile:cut.lane+'.mp4',sha256:hash(fs.readFileSync(out)),
    frameFile:cut.lane+'.png',frameSha256:hash(fs.readFileSync(frame)),
    claims:cut.lane==='educational'?cut.claims:[],
    releaseState:'review_only',publicationAuthority:false});
  }
  const receipt={
   schema:'evercraft.fallen.visual-lanes-receipt.v1',id:request.id,
   sourceSha256:request.source.sha256,sourceEvidenceState:request.source.evidenceState,
   sourceRefs:request.source.sourceRefs,rights:request.source.rights,
   brand:request.brand,sourceProbe:srcInfo,deliverables:artifacts,
   publicationAuthority:false,clientDeliveryAuthority:false,
   quality:'source_resolution_review_previews_not_production_masters',
   gates:{rightsCheck:true,sourceHashVerified:true,sourceProvenanceRecorded:true,
    historicalFactVerificationExternal:true,clientApprovalMissing:true,
    creativeReviewRequired:true,masterQcStillRequired:true}
  };
  fs.writeFileSync(path.join(tmp,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  fs.renameSync(tmp,path.resolve(outputDir));
  return receipt;
 }catch(e){fs.rmSync(tmp,{recursive:true,force:true});throw e}
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
 try{
  const [file,out]=process.argv.slice(2);
  if(!file||!out)err('usage_node_visual_lanes_request_json_outputdir');
  const receipt=produceVisualLanes(JSON.parse(fs.readFileSync(file,'utf8')),out);
  console.log(JSON.stringify({status:'three_previews_rendered',
   output:path.resolve(out),ids:receipt.deliverables.map(x=>x.lane),
   publicationAuthority:false}));
 }catch(e){console.error(String(e.message||e));process.exitCode=1}
}
