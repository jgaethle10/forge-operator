import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const SCORE_KEYS=['naturalness','accentAuthenticity','emotionalTruth','intelligibility','identityConsistency','mixFit'];
const SHA=/^[a-f0-9]{64}$/i;
const txt=v=>typeof v==='string'&&v.trim().length>0;
const numeric=v=>typeof v==='number'&&Number.isFinite(v);
const round=v=>Math.round(v*100)/100;
const sha=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const sameLocale=(a,b)=>{
 try{return Intl.getCanonicalLocales(a)[0]===Intl.getCanonicalLocales(b)[0];}
 catch{return false;}
};
/**
 * Reconcile OFFLINE, unauthenticated human-review drafts with an exact frozen
 * audio audition report. No identity, provider, legal-rights or listening claims.
 * Candidate rankings here are for triage only, never publication decisions.
 */
export function reconcileVoiceAudition({report,drafts}){
 if(report?.schema!=='evercraft.voice-foundry.audition-report.v1'||
   report.verdict!=='INTERNAL_AUDITION_ONLY'||report.publicationAuthorityGranted!==false||
   report.rightsAndConsentUnverified!==true||report.paidGenerationAuthorized!==false||
   !Array.isArray(report.candidates)||
   report.candidates.length<2||report.candidates.length>20){
   throw new Error('voice_review_original_audition_report_required');
 }
 if(!Array.isArray(drafts)||drafts.length<2||drafts.length>8)
   throw new Error('voice_review_two_to_eight_drafts_required');
 const reasons=[];
 const candidates=new Map();
 for(const c of report.candidates){
   if(!txt(c.id)||candidates.has(c.id)||!SHA.test(c.signal?.audioDigest??'')||
     c.pacing?.audioDigest!==c.signal.audioDigest){
     throw new Error('voice_review_candidate_audio_evidence_invalid');
   }
   candidates.set(c.id,c);
 }
 const ids=new Set();
 const mapped=new Map([...candidates.keys()].map(id=>[id,[]]));
 const reviews=[];
 for(const draft of drafts){
   if(draft?.schema!=='evercraft.voice-foundry.human-audition-draft.v1' ||
      draft.projectId!==report.projectId ||
      draft.status!=='draft_unverified'||draft.unverifiedDraft===false ||
      draft.publicationAuthorityGranted!==false ||
      draft.consentAndRightsVerified!==false || !txt(draft.reviewerId) ||
      !txt(draft.reviewerLocale) || !Array.isArray(draft.reviews)){
     reasons.push('review_draft_schema_or_project_mismatch');
     continue;
   }
   const reviewerId=draft.reviewerId.trim();
   const reviewKey=reviewerId.toLocaleLowerCase('en-US');
   if(ids.has(reviewKey)){reasons.push('reviewers_not_independent');continue;}
   ids.add(reviewKey);
   if(draft.reviews.length!==report.candidates.length){
     reasons.push('reviewer_did_not_score_every_candidate');
     continue;
   }
   const local=new Set();
   const staged=[];
   for(const review of draft.reviews){
     const candidate=candidates.get(review?.candidateId);
     if(!candidate||local.has(review.candidateId)){reasons.push('candidate_review_missing_duplicate_or_unknown');continue;}
     local.add(candidate.id);
     if(review.artifactDigest!==candidate.signal.audioDigest){reasons.push('review_audio_digest_mismatch:'+candidate.id);continue;}
     if(review.claimedReviewerId!==reviewerId ||
       !sameLocale(review.claimedLocale,draft.reviewerLocale) ||
       review.claimedAccentQualification!==draft.qualifiedAccentReviewClaimed ||
       review.unverifiedDraft!==true){
       reasons.push('review_reviewer_claim_mismatch:'+candidate.id);continue;
     }
     const scores=review.scores;
     if(!scores||Object.keys(scores).sort().join(',')!==[...SCORE_KEYS].sort().join(',')||
       !SCORE_KEYS.every(k=>numeric(scores[k])&&Number.isInteger(scores[k])&&scores[k]>=1&&scores[k]<=5)){
       reasons.push('review_score_set_invalid:'+candidate.id);continue;
     }
     if(typeof review.notes!=='string'||review.notes.length>4000){
       reasons.push('review_notes_invalid:'+candidate.id);continue;
     }
     staged.push({candidateId:candidate.id,reviewerId,claimedLocale:draft.reviewerLocale,
       accentQualifiedClaimed:review.claimedAccentQualification===true&&sameLocale(draft.reviewerLocale,candidate.locale),
       scores:Object.fromEntries(SCORE_KEYS.map(k=>[k,scores[k]])),
       notes:review.notes.trim()});
   }
   if(staged.length!==report.candidates.length){
     reasons.push('reviewer_submission_incomplete:'+reviewerId);
     continue;
   }
   for(const item of staged){mapped.get(item.candidateId).push(item);reviews.push(item);}
 }
 const entries=[...candidates.values()].map(candidate=>{
   const own=mapped.get(candidate.id);
   const holds=[];
   if(candidate.status!=='awaiting_human_review'||candidate.signal?.status!=='objective_measurements_only')holds.push('candidate_signal_not_admitted');
   if(own.length!==drafts.length)holds.push('not_all_independent_reviewers_scored_candidate');
   if(!own.some(r=>r.accentQualifiedClaimed))holds.push('accent_qualified_review_not_claimed');
   const perAxis=Object.fromEntries(SCORE_KEYS.map(k=>[k,own.length?round(own.reduce((a,b)=>a+b.scores[k],0)/own.length):null]));
   const all=own.flatMap(review=>SCORE_KEYS.map(k=>review.scores[k]));
   const mean=all.length?round(all.reduce((a,b)=>a+b,0)/all.length):null;
   const low=all.length?Math.min(...all):null;
   const gap=own.length>=2?
       Math.max(...SCORE_KEYS.map(k=>Math.max(...own.map(r=>r.scores[k]))-Math.min(...own.map(r=>r.scores[k])))):null;
   if(low!==null&&low<4)holds.push('at_least_one_quality_dimension_below_four');
   if(mean!==null&&mean<4.5)holds.push('human_score_average_below_four_point_five');
   if(gap!==null&&gap>=2)holds.push('reviewer_disagreement_requires_discussion');
   return {candidateId:candidate.id,audioDigest:candidate.signal.audioDigest,
     provider:candidate.provider??null,modelId:candidate.modelId??null,voiceProfileId:candidate.voiceProfileId??null,
     performanceDirection:candidate.performanceDirection??null,
     locale:candidate.locale,accent:candidate.accent,reviewCount:own.length,
     perAxis,meanScore:mean,lowestScore:low,maxReviewerAxisDisagreement:gap,
     status:holds.length?'held_for_review':'eligible_for_further_verified_review',
     reasons:holds};
 });
 const sorted=entries.filter(x=>x.status==='eligible_for_further_verified_review')
   .sort((a,b)=>b.meanScore-a.meanScore||a.candidateId.localeCompare(b.candidateId));
 const heldReasons=[...new Set(reasons)];
 return {
   schema:'evercraft.voice-foundry.review-reconciliation.v1',
   projectId:report.projectId,
   auditionSourceDigest:sha({projectId:report.projectId,candidates:report.candidates.map(c=>({id:c.id,digest:c.signal.audioDigest}))}),
   reviewSetDigest:sha(reviews),
   status:heldReasons.length?'review_integrity_held':'unverified_draft_reconciliation_only',
   reasons:heldReasons,
   candidates:entries,
   editorialShortlist:heldReasons.length?[]:sorted.map(x=>x.candidateId),
   reviewerIdentityAuthenticated:false,
   independentHumanListeningVerified:false,
   accentQualificationVerified:false,
   commercialRightsVerified:false,
   productionQualityCertified:false,
   paidGenerationAuthorized:false,
   publicationAuthorityGranted:false,
 };
}
const here=fileURLToPath(import.meta.url);
if(process.argv[1]&&path.resolve(process.argv[1])===here){
 try{
  const [reportPath,...draftPaths]=process.argv.slice(2);
  if(!reportPath||draftPaths.length<2)throw Error('Usage: node voice-review-reconciler.mjs <audition-report.json> <review-one.json> <review-two.json> [more-reviews...]');
  const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
  process.stdout.write(JSON.stringify(reconcileVoiceAudition({report:read(reportPath),drafts:draftPaths.map(read)}),null,2)+'\n');
 }catch(e){process.stderr.write(String(e.message??e)+'\n');process.exitCode=1;}
}
