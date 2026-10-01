#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_FILE=fileURLToPath(import.meta.url);
const DEFAULT_CLIP_APP_ID='6a83af980c9f995f588c7df3';
const LEGACY_SYSTEMIA_APP_ID='694612db777e391542fd0333';
const DEFAULT_BASE=`https://base44.app/api/apps/${DEFAULT_CLIP_APP_ID}/functions`;

const clean=(value,max=8000)=>String(value??'').replace(/\r\n/g,'\n').trim().slice(0,max);
const unique=(values=[])=>[...new Set(values.map(v=>clean(v)).filter(Boolean))];
const shaFile=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const shaJson=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function arg(argv,name,fallback=''){
  const i=argv.indexOf(name);
  return i>=0&&argv[i+1]?argv[i+1]:fallback;
}

function readJson(file){
  return JSON.parse(fs.readFileSync(file,'utf8'));
}

function writeJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o750});
  fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{mode:0o600});
}

function productionReceipts(root){
  if(!fs.existsSync(root)) return [];
  const out=[];
  for(const entry of fs.readdirSync(root,{withFileTypes:true})){
    if(!entry.isDirectory()) continue;
    const file=path.join(root,entry.name,'production-receipt.json');
    if(fs.existsSync(file)) out.push(file);
  }
  return out;
}

async function postJson(url,secret,body){
  const response=await fetch(url,{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      Authorization:`Bearer ${secret}`,
      'User-Agent':'SystemiaSocialSpectacleBridge/1.0',
    },
    body:JSON.stringify(body),
    signal:AbortSignal.timeout(55_000),
  });
  const data=await response.json().catch(()=>({}));
  return {ok:response.ok&&data?.success!==false&&data?.ok!==false,status:response.status,data};
}

async function uploadMedia(url,secret,{filePath,mediaSha256,candidateId,editorialGate,sourceRefs}){
  const bytes=fs.readFileSync(filePath);
  if(bytes.length<=0||bytes.length>32*1024*1024) throw new Error('spectacle_bridge_media_size_out_of_bounds');
  const observed=crypto.createHash('sha256').update(bytes).digest('hex');
  if(observed!==mediaSha256) throw new Error('spectacle_bridge_media_digest_mismatch');
  const form=new FormData();
  form.set('file',new Blob([bytes],{type:'video/mp4'}),path.basename(filePath));
  form.set('media_sha256',observed);
  form.set('candidate_id',candidateId);
  form.set('editorial_score',String(editorialGate?.score||0));
  form.set('editorial_gate_digest',shaJson(editorialGate));
  form.set('source_refs_json',JSON.stringify(unique(sourceRefs)));
  const response=await fetch(url,{
    method:'POST',
    headers:{
      Authorization:`Bearer ${secret}`,
      'User-Agent':'SystemiaSocialSpectacleBridge/1.0',
    },
    body:form,
    signal:AbortSignal.timeout(120_000),
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok!==true) throw new Error('spectacle_bridge_upload_failed:'+response.status+':'+clean(data?.error||'',1200));
  if(data.media_sha256!==observed) throw new Error('spectacle_bridge_upload_digest_not_echoed');
  if(!String(data.media_url||'').startsWith('https://')) throw new Error('spectacle_bridge_upload_url_invalid');
  return data;
}

function platformCopies(manifest){
  const base=clean(manifest?.metadata?.description,5000);
  const linkedin=base;
  const facebook=base;
  const instagram=base.length<=2200?base:base.slice(0,2197).trimEnd()+'...';
  return {facebook,linkedin,instagram};
}

function clipIngressBody({receipt,manifest,upload}){
  const copies=platformCopies(manifest);
  const evidenceRefs=unique([
    ...manifest.provenance.sourceRefs,
    'media-sha256:'+manifest.media.sha256,
    'editorial-gate-sha256:'+shaJson(manifest.editorialGate),
    'master-qc:'+path.basename(manifest.provenance.masterQcReceiptPath),
    'render-receipt:'+path.basename(manifest.provenance.renderReceiptPath),
  ]);
  return {
    source_app_id:LEGACY_SYSTEMIA_APP_ID,
    mission_key:'evercraft-social-spectacle-machine-2026-09',
    work_key:receipt.candidate_id,
    program_key:'social-spectacle',
    publication_key:receipt.candidate_id,
    headline:manifest.metadata.title,
    facebook_copy:copies.facebook,
    linkedin_copy:copies.linkedin,
    instagram_copy:copies.instagram,
    source_refs:unique(manifest.provenance.sourceRefs),
    evidence_refs:evidenceRefs,
    media_refs:[upload.media_url],
    visual_rights_state:'verified',
    target_page_name:'Evercraft',
    publication_class:'story',
    source_package_key:manifest.deliveryId,
    origin_app:'Evercraft Fallen',
    origin_app_id:'forge-operator',
    education_goal:'Turn a source-grounded physical-world signal into an unforgettable visual explanation without outrunning the evidence.',
    audience_tracks:['general_public','curiosity','learning'],
    derivative_format:'vertical_hero',
    fallen_project_key:manifest.sourceProjectId,
    freshness_state:manifest.freshnessState,
    fact_checked_at:manifest.sourceObservedAt||manifest.createdAt,
    target_platforms:['facebook','instagram','linkedin','youtube_short'],
    youtube_title:manifest.metadata.title,
    youtube_description:copies.linkedin,
    youtube_tags:manifest.metadata.tags||[],
    distribution_goal:'education',
    creative_style:'cinematic_data_story',
    caption_mode:'burned_in',
    upstream_preflight_passed:manifest.editorialGate?.status==='accepted'&&Number(manifest.editorialGate?.score)===10,
    publishable:true,
    priority:'normal',
    notes:'Social Spectacle Engine. Provider publication is not claimed by this ingress; Clip provider receipts remain authoritative.',
  };
}

export async function bridgeSpectacleProduction({
  productionRoot='artifacts/social-spectacle/production',
  sharedSecretFile,
  uploadUrl=`${DEFAULT_BASE}/systemiaSpectacleMediaUpload`,
  ingressUrl=`${DEFAULT_BASE}/systemiaPublicationClipIngress`,
  pulseUrl=`${DEFAULT_BASE}/publishUnifiedSocialQueue`,
  statusUrl=`${DEFAULT_BASE}/systemiaPublicationStatus`,
  now=new Date(),
  fetchEnabled=true,
}={}){
  if(!sharedSecretFile||!fs.existsSync(path.resolve(sharedSecretFile))){
    return {
      schema:'evercraft.social-spectacle.clip-bridge-run.v1',
      status:'held',
      reason:'clip_shared_secret_file_missing',
      items:[],
      publication_claimed:false,
      at:now.toISOString(),
    };
  }
  const secret=fs.readFileSync(path.resolve(sharedSecretFile),'utf8').trim();
  if(!secret) throw new Error('clip_shared_secret_empty');

  const items=[];
  for(const receiptFile of productionReceipts(path.resolve(productionRoot))){
    const receipt=readJson(receiptFile);
    if(receipt?.status!=='ready_for_clip_publish') continue;
    const root=path.dirname(receiptFile);
    const bridgeReceiptPath=path.join(root,'clip-bridge-receipt.json');
    if(fs.existsSync(bridgeReceiptPath)){
      const prior=readJson(bridgeReceiptPath);
      if(['staged','published_observed','pulse_completed'].includes(prior?.status)){
        items.push(prior);
        continue;
      }
    }
    const manifest=readJson(receipt.clip_manifest);
    const intake=readJson(receipt.clip_intake_receipt);
    if(manifest?.contentClass!=='social_spectacle') throw new Error('spectacle_bridge_manifest_class_invalid');
    if(manifest?.editorialGate?.status!=='accepted'||Number(manifest?.editorialGate?.score)!==10){
      throw new Error('spectacle_bridge_editorial_gate_invalid');
    }
    if(manifest?.productionGrade?.status!=='accepted'||manifest?.productionGrade?.source_grounded!==true){
      throw new Error('spectacle_bridge_production_grade_invalid');
    }
    if(manifest?.freshnessState!=='fresh'){
      const held={
        schema:'evercraft.social-spectacle.clip-bridge-receipt.v1',
        candidate_id:receipt.candidate_id,
        status:'held',
        reason:'source_freshness_not_fresh',
        freshness_state:manifest?.freshnessState||'unknown',
        publication_claimed:false,
        at:now.toISOString(),
      };
      writeJson(bridgeReceiptPath,held);
      items.push(held);
      continue;
    }
    if(intake?.status!=='staged'||intake?.mediaSha256!==manifest.media.sha256){
      throw new Error('spectacle_bridge_clip_intake_invalid');
    }
    if(shaFile(intake.stagedMediaPath)!==manifest.media.sha256){
      throw new Error('spectacle_bridge_staged_media_digest_mismatch');
    }

    if(!fetchEnabled){
      items.push({
        schema:'evercraft.social-spectacle.clip-bridge-receipt.v1',
        candidate_id:receipt.candidate_id,
        status:'ready_for_compatibility_bridge',
        upload_url:uploadUrl,
        ingress_url:ingressUrl,
        pulse_url:pulseUrl,
        status_url:statusUrl,
        publication_claimed:false,
        at:now.toISOString(),
      });
      continue;
    }

    const upload=await uploadMedia(uploadUrl,secret,{
      filePath:intake.stagedMediaPath,
      mediaSha256:manifest.media.sha256,
      candidateId:receipt.candidate_id,
      editorialGate:manifest.editorialGate,
      sourceRefs:manifest.provenance.sourceRefs,
    });
    const ingressBody=clipIngressBody({receipt,manifest,upload});
    const ingress=await postJson(ingressUrl,secret,ingressBody);
    if(!ingress.ok) throw new Error('spectacle_bridge_clip_ingress_failed:'+ingress.status+':'+clean(ingress.data?.error||'',1200));

    const pulse=await postJson(pulseUrl,secret,{source:'systemia-social-spectacle',candidate_id:receipt.candidate_id});
    const status=await postJson(statusUrl,secret,{
      source_app_id:LEGACY_SYSTEMIA_APP_ID,
      publication_key:receipt.candidate_id,
    });
    const verifiedDestinations=unique(status.data?.verified_destinations||[]);
    const providerWriteDestinations=unique(status.data?.provider_write_destinations||[]);
    const observedPublication=status.ok&&status.data?.publication_claimed===true&&verifiedDestinations.length>0;
    const bridgeReceipt={
      schema:'evercraft.social-spectacle.clip-bridge-receipt.v1',
      candidate_id:receipt.candidate_id,
      status:observedPublication?'published_observed':pulse.ok?'pulse_completed':'staged',
      clip_package_id:ingress.data?.clip_package_id||null,
      content_package_id:ingress.data?.content_package_id||null,
      distribution_envelope_ids:ingress.data?.distribution_envelope_ids||[],
      uploaded_media_url:upload.media_url,
      uploaded_media_sha256:upload.media_sha256,
      pulse_http_status:pulse.status,
      pulse_ok:pulse.ok,
      status_http_status:status.status,
      status_ok:status.ok,
      verified_destinations:verifiedDestinations,
      provider_write_destinations:providerWriteDestinations,
      facebook:status.data?.facebook||null,
      cross_platform:status.data?.cross_platform||[],
      publication_claimed:observedPublication,
      provider_receipts_required:true,
      evidence_rule:'Publication is claimed only when systemiaPublicationStatus reports provider-verified destination evidence for this exact publication_key.',
      at:now.toISOString(),
    };
    writeJson(bridgeReceiptPath,bridgeReceipt);
    items.push(bridgeReceipt);
  }

  return {
    schema:'evercraft.social-spectacle.clip-bridge-run.v1',
    status:items.some(item=>item.publication_claimed)?'published_observed':items.length?'processed':'no_op',
    items,
    publication_claimed:items.some(item=>item.publication_claimed),
    at:now.toISOString(),
  };
}

async function cli(){
  const argv=process.argv.slice(2);
  const productionRoot=arg(argv,'--production-root',process.env.SYSTEMIA_SOCIAL_SPECTACLE_PRODUCTION_DIR||'artifacts/social-spectacle/production');
  const sharedSecretFile=arg(argv,'--secret-file',process.env.SYSTEMIA_CLIP_SHARED_SECRET_FILE||'');
  const uploadUrl=arg(argv,'--upload-url',process.env.EVERCRAFT_CLIP_SPECTACLE_UPLOAD_URL||`${DEFAULT_BASE}/systemiaSpectacleMediaUpload`);
  const ingressUrl=arg(argv,'--ingress-url',process.env.EVERCRAFT_CLIP_SYSTEMIA_INGRESS_URL||`${DEFAULT_BASE}/systemiaPublicationClipIngress`);
  const pulseUrl=arg(argv,'--pulse-url',process.env.EVERCRAFT_CLIP_UNIFIED_PULSE_URL||`${DEFAULT_BASE}/publishUnifiedSocialQueue`);
  const statusUrl=arg(argv,'--status-url',process.env.EVERCRAFT_CLIP_PUBLICATION_STATUS_URL||`${DEFAULT_BASE}/systemiaPublicationStatus`);
  const result=await bridgeSpectacleProduction({productionRoot,sharedSecretFile,uploadUrl,ingressUrl,pulseUrl,statusUrl});
  console.log(JSON.stringify(result,null,2));
}

if(process.argv[1]&&path.resolve(process.argv[1])===MODULE_FILE){
  cli().catch(error=>{
    console.error(JSON.stringify({ok:false,error:clean(error?.message||error,3000)}));
    process.exitCode=1;
  });
}
