import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DESTINATIONS=new Set(['youtube','facebook','instagram','linkedin','tiktok']);

function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,item])=>[key,stable(item)])
    );
  }
  return value;
}

function digestBytes(bytes){
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function digestFile(filePath){
  return digestBytes(fs.readFileSync(filePath));
}

function digestJson(value){
  return digestBytes(Buffer.from(JSON.stringify(stable(value))));
}

function safeId(value){
  const id=String(value||'').trim()
    .replace(/[^a-zA-Z0-9._-]+/g,'_')
    .slice(0,120);
  if(!id) throw new Error('clip_intake_delivery_id_invalid');
  return id;
}

function readJson(filePath){
  return JSON.parse(fs.readFileSync(filePath,'utf8'));
}

function assertFileDigest(filePath,expected,label){
  if(!filePath||!fs.existsSync(filePath)) throw new Error(label+'_file_missing');
  const observed=digestFile(filePath);
  if(observed.toLowerCase()!==String(expected||'').toLowerCase()){
    throw new Error(label+'_digest_mismatch');
  }
  return observed;
}

export function verifyClipMediaManifest(manifest){
  const errors=[];
  if(manifest?.schema!=='evercraft.clip.media-intake.v1') errors.push('manifest_schema_invalid');
  if(!manifest?.deliveryId) errors.push('delivery_id_missing');
  if(manifest?.sourceApp!=='fallen') errors.push('source_app_not_fallen');
  if(manifest?.state!=='ready_for_clip_intake') errors.push('state_not_ready_for_clip_intake');
  if(!Array.isArray(manifest?.destinations)||manifest.destinations.length===0){
    errors.push('destinations_missing');
  }else{
    for(const destination of manifest.destinations){
      if(!DESTINATIONS.has(destination)) errors.push('destination_invalid:'+destination);
    }
  }
  if(manifest?.boundaries?.publicationAuthorityGranted!==false){
    errors.push('publication_authority_boundary_invalid');
  }
  if(manifest?.boundaries?.platformCredentialsConsumed!==false){
    errors.push('platform_credentials_boundary_invalid');
  }
  if(manifest?.boundaries?.platformPublishStateAsserted!==false){
    errors.push('platform_publish_state_boundary_invalid');
  }
  if(manifest?.boundaries?.downstreamClipGateRequired!==true){
    errors.push('downstream_clip_gate_boundary_missing');
  }
  if(!manifest?.media?.path) errors.push('media_path_missing');
  if(!/^[a-f0-9]{64}$/i.test(String(manifest?.media?.sha256||''))){
    errors.push('media_digest_invalid');
  }
  if(!manifest?.provenance?.renderReceiptPath) errors.push('render_receipt_path_missing');
  if(!manifest?.provenance?.masterQcReceiptPath) errors.push('master_qc_receipt_path_missing');

  return {
    schema:'evercraft.clip.media-intake-validation.v1',
    status:errors.length?'rejected':'accepted',
    errors:[...new Set(errors)],
  };
}

export function inspectClipMediaPackage(manifest){
  const validation=verifyClipMediaManifest(manifest);
  if(validation.status!=='accepted'){
    return {
      schema:'evercraft.clip.media-package-inspection.v1',
      status:'rejected',
      validation,
      reasons:[...validation.errors],
    };
  }

  const reasons=[];
  let mediaDigest=null;
  try{
    mediaDigest=assertFileDigest(manifest.media.path,manifest.media.sha256,'clip_media');
  }catch(error){
    reasons.push(error instanceof Error?error.message:String(error));
  }

  const renderPath=path.resolve(manifest.provenance.renderReceiptPath);
  if(!fs.existsSync(renderPath)){
    reasons.push('render_receipt_file_missing');
  }else{
    try{
      const receipt=readJson(renderPath);
      if(receipt.schema!=='evercraft.fallen.timeline-export-receipt.v1'){
        reasons.push('render_receipt_schema_invalid');
      }
      if(receipt.sha256!==manifest.media.sha256) reasons.push('render_receipt_media_digest_mismatch');
      if(receipt.projectId!==manifest.sourceProjectId) reasons.push('render_receipt_project_mismatch');
      if(receipt.projectVersion!==manifest.sourceProjectVersion) reasons.push('render_receipt_version_mismatch');
      if(receipt.publicationAuthorityGranted!==false) reasons.push('render_receipt_publication_boundary_invalid');
    }catch(error){
      reasons.push('render_receipt_parse_failed');
    }
  }

  const qcPath=path.resolve(manifest.provenance.masterQcReceiptPath);
  if(!fs.existsSync(qcPath)){
    reasons.push('master_qc_receipt_file_missing');
  }else{
    try{
      const qc=readJson(qcPath);
      if(qc.schema!=='evercraft.fallen.master-qc-receipt.v1') reasons.push('master_qc_schema_invalid');
      if(qc.status!=='accepted') reasons.push('master_qc_not_accepted');
      if(qc.sha256!==manifest.media.sha256) reasons.push('master_qc_media_digest_mismatch');
      if(qc.boundaries?.publicationAuthorityGranted!==false) reasons.push('master_qc_publication_boundary_invalid');
    }catch(error){
      reasons.push('master_qc_receipt_parse_failed');
    }
  }

  const captions=[];
  for(const asset of manifest.captions||[]){
    try{
      const observed=assertFileDigest(asset.path,asset.sha256,'clip_caption:'+asset.assetId);
      captions.push({assetId:asset.assetId,path:path.resolve(asset.path),sha256:observed});
    }catch(error){
      reasons.push(error instanceof Error?error.message:String(error));
    }
  }

  return {
    schema:'evercraft.clip.media-package-inspection.v1',
    status:reasons.length?'rejected':'accepted',
    validation,
    reasons:[...new Set(reasons)],
    mediaDigest,
    captions,
    evidenceRefs:[
      ...(mediaDigest?['sha256:'+mediaDigest]:[]),
      'render-receipt:'+renderPath,
      'master-qc:'+qcPath,
      ...captions.map(item=>'caption-sha256:'+item.sha256),
    ],
  };
}

export function stageClipMediaIntake({manifest,queueDir}){
  const inspection=inspectClipMediaPackage(manifest);
  if(inspection.status!=='accepted'){
    throw new Error('clip_intake_package_rejected:'+inspection.reasons.join('|'));
  }

  const manifestDigest=digestJson(manifest);
  const deliveryId=safeId(manifest.deliveryId);
  const root=path.resolve(queueDir,deliveryId);
  const receiptPath=path.join(root,'intake-receipt.json');

  if(fs.existsSync(receiptPath)){
    const prior=readJson(receiptPath);
    if(
      prior.schema==='evercraft.clip.intake-receipt.v1' &&
      prior.manifestDigest===manifestDigest &&
      prior.mediaSha256===manifest.media.sha256
    ){
      return prior;
    }
    throw new Error('clip_intake_idempotency_conflict:'+deliveryId);
  }

  fs.mkdirSync(path.join(root,'media'),{recursive:true});
  fs.mkdirSync(path.join(root,'captions'),{recursive:true});

  const mediaExt=path.extname(manifest.media.path)||'.mp4';
  const stagedMediaPath=path.join(root,'media','master'+mediaExt);
  fs.copyFileSync(manifest.media.path,stagedMediaPath);
  assertFileDigest(stagedMediaPath,manifest.media.sha256,'clip_staged_media');

  const stagedCaptions=[];
  for(const caption of manifest.captions||[]){
    const ext=path.extname(caption.path)||'.srt';
    const staged=path.join(root,'captions',safeId(caption.assetId)+ext);
    fs.copyFileSync(caption.path,staged);
    assertFileDigest(staged,caption.sha256,'clip_staged_caption:'+caption.assetId);
    stagedCaptions.push({
      assetId:caption.assetId,
      path:staged,
      sha256:caption.sha256,
    });
  }

  const stagedManifest={
    ...manifest,
    media:{...manifest.media,path:stagedMediaPath},
    captions:(manifest.captions||[]).map(caption=>{
      const staged=stagedCaptions.find(item=>item.assetId===caption.assetId);
      return {...caption,path:staged?.path??caption.path};
    }),
    intake:{
      receivedAt:new Date().toISOString(),
      sourceManifestDigest:manifestDigest,
      queueRoot:root,
    },
  };
  const stagedManifestPath=path.join(root,'manifest.json');
  fs.writeFileSync(stagedManifestPath,JSON.stringify(stagedManifest,null,2)+'\n','utf8');

  const receipt={
    schema:'evercraft.clip.intake-receipt.v1',
    deliveryId:manifest.deliveryId,
    status:'staged',
    queueRoot:root,
    stagedManifestPath,
    stagedMediaPath,
    stagedCaptionPaths:stagedCaptions.map(item=>item.path),
    manifestDigest,
    mediaSha256:manifest.media.sha256,
    destinations:[...new Set(manifest.destinations)],
    evidenceRefs:[...inspection.evidenceRefs,'manifest-sha256:'+manifestDigest],
    boundaries:{
      firstPartyQueue:true,
      inputBytesReverified:true,
      masterQcRequired:true,
      publicationAuthorityGranted:false,
      platformCredentialsConsumed:false,
    },
    stagedAt:new Date().toISOString(),
  };
  fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n','utf8');
  return receipt;
}

function arg(name){
  const index=process.argv.indexOf(name);
  return index>=0?process.argv[index+1]:undefined;
}

if(import.meta.url===new URL(process.argv[1]||'', 'file://').href){
  const manifestPath=arg('--manifest');
  const queueDir=arg('--queue-dir');
  if(!manifestPath||!queueDir){
    console.error('Usage: node systemia/clip/media-intake.mjs --manifest <clip-intake.json> --queue-dir <dir>');
    process.exitCode=1;
  }else{
    try{
      const manifest=readJson(path.resolve(manifestPath));
      const receipt=stageClipMediaIntake({manifest,queueDir});
      console.log(JSON.stringify(receipt,null,2));
    }catch(error){
      console.error(error instanceof Error?error.message:String(error));
      process.exitCode=1;
    }
  }
}
