#!/usr/bin/env node
// Evercraft Journal Arase release dossier.
// This is a read-only gate audit. It cannot approve, publish, sign, or distribute.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {runEditorialClaimPreflight} from './editorial-claim-preflight.mjs';
import {verifyScienceCandidate} from './arase-editorial-preview.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../..');
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const sha256=s=>crypto.createHash('sha256').update(s).digest('hex');
const id='journal:2026-10-31:arase-radiation-barrier';
const clean=x=>String(x??'').trim();
const gate=(name,state,evidence,next_action)=>({name,state,evidence,next_action});
const requireEqual=(actual,expected,label)=>{if(actual!==expected)throw Error('arase_dossier_'+label+'_mismatch');};

export function auditAraseRelease({markdown,claimInput,media,rights,index}){
 if(typeof markdown!=='string'||!claimInput||!media||!rights||!index)throw Error('arase_dossier_inputs_missing');
 const story=verifyScienceCandidate(markdown,media);
 requireEqual(claimInput.story_id,id,'claim_identity');
 requireEqual(media.story_id,id,'media_identity');
 requireEqual(rights.story_id,id,'rights_identity');
 requireEqual(claimInput.release_state,'candidate_only_not_approved','claim_authority');
 requireEqual(media.publication_state,'editorial_draft_only','media_authority');
 requireEqual(story.title,"The Particle Accelerator Inside Earth's \"Impenetrable\" Barrier",'precise_title');
 if(/made its own radiation/i.test(story.title)||!/electrons were being accelerated|electrons were accelerated|electrons being accelerated/i.test(markdown)){
  throw Error('arase_dossier_headline_or_mechanism_unbounded');
 }
 const paper=claimInput.sources.find(s=>s.source_id==='arase-peer-reviewed');
 if(paper?.url!=='https://doi.org/10.1029/2026GL125879')throw Error('arase_dossier_primary_paper_missing');
 const flux=claimInput.claims.find(c=>c.claim_id==='c:factor');
 if(flux?.claim_type!=='statistical'||!flux.claim.includes('3,128-keV')||!flux.claim.includes('L* < 3')||
    !flux.baseline||!flux.time_period||!flux.population)throw Error('arase_dossier_flux_scope_invalid');
 const headlineRisk=claimInput.unresolved.find(t=>/headline|particle creation/i.test(t));
 if(!headlineRisk)throw Error('arase_dossier_historical_headline_risk_missing');
 const preflight=runEditorialClaimPreflight(claimInput);
 const sourceBound=preflight.evidence_preflight_ready===true&&
    preflight.publication_blockers.length===0&&
    preflight.claim_count>=6&&
    preflight.evidence_count>=6&&
    preflight.publication_authority===false;
 if(!sourceBound)throw Error('arase_dossier_claim_reactor_not_ready');
 if(rights.original_photo?.sha256!==media.hero.expected_sha256||
    rights.original_photo?.url!==media.hero.image_url||
    rights.original_photo?.bytes!==media.hero.expected_bytes||
    rights.original_photo?.item_credit!==media.hero.photographer_credit)throw Error('arase_dossier_photo_source_identity_changed');
 if(rights.preliminary_decision?.newsroom_hero_may_publish!==false||
    rights.preliminary_decision?.clip_promotional_use_authorized!==false||
    rights.preliminary_decision?.visual_rights_state!=='not_yet_verified')throw Error('arase_dossier_photo_rights_claim_not_independently_reviewed');
 if(!Array.isArray(index.stories)||!Array.isArray(index.archive))throw Error('arase_dossier_index_invalid');
 const published=(index.stories||[]).find(x=>x.story_id===id);
 const archive=(index.archive||[]).find(x=>x.story_id===id);
 const checks=[
  gate('claim_reactor','preflight_passed',preflight.claim_count+' claims / '+preflight.evidence_count+' evidence rows; all source IDs resolve within packet','Independent scientific editor must examine the direct paper and reconcile the claim register.'),
  gate('independent_editorial_10_of_10','pending',null,'Obtain dated, attributable independent editorial acceptance; never mint it from this machine report.'),
  gate('source_freshness_and_independent_corroboration','pending',null,'Recheck sources on release day; distinguish the study from institutional summaries of the same study.'),
  gate('exact_photo_rights','pending',rights.original_photo.sha256,'Reconfirm original NASA photograph ownership, credit, third-party exceptions and precise editorial reuse; record named rights reviewer.'),
  gate('hero_crop_and_visual_qc','pending',null,'Create optimized phone and desktop image crops, compare against original and bind output hashes; review actual render.'),
  gate('fallen_production','pending',null,'Complete source-bound visual science review and production-grade Fallen receipt, not merely a creative brief.'),
  gate('systemia_signed_release','pending',null,'Obtain real authorized Systemia release from protected node; no synthesized signature.'),
  gate('public_canonical_delivery',published?'source_index_lists_story_unverified':'not_published',published?.canonical_url||null,'Verify the actual story receipt, source hash, public HTTPS status and canonical identity from outside the edge.'),
  gate('clip_distribution','held',null,'Only after the verified Journal article and separate destination authorization, obtain provider post IDs and URLs.')
 ];
 return {
  schema:'evercraft.journal.arase-release-dossier.v1',
  story_id:id,
  title:story.title,
  stage:'science_preflight_passed_publication_pending',
  article:{word_count:story.article.split(/\s+/).length,sections:story.sections.length,sha256:sha256(markdown)},
  evidence:{preflight_ready:true,claim_count:preflight.claim_count,evidence_count:preflight.evidence_count,source_count:preflight.source_count,blockers:[]},
  photo:{source_sha256:media.hero.expected_sha256,rights_state:rights.preliminary_decision.visual_rights_state,release_approved:false},
  journal:{other_live_story_count:index.stories.filter(x=>x.story_id!==id).length,arase_in_current_edition:Boolean(published),arase_in_archive:Boolean(archive),source_index_generated_at:index.generated_at},
  checks,
  pending:checks.filter(x=>x.state!=='preflight_passed'),
  editorial_approval:false,
  independent_10_of_10_receipt:null,
  systemia_release_receipt:null,
  clip_authorization:false,
  publication_authority:false,
  limitation:'This checks repository evidence and recorded rights state only; it does not fetch live primary sources, verify an externally delivered article, or independently attest a human editorial signoff.'
 };
}

export function renderDossierMarkdown(report){
 const lines=[
  '# Evercraft Journal | Arase release dossier',
  '',
  '**State:** SCIENCE PREFLIGHT PASSED · EDITORIAL / PHOTO / RELEASE HELD',
  '**Story:** '+report.title,
  '**ID:** '+report.story_id,
  '',
  'Research evidence: '+report.evidence.claim_count+' source-bound claims, '+report.evidence.evidence_count+' evidence rows, '+report.evidence.source_count+' registered sources.',
  'Readiness: a successful Claim Reactor preflight is not independent editorial acceptance.',
  '',
  '## Required evidence and review gates',
  ''
 ];
 for(const step of report.checks){
  lines.push('### '+step.name.replaceAll('_',' '));
  lines.push('State: '+step.state);
  if(step.evidence)lines.push('Current evidence: '+step.evidence);
  lines.push('Next action: '+step.next_action);
  lines.push('');
 }
 lines.push('## Publishing boundary');
 lines.push('');
 lines.push('No independent 10/10 approval, no verified photo-use acceptance, no Fallen release receipt, no signed Systemia publication, and no Clip distribution permission are issued here.');
 lines.push('');
 lines.push('The Journal may separately host other current articles. This dossier refers only to Arase.');
 lines.push('');
 return lines.join('\n');
}
export function writeAraseDossier({markdown,claimInput,media,rights,index,output=path.join(os.tmpdir(),'evercraft-arase-release-dossier.json')}){
 const file=path.resolve(output);
 if(!file.endsWith('.json')||file===repo||file.startsWith(repo+path.sep))throw Error('arase_dossier_output_must_be_private_json');
 const result=auditAraseRelease({markdown,claimInput,media,rights,index});
 fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n');
 const md=file.replace(/\.json$/,'.md');
 fs.writeFileSync(md,renderDossierMarkdown(result));
 return {schema:result.schema,report:file,review_notes:md,evidence_ready:result.evidence.preflight_ready,release_authorized:false,report_sha256:sha256(fs.readFileSync(file)),review_sha256:sha256(fs.readFileSync(md))};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const markdown=fs.readFileSync(path.join(here,'editorial-queue/2026-10-31-arase-radiation-barrier.md'),'utf8');
 const claimInput=readJson(path.join(here,'editorial-queue/2026-11-15-arase-claim-input.json'));
 const media=readJson(path.join(here,'editorial-assets/arase-may-2024-storm-media.json'));
 const rights=readJson(path.join(here,'editorial-assets/arase-photo-rights-review-20261115.json'));
 const index=readJson(path.join(repo,'public/journal/index.json'));
 const result=writeAraseDossier({markdown,claimInput,media,rights,index,output:process.argv[2]||undefined});
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
