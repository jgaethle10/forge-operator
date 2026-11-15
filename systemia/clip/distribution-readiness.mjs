#!/usr/bin/env node
// Read-only diagnosis of Creator + Evercraft distribution. Never sends posts,
// opens provider sessions, uses stored tokens, or equates GitHub source with live reach.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { auditSocialContinuity } from './social-continuity-watch.mjs';

const SCHEMA='evercraft.creator.distribution-readiness.v1';
const clean=v=>String(v??'').trim();
const excluded=new Set(['eps','havenly','havenly-cleaning','christmaslightsusa','rivet','aliev']);

export function diagnosePublishingLanes({
  queue, journalIndex=null, receipts=[], receiptEvidenceAvailable=false,
  creatorPageSourcePresent=false, now=new Date(),
}={}){
  const checkedAt=now instanceof Date?now:new Date(now);
  if(!Number.isFinite(checkedAt.getTime())) throw new Error('distribution_readiness_invalid_clock');
  const social=auditSocialContinuity({
    queue,receipts,now:checkedAt,receiptSourceAvailable:receiptEvidenceAvailable,
  });
  const byId=new Map(social.entries.map(x=>[x.id,x]));
  const channels=queue.entries.map(e=>{
    const id=clean(e.id);
    const observation=byId.get(id);
    const platform=clean(e.platform||e.destination).toLowerCase();
    const label=clean(e.candidate_account_label)||id;
    const brandKey=clean(e.brand_key).toLowerCase();
    const identityVerified=e.account_identity_verified===true&&Boolean(clean(e.account_id));
    const permissionsVerified=e.platform_permissions_verified===true;
    const issuerClaimPresent=e.authorization?.approved===true&&Boolean(clean(e.authorization.authorizationRef));
    const hasProviderReceipt=observation?.state==='provider_receipt_recorded';
    let state,next;
    if(excluded.has(brandKey)){
      state='excluded_brand_boundary';
      next='Keep this business or held project separate from corporate and founder publishing';
    }else if(!identityVerified){
      state='account_identity_unverified';
      next='Verify actual company account ID, ownership, and brand fit in the first-party provider and Home vault';
    }else if(!permissionsVerified){
      state='platform_permissions_unverified';
      next='Read-only diagnose Page or organization access; independently verify required write task before activation';
    }else if(!issuerClaimPresent){
      state='issuer_authority_not_recorded';
      next='Obtain exact account, asset and campaign scoped Systemia/Passport authorization';
    }else if(hasProviderReceipt){
      state='provider_receipt_external_visibility_unverified';
      next='Verify post permalink from a non-admin browser and archive the external readback';
    }else if(observation?.state==='publish_exception'){
      state='provider_receipt_exception';
      next='Reconcile the existing provider attempt; never blindly resubmit ambiguous posts';
    }else if(!receiptEvidenceAvailable){
      state='receipt_evidence_unavailable';
      next='Mount the private provider receipt source; do not infer no posts from absent files';
    }else{
      state='provider_publication_unverified';
      next='Verify issuer authority and approved asset, publish once using owned Clip, then retain provider permalink';
    }
    return {
      request_id:id,platform,account_label:label,
      account_id_present:Boolean(clean(e.account_id)),
      account_identity_verified:identityVerified,
      platform_permissions_verified:permissionsVerified,
      issuer_claim_present:issuerClaimPresent,
      state,next,
      provider_receipt_recorded:hasProviderReceipt,
      provider_post_url:hasProviderReceipt?observation.provider_post_url:null,
      // A receipt or source-side flag is NOT independent public reach.
      public_visibility_verified:false,
    };
  });
  const counts={};
  for(const channel of channels)counts[channel.state]=(counts[channel.state]||0)+1;
  const coveredPlatforms=new Set(channels.map(x=>x.platform));
  const missingPlatforms=['facebook','instagram','linkedin','tiktok','youtube','x']
    .filter(platform=>!coveredPlatforms.has(platform))
    .map(platform=>({platform,state:'no_owned_account_in_campaign_queue',next:'Identify actual company account, publishing adapter and authorization before any post'}));
  const journal=journalIndex?.schema==='evercraft.journal.index.v1'
    ?{
      state:journalIndex.live_edition===true?'source_reports_live_external_verification_required':'no_verified_live_edition_in_source',
      live_edition_in_source:journalIndex.live_edition===true,
      source_story_count:Array.isArray(journalIndex.stories)?journalIndex.stories.length:0,
      archive_count:Array.isArray(journalIndex.archive)?journalIndex.archive.length:0,
      source_generated_at:clean(journalIndex.generated_at)||null,
      public_https_verified:false,
      next:'Use the existing Journal 10/10 editorial and publication gates, then independently probe owned canonical HTTPS and article identity',
    }
    :{
      state:'journal_index_unavailable',
      live_edition_in_source:null,source_story_count:null,archive_count:null,
      source_generated_at:null,public_https_verified:false,
      next:'Recover the current owned Journal index and source-level publication receipt',
    };
  return {
    schema:SCHEMA,observed_at:checkedAt.toISOString(),
    scope:'source_and_optional_private_receipts_only',
    creator:{
      state:creatorPageSourcePresent?'source_present_external_deployment_unverified':'creator_frontdoor_source_missing',
      publisher_authenticated:false,personal_platform_accounts_verified:false,
      next:'Verify creator page independently; authorize personal accounts separately from Evercraft corporate identities',
    },
    journal,
    company:{
      candidate_count:channels.length,by_state:counts,channels,missing_platforms:missingPlatforms,
      platform_connections_independently_verified:false,
    },
    boundaries:{
      read_only:true,provider_write_performed:false,
      account_credentials_checked:false,systemia_mission_admitted:false,
      publication_performed:false,actual_social_reach_proven:false,
      personal_accounts_not_corporate_defaults:true,
      independent_customer_brand_isolation:true,
    },
    guidance:[
      'Prioritize one verified Evercraft company Facebook Page and LinkedIn organization before expanding to historical page candidates.',
      'Creator posts are original discovery/editorial pieces, not recycled product commercials.',
      'Source commits, review queues, provider API acceptance, and remote post visibility are separate states.',
      'Never publish a story to unrelated brands, old Base44 surfaces, or the founder personal account by default.',
    ],
  };
}
function flag(name,fallback=''){const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:fallback;}
function optionalJson(file){if(!file||!fs.existsSync(file))return null;return JSON.parse(fs.readFileSync(file,'utf8'));}
function cell(x){return clean(x).replace(/[|\n\r]/g,' ').slice(0,140);}
export function toMarkdown(report){
  const rows=[
    '# Evercraft Creator & Publishing Lane Readiness',
    '',
    'Read-only source/evidence audit, not an authentication, live-publishing, or page-health proof.',
    '',
    '| Destination | State | Next action |',
    '| --- | --- | --- |',
    '| Jesse creator front door | '+cell(report.creator.state)+' | '+cell(report.creator.next)+' |',
    '| Evercraft Journal | '+cell(report.journal.state)+' | '+cell(report.journal.next)+' |',
    ...report.company.channels.map(x=>'| '+cell(x.account_label+' ('+x.platform+')')+' | '+cell(x.state)+' | '+cell(x.next)+' |'),
    ...report.company.missing_platforms.map(x=>'| Evercraft '+cell(x.platform)+' | '+cell(x.state)+' | '+cell(x.next)+' |'),
    '',
    'Evidence available: '+(report.company.channels.some(x=>x.provider_receipt_recorded)?'some provider receipts in supplied data':'no verified provider receipts in supplied data')+'.',
    'No account credentials or platform write permissions were inspected.',
  ];
  return rows.join('\n')+'\n';
}
function main(){
  const queueFile=flag('--queue','distribution/marketing/evercraft-partners-20261030.review.json');
  const journalFile=flag('--journal-index','public/journal/index.json');
  const creatorFile=flag('--creator-page','public/jesse/index.html');
  const receiptsFile=flag('--receipts-file','');
  const queue=JSON.parse(fs.readFileSync(queueFile,'utf8'));
  const journalIndex=optionalJson(journalFile);
  const supplied=optionalJson(receiptsFile);
  if(supplied!==null&&!Array.isArray(supplied))throw new Error('distribution_readiness_receipts_must_be_array');
  const report=diagnosePublishingLanes({
    queue,journalIndex,receipts:supplied||[],
    receiptEvidenceAvailable:supplied!==null,
    creatorPageSourcePresent:fs.existsSync(creatorFile),
  });
  const result=process.argv.includes('--json')?JSON.stringify(report,null,2)+'\n':toMarkdown(report);
  const output=flag('--out','');
  if(output){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,result);}
  else process.stdout.write(result);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main();
