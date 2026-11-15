#!/usr/bin/env node
// Authenticated byte-level documentary video source check. Does NOT prove the final edit used these pixels.
import crypto from 'node:crypto';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {validateAuthorizedMediaSource} from '../forensiscope/authorized-source.mjs';

export const SOURCE_PROOF_SCHEMA='evercraft.fallen.documentary-source-proof.v1';
const VIDEO_KINDS=new Set(['original_camera','licensed_archival_video']);
const VIDEO_EXTENSIONS=new Set(['.mp4','.mov','.mkv','.webm','.m4v','.avi']);
const SHA=/^[a-f0-9]{64}$/i;
const nonempty=v=>typeof v==='string'&&Boolean(v.trim());
const round=n=>Number(n.toFixed(3));
function probeVideo(file){
  const r=spawnSync('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file],
    {encoding:'utf8',maxBuffer:1024*1024,timeout:20000});
  if(r.error||r.status!==0)throw new Error('source_ffprobe_failed');
  const info=JSON.parse(r.stdout);
  const streams=(info.streams||[]).filter(s=>s.codec_type==='video');
  const duration=Number(info.format?.duration);
  if(streams.length!==1||!Number.isFinite(duration)||duration<=0)throw new Error('source_video_stream_invalid');
  return{durationSec:duration,width:Number(streams[0].width),height:Number(streams[0].height),
    codec:streams[0].codec_name};
}

function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value)
    .sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));
  return value;
}

/** Checks exact input bytes and referenced source trims, not file editing or independently authenticated licenses. */
export function verifyDocumentarySources(input,{rootDir=process.cwd(),additionalRoots=[]}={}){
  const blockers=[],checked=[],ids=new Set();
  const sources=Array.isArray(input?.sources)?input.sources:[];
  const shots=Array.isArray(input?.shots)?input.shots:[];
  if(!sources.length)blockers.push('sources_missing');
  for(const [i,source] of sources.entries()){
    const id=source?.id;
    if(!nonempty(id)||ids.has(id)){blockers.push('source_id_missing_or_duplicate:'+i);continue;}
    ids.add(id);
    if(!VIDEO_KINDS.has(source.kind))continue;
    if(!SHA.test(source.sha256||'')){blockers.push('source_sha_invalid:'+id);continue;}
    if(!nonempty(source.path)){blockers.push('source_path_missing:'+id);continue;}
    if(source.authorization?.confirmed!==true||source.authorization?.scope!=='documentary_postproduction'||
       !nonempty(source.authorization?.authorized_by)||!nonempty(source.authorization?.confirmed_at)){
      blockers.push('source_authorization_declaration_missing:'+id);
    }
    if(!nonempty(source.rightsReviewRef)||!nonempty(source.privacyReviewRef)||
       !nonempty(source.sourceOriginRef))blockers.push('source_review_refs_missing:'+id);
    try{
      const admitted=validateAuthorizedMediaSource({
        source:{path:source.path,sha256:'sha256:'+source.sha256.toLowerCase()},
        authorization:source.authorization},
        {rootDir,additionalRoots,requireExisting:true,rejectSymlinkSource:true});
      if(!VIDEO_EXTENSIONS.has(admitted.extension))throw new Error('source_not_video_extension');
      const metadata=probeVideo(admitted.path);
      if(!Number.isInteger(metadata.width)||metadata.width<1||!Number.isInteger(metadata.height)||metadata.height<1)
        throw new Error('source_dimensions_invalid');
      checked.push({id,sha256:source.sha256.toLowerCase(),sizeBytes:admitted.size_bytes,
        durationSec:round(metadata.durationSec),width:metadata.width,height:metadata.height,codec:metadata.codec});
    }catch(error){
      const message=String(error?.message||'');
      const reason=/outside admitted media roots/.test(message)?'source_outside_admitted_roots':
        /symlinks/.test(message)?'source_symlink_rejected':
        /hash/.test(message)?'source_hash_mismatch':
        /does not exist/.test(message)?'source_missing':
        /authorization/.test(message)?'source_authorization_not_confirmed':
        'source_unverifiable';
      blockers.push(reason+':'+id);
    }
  }
  const byId=new Map(checked.map(source=>[source.id,source]));
  const referenced=new Set();
  let footageSec=0;
  for(const shot of shots){
    if(shot?.type!=='footage')continue;
    const source=byId.get(shot.sourceId);
    if(!source){blockers.push('shot_unverified_source:'+String(shot?.id||'unnamed'));continue;}
    referenced.add(source.id);
    const offset=shot.sourceInSec,length=shot.durationSec;
    if(!Number.isFinite(offset)||offset<0||!Number.isFinite(length)||length<=0||
      offset+length>source.durationSec+0.02){
      blockers.push('shot_trim_outside_source:'+String(shot.id||'unnamed'));
    }else footageSec+=length;
  }
  const declaredIds=sources.filter(s=>VIDEO_KINDS.has(s?.kind)).map(s=>s?.id);
  if(checked.length!==declaredIds.length)blockers.push('not_all_real_video_sources_verified');
  if(checked.length&&referenced.size===0)blockers.push('verified_video_not_referenced_in_edit');
  const unique=[...new Set(blockers)];
  const receipt={
    schema:SOURCE_PROOF_SCHEMA,
    status:unique.length?'blocked':'verified_for_private_edit_input',
    blockers:unique,
    checkedSources:checked,
    verifiedReferencedSourceCount:referenced.size,
    verifiedShotFootageSeconds:round(footageSec),
    boundaries:{
      exactInputByteHashesVerified:true,
      referencedTrimsChecked:true,
      rightsDeclarationsNeedIndependentHumanAuthentication:true,
      noProofThoseSourcePixelsAppearInFinishedMaster:true,
      clientApprovalGranted:false,paymentAuthorityGranted:false,publicationAuthorityGranted:false
    }
  };
  const digest=crypto.createHash('sha256').update(JSON.stringify(stable(receipt))).digest('hex');
  return {...receipt,receiptDigest:digest};
}
