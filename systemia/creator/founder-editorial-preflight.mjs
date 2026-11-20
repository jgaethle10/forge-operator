#!/usr/bin/env node
// Evercraft creator personal-profile editorial source-and-example preflight.
// This module reads ORIGINAL repository rules and an actual revised founder
// Facebook example on EVERY run. It cannot autonomously approve, publish,
// authenticate a human reviewer, verify external URLs, or impersonate founder.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const FOUNDER_DRAFT_SCHEMA='evercraft.creator.personal-post-candidate.v1';
export const FOUNDER_PREFLIGHT_SCHEMA='evercraft.creator.editorial-preflight.v1';
const rootFromModule=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const authorityPaths=Object.freeze([
 'docs/publishing/HARBOR-EDITORIAL-AND-CUSTOMER-COMMS-20261119.md',
 'docs/creator/FOUNDING_DISTRIBUTION_RECOVERY_20261115.md',
 'distribution/boardroom-public-launch-kit.md',
 'distribution/marketing/evercraft-research-launch-20261029.md',
 'distribution/marketing/boardroom-executive-chamber-20261029.md'
]);
const stamp=content=>'sha256:'+createHash('sha256').update(content).digest('hex');
const isText=(x,min=1,max=1000)=>typeof x==='string'&&x.trim().length>=min&&x.length<=max;
const iso=x=>typeof x==='string'&&x.length<=40&&!Number.isNaN(Date.parse(x));
const safeUrl=value=>{
 try{
  const url=new URL(value),host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.port||
    !host.includes('.')||host.endsWith('.local')||host.endsWith('.internal')||
    host.endsWith('.base44.app')||host==='base44.app'||
    /^(?:127|10|192\.168)\./.test(host)||
    /^172\.(?:1[6-9]|2\d|3[01])\./.test(host))return false;
  return true;
 }catch{return false;}
};
const unique=arr=>[...new Set(arr)];
function loadSources(repoRoot){
 const content=[];
 for(const rel of authorityPaths){
  const file=path.join(repoRoot,rel);
  const st=fs.lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink())throw Error('creator_canonical_source_not_regular:'+rel);
  const raw=fs.readFileSync(file,'utf8');
  if(!raw||raw.length<1000)throw Error('creator_canonical_source_empty_or_truncated:'+rel);
  content.push({rel,raw,sha256:stamp(raw)});
 }
 const [harbor,creator,kit,research,exampleDoc]=content.map(x=>x.raw);
 if(!harbor.includes('### C. Founder personal monetized social profile')||
    !harbor.includes('There is no mandatory paragraph count for social posts')||
    !harbor.includes('## 3. Exact-artifact release checklist')||
    !harbor.includes('This is an **implementation guide, not a replacement'))
   throw Error('creator_canonical_harbor_editorial_anchor_missing');
 if(!creator.includes('**Jesse\'s creator voice:** Look Closer, Build Log, Field Notes, Week in Motion.')||
    !creator.includes('Personal accounts are not emergency ad surfaces'))
   throw Error('creator_canonical_creator_voice_anchor_missing');
 if(!kit.includes('Social content is an evidence-led field report')||
    !kit.includes('There is no required number of paragraphs'))
   throw Error('creator_canonical_style_anchor_missing');
 if(!research.includes('no required paragraph count')||
    !research.includes('do not substitute volume for quality'))
   throw Error('creator_canonical_distribution_anchor_missing');
 const start='### Personal Facebook, for founder to share manually';
 const end='### Personal LinkedIn, for founder to share manually';
 const i=exampleDoc.indexOf(start),j=exampleDoc.indexOf(end);
 if(i<0||j<=i)throw Error('creator_founder_example_section_missing');
 const actualExample=exampleDoc.slice(i+start.length,j).trim();
 if(actualExample.length<600||
    !actualExample.includes('One challenge keeps coming up')||
    !actualExample.includes('The larger Boardroom we\'re building')||
    !actualExample.includes('For now, I\'m sharing'))
   throw Error('creator_founder_example_modified_or_truncated');
 return {sources:content.map(x=>({path:x.rel,sha256:x.sha256})),
  example:{path:content[4].rel,section:start,sha256:stamp(actualExample)}};
}
function paragraphs(text){
 return text.trim().split(/\n[ \t]*\n/).map(s=>s.trim()).filter(Boolean);
}
/**
 * Prepare an exact-copy, source-bound review packet for the founder's PERSONAL
 * Facebook only. Accepts untrusted draft inputs but never grants authority.
 * The editorial annotations are proposals, not proof of actually lived experience.
 */
export function preflightFounderPersonalPost(draft,{repoRoot=rootFromModule}={}){
 const authority=loadSources(repoRoot); // never accept substitute policy from draft
 if(draft?.schema!==FOUNDER_DRAFT_SCHEMA)throw Error('creator_draft_schema_invalid');
 const blockers=[];
 const require=(pass,code)=>{if(!pass)blockers.push(code)};
 const text=draft.copy;
 require(draft.surface==='facebook-personal','wrong_personal_creator_surface');
 require(isText(draft.story_id,6,180),'story_identity_missing');
 require(isText(text,40,10000),'missing_or_unbounded_personal_copy');
 if(typeof text==='string'){
  require(!/[\u2014\u2013]/.test(text),'editorial_punctuation_requires_revision');
  require(!paragraphs(text).some(p=>/^and\b/i.test(p)),'and_leading_paragraph');
  require(!paragraphs(text).some(p=>p.split(/\s+/).length<=4&&p.length<38),
    'isolated_mini_paragraphs');
  require(!/(?:^|\s)#[a-z][\w]{1,50}\b/i.test(text),'hashtag_engagement_campaign');
  require(!/\b(?:smash (?:that )?like|comment below|tag (?:a|your) friend|share if you agree)\b/i.test(text),
    'engagement_bait');
  require(!/\b(?:in conclusion|imagine what we can accomplish together|the future is ours)\b/i.test(text),
    'generic_motivational_closer');
 }
 // An arbitrary 100-word/two-paragraph target contradicts canonical standards.
 const invented=draft?.constraints;
 require(invented===undefined||
   (invented?.word_limit===undefined&&invented?.paragraph_count===undefined&&
    invented?.exact_length_rule===undefined),'invented_length_rule_forbidden');
 require(['look-closer','field-notes','build-log','week-in-motion'].includes(draft.format),
  'creator_series_identity_missing');
 const angle=draft.angle||{};
 for(const [key,minimum] of [['why_now',15],['personal_observation',20],
   ['real_tension',20],['reader_value',20]]){
  require(isText(angle[key],minimum,1800),'editorial_angle_'+key+'_missing');
 }
 const sources=Array.isArray(draft.sources)?draft.sources:[];
 require(sources.length>0&&sources.length<=12,'news_source_evidence_missing');
 const ids=new Set();
 for(const [i,s] of sources.entries()){
  require(isText(s?.id,3,80)&&!ids.has(s?.id),'source_identity_invalid_'+i);
  if(isText(s?.id,3,80))ids.add(s.id);
  require(safeUrl(s?.url),'primary_or_reporting_source_url_invalid_'+i);
  require(['primary','independent_reporting','original_creator'].includes(s?.kind),
    'source_provenance_invalid_'+i);
  require(iso(s?.checked_at),'source_freshness_check_missing_'+i);
 }
 const claims=Array.isArray(draft.claims)?draft.claims:[];
 require(claims.length>0&&claims.length<=40,'claim_ledger_missing');
 for(const [i,c] of claims.entries()){
  const refs=c?.source_ids;
  require(isText(c?.claim,8,600),'claim_copy_missing_'+i);
  require(['confirmed','attributed','forecast','proposed','uncertain'].includes(c?.truth_state),
    'claim_truth_state_missing_'+i);
  require(Array.isArray(refs)&&refs.length>0&&refs.every(r=>ids.has(r)),
    'claim_source_binding_invalid_'+i);
  if(['forecast','proposed','uncertain'].includes(c?.truth_state))
   require(isText(c?.qualifying_language_in_copy,5,300)&&
    typeof text==='string'&&text.includes(c.qualifying_language_in_copy),
    'forecast_or_proposal_qualification_missing_'+i);
 }
 require(draft.media_search?.attempted===true,'media_source_search_missing');
 const media=draft.media||{};
 require(['original','native-share','licensed','link-only','no-safe-media'].includes(media.usage),
  'media_choice_missing');
 if(media.usage==='original'||media.usage==='licensed'){
  require(isText(media.provenance_ref,8,300)&&isText(media.rights_receipt_ref,8,300),
    'original_or_licensed_media_rights_missing');
 }else if(media.usage==='native-share'||media.usage==='link-only'){
  require(safeUrl(media.url),'native_share_or_media_link_missing');
 }else if(media.usage==='no-safe-media'){
  require(isText(media.reason,10,350),'no_safe_media_reason_missing');
 }
 require(draft.publish_state==='DRAFT_NOT_PUBLISHED','invented_publication_state');
 require(draft.personal_voice_owner==='FOUNDER_TO_REVIEW','founder_voice_review_missing');
 require(draft.autopost_authorized!==true,'personal_profile_autopost_not_allowed');
 const forbidden=['publication_receipt','provider_post_id','social_performance',
   'editorial_approved','full_team_reviewed','human_review_authenticated'];
 for(const k of forbidden)
  require(!Object.hasOwn(draft,k),'untrusted_authority_claim_'+k);
 const ready=blockers.length===0;
 return Object.freeze({
  schema:FOUNDER_PREFLIGHT_SCHEMA,
  status:ready?'READY_FOR_INDEPENDENT_EDITORIAL_REVIEW':'REVISE_BEFORE_EDITORIAL_REVIEW',
  blockers:unique(blockers),
  story_ref:isText(draft.story_id,6,180)?draft.story_id:null,
  exact_copy_sha256:typeof text==='string'?stamp(text):null,
  policy_source_count:authority.sources.length,
  canonical_policy_sources:authority.sources,
  documented_founder_example:authority.example,
  contradictory_length_rule_enforced:false,
  independent_style_and_fact_review_completed:false,
  actual_link_fetch_performed:false,
  copy_authenticated_as_founder_voice:false,
  personal_account_authority_verified:false,
  media_usage_authorized_by_this_tool:false,
  publication_authority:false,
  provider_posted:false,
  first_comment_posted:false,
  next_action:ready?'HUMAN_EDITORIAL_SOURCE_STYLE_AND_MEDIA_REVIEW_OF_EXACT_COPY':
    'REVISE_THEN_REPEAT_CANONICAL_PREFLIGHT',
 });
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
 try{
  if(process.argv.length!==3)throw Error('one_private_candidate_path_required');
  const file=path.resolve(process.argv[2]);
  const source=fs.readFileSync(file,'utf8');
  if(source.length>256000)throw Error('candidate_too_large');
  const result=preflightFounderPersonalPost(JSON.parse(source));
  // Do not echo copy, personal narratives, private source notes or user identity.
  console.log(JSON.stringify(result,null,2));
  if(result.blockers.length)process.exitCode=2;
 }catch{
  console.error('HOLD: canonical_editorial_source_or_candidate_invalid');
  process.exitCode=2;
 }
}
