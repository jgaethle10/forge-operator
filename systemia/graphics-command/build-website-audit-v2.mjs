#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCommercialCampaign,
  renderCommercialPoster,
} from './commercial-renderer.mjs';
import {
  runAssignment,
  reconcile,
} from '../media-studio/creative-council-saban-adapter.mjs';

const moduleDir=path.dirname(fileURLToPath(import.meta.url));

function arg(name){
  const index=process.argv.indexOf(name);
  return index>=0?process.argv[index+1]:undefined;
}

function safeId(value){
  return String(value||'hook')
    .replace(/[^a-z0-9-]+/gi,'-')
    .replace(/^-+|-+$/g,'')
    .toLowerCase();
}

function loadJson(file){
  return JSON.parse(fs.readFileSync(path.resolve(file),'utf8'));
}

async function runCouncil(built){
  const results=[];
  for(const job of built.plan.council.shots){
    for(const role of built.plan.council.roles){
      results.push(await runAssignment({
        assignment:{
          agent_id:'graphics-command-v2:'+role,
          role,
          item:{shot:job.shot},
        }
      }));
    }
  }
  return reconcile({results,plan:{roles:built.plan.council.roles}});
}

function productionNeed({id,kind,prompt,durationSec,continuityDigest}){
  const need={
    id,
    kind,
    prompt,
    durationSec,
    continuityDigest,
    requires:['commercial_rights','provenance_receipt','timing_control'],
    status:'planned',
  };
  return {
    kind:'fallen_production_need',
    key:id,
    need,
    continuity_digest:continuityDigest,
    requested_outputs:['artifact','production_receipt','continuity_evidence'],
  };
}

export async function buildWebsiteAuditV2({
  campaignPath=path.join(moduleDir,'campaigns','website-audit-attention.json'),
  briefPath=path.join(moduleDir,'production','website-audit-attention-v2.json'),
  outputRoot=path.join(os.tmpdir(),'evercraft-website-audit-v2'),
  origin='https://fabric.systemiacommandcenters.com/visuals',
}={}){
  const campaign=loadJson(campaignPath);
  const brief=loadJson(briefPath);
  if(brief?.schema!=='evercraft.graphics-command.website-audit-production-brief.v2'){
    throw new Error('website_audit_v2_brief_schema_invalid');
  }
  if(brief.campaignId!==campaign.id) throw new Error('website_audit_v2_campaign_mismatch');
  if(Number(brief.priceUsd)!==Number(campaign.priceUsd)) throw new Error('website_audit_v2_price_mismatch');

  const built=buildCommercialCampaign(campaign,{outputRoot:path.resolve(outputRoot),origin});
  const council=await runCouncil(built);
  if(council.status!=='reconciled') throw new Error('website_audit_v2_council_blocked');

  const dir=built.dir;
  fs.writeFileSync(
    path.join(dir,'creative-council-v2-reconciliation.json'),
    JSON.stringify(council,null,2)+'\n',
    'utf8'
  );

  const variantAssets={};
  for(const variant of brief.hookVariants||[]){
    const id=safeId(variant.id);
    if(!id||!variant.hook) continue;
    const variantCampaign={
      ...campaign,
      creative:{
        ...campaign.creative,
        hook:variant.hook,
        subhook:variant.subhook||campaign.creative.subhook,
        cta:variant.cta||campaign.creative.cta,
      },
    };
    const assets={};
    for(const format of ['feed','square','story']){
      const filename='poster-hook-'+id+'-'+format+'.svg';
      fs.writeFileSync(
        path.join(dir,filename),
        renderCommercialPoster(variantCampaign,built.plan,format),
        'utf8'
      );
      assets[format]=String(origin).replace(/\/$/,'')+'/'+campaign.slug+'/'+filename;
    }
    variantAssets[id]={
      ...assets,
      hook:variant.hook,
      subhook:variant.subhook||campaign.creative.subhook,
      cta:variant.cta||campaign.creative.cta,
    };
  }
  if(Object.keys(variantAssets).length<3) throw new Error('website_audit_v2_variants_insufficient');

  const audioBrief={
    schema:'evercraft.graphics-command.audio-brief.v2',
    campaignId:campaign.id,
    campaignSlug:campaign.slug,
    planDigest:built.plan.digest,
    targetDurationSec:built.plan.motion.targetDurationSec,
    sonicHook:brief.audio?.sonicHook||campaign.creative.sonicHook||[],
    musicPrompt:brief.audio?.musicPrompt||'',
    sfxPrompt:brief.audio?.sfxPrompt||'',
    providerExecutionState:'provider_ready_unrequested',
    paidGenerationAuthorized:false,
    boundaries:{
      commercialRightsRequired:true,
      provenanceReceiptRequired:true,
      timingControlRequired:true,
      publicationAuthority:false,
    },
  };
  fs.writeFileSync(path.join(dir,'audio-brief-v2.json'),JSON.stringify(audioBrief,null,2)+'\n','utf8');

  const productionJobs=[];
  const speechPrompt=(audioBrief.sonicHook||[]).join(' ');
  if(speechPrompt){
    productionJobs.push(productionNeed({
      id:campaign.slug+'-speech-v2',
      kind:'speech',
      prompt:speechPrompt,
      durationSec:built.plan.motion.targetDurationSec,
      continuityDigest:built.plan.digest,
    }));
  }
  if(audioBrief.musicPrompt){
    productionJobs.push(productionNeed({
      id:campaign.slug+'-music-v2',
      kind:'music',
      prompt:audioBrief.musicPrompt,
      durationSec:built.plan.motion.targetDurationSec,
      continuityDigest:built.plan.digest,
    }));
  }
  if(audioBrief.sfxPrompt){
    productionJobs.push(productionNeed({
      id:campaign.slug+'-sfx-v2',
      kind:'sfx',
      prompt:audioBrief.sfxPrompt,
      durationSec:2.4,
      continuityDigest:built.plan.digest,
    }));
  }
  const productionInventory={
    schema:'evercraft.fallen.saban-production-inventory.v1',
    campaignId:campaign.id,
    jobs:productionJobs,
    providerExecutionState:'provider_ready_unrequested',
    paidGenerationAuthorized:false,
    publicationAuthority:false,
  };
  fs.writeFileSync(
    path.join(dir,'production-needs-v2.json'),
    JSON.stringify(productionInventory,null,2)+'\n',
    'utf8'
  );

  const visualRequests={
    schema:'evercraft.graphics-command.visual-request-inventory.v2',
    campaignId:campaign.id,
    requests:[
      {
        schema:'evercraft.fallen.visual-shot-request.v1',
        id:campaign.slug+'-hook-sequence-v2',
        needId:campaign.slug+'-hook-sequence-v2',
        task:'video',
        prompt:[
          'Premium vertical commercial visualization.',
          'A flood of visitor signals enters a browser-shaped conversion path while some energy visibly leaks away through friction points.',
          'The browser and conversion path are the physical subject, not a dashboard wall.',
          'No fake analytics values, no fake customer results, no documentary claim.',
          'Leave deliberate negative space for the hook: TRAFFIC UP. CUSTOMERS DOWN?',
          'Fast, tactile, expensive, modern motion. Avoid generic neon sci-fi UI.'
        ].join(' '),
        durationSec:6,
        aspectRatio:'9:16',
        targetResolution:'1080p',
        continuityDigest:built.plan.digest,
        requires:['commercial_rights','provenance_receipt','timing_control'],
        references:[],
        candidateCount:4,
        modelDiversity:2,
        sourceRefs:campaign.sourceRefs,
      },
      {
        schema:'evercraft.fallen.visual-shot-request.v1',
        id:campaign.slug+'-diagnose-cta-sequence-v2',
        needId:campaign.slug+'-diagnose-cta-sequence-v2',
        task:'video',
        prompt:[
          'Premium vertical commercial visualization continuing the same browser-shaped conversion system.',
          'A restrained scan passes through clarity, speed, trust, mobile, and CTA dimensions without inventing findings.',
          'The chaos resolves into five prioritized fix markers, then a clean $49 Quick Win Audit lockup.',
          'Synthetic visualization only. No fake health score, fake metrics, or fake customer evidence.',
          'Motion must communicate diagnosis becoming priority, not decorative interface animation.'
        ].join(' '),
        durationSec:6,
        aspectRatio:'9:16',
        targetResolution:'1080p',
        continuityDigest:built.plan.digest,
        requires:['commercial_rights','provenance_receipt','timing_control'],
        references:[],
        candidateCount:4,
        modelDiversity:2,
        sourceRefs:campaign.sourceRefs,
      },
    ],
    providerExecutionState:'provider_plan_unrequested',
    paidGenerationAuthorized:false,
    tournamentRequired:true,
    publicationAuthority:false,
  };
  fs.writeFileSync(
    path.join(dir,'visual-requests-v2.json'),
    JSON.stringify(visualRequests,null,2)+'\n',
    'utf8'
  );

  const clipHandoff={
    ...built.manifest.clipHandoff,
    schema:'evercraft.clip.visual-handoff.v2',
    variants:variantAssets,
    audioBrief:String(origin).replace(/\/$/,'')+'/'+campaign.slug+'/audio-brief-v2.json',
    productionNeeds:String(origin).replace(/\/$/,'')+'/'+campaign.slug+'/production-needs-v2.json',
    visualRequests:String(origin).replace(/\/$/,'')+'/'+campaign.slug+'/visual-requests-v2.json',
    providerExecutionState:'provider_ready_unrequested',
    paidGenerationAuthorized:false,
    publicationAuthority:false,
  };
  fs.writeFileSync(path.join(dir,'clip-handoff-v2.json'),JSON.stringify(clipHandoff,null,2)+'\n','utf8');

  const manifest={
    schema:'evercraft.commercial-attention-pack.v2',
    campaignId:campaign.id,
    campaignDigest:built.campaign.digest,
    planDigest:built.plan.digest,
    scrollStopStatus:built.report.status,
    scrollStopScore:built.report.score,
    creativeCouncilStatus:council.status,
    hookVariants:variantAssets,
    audioBrief:clipHandoff.audioBrief,
    productionNeeds:clipHandoff.productionNeeds,
    visualRequests:clipHandoff.visualRequests,
    offerUrl:campaign.offerUrl,
    priceUsd:campaign.priceUsd,
    providerExecutionState:'provider_ready_unrequested',
    paidGenerationAuthorized:false,
    publicationAuthority:false,
  };
  fs.writeFileSync(path.join(dir,'attention-pack-v2.json'),JSON.stringify(manifest,null,2)+'\n','utf8');

  return {built,council,variantAssets,audioBrief,productionInventory,visualRequests,clipHandoff,manifest,dir};
}

if(import.meta.url===new URL(process.argv[1]||'', 'file://').href){
  const output=arg('--output');
  const origin=arg('--origin');
  try{
    const result=await buildWebsiteAuditV2({
      ...(output?{outputRoot:output}:{}),
      ...(origin?{origin}:{}),
    });
    console.log(JSON.stringify({
      status:'ready_for_provider_execution',
      dir:result.dir,
      scrollStopScore:result.manifest.scrollStopScore,
      creativeCouncilStatus:result.council.status,
      hookVariantCount:Object.keys(result.variantAssets).length,
      productionNeedCount:result.productionInventory.jobs.length,
      paidGenerationAuthorized:false,
      publicationAuthority:false,
    },null,2));
  }catch(error){
    console.error(error instanceof Error?error.stack||error.message:String(error));
    process.exitCode=1;
  }
}
