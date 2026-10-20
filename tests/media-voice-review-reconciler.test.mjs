import assert from 'node:assert/strict';
import test from 'node:test';
import {reconcileVoiceAudition} from '../systemia/media-studio/voice-review-reconciler.mjs';
const axes=['naturalness','accentAuthenticity','emotionalTruth','intelligibility','identityConsistency','mixFit'];
const scores=n=>Object.fromEntries(axes.map(key=>[key,n]));
const digests=['a'.repeat(64),'b'.repeat(64)];
const report=()=>({
 schema:'evercraft.voice-foundry.audition-report.v1',verdict:'INTERNAL_AUDITION_ONLY',projectId:'evercraft-v4-audition',
 rightsAndConsentUnverified:true,publicationAuthorityGranted:false,paidGenerationAuthorized:false,
 candidates:digests.map((digest,i)=>({
  id:'take-'+(i+1),locale:'en-US',accent:'general-american',
  status:'awaiting_human_review',signal:{status:'objective_measurements_only',audioDigest:digest},
  pacing:{audioDigest:digest}
 }))
});
const draft=(id,score,qualified=true)=>({
 schema:'evercraft.voice-foundry.human-audition-draft.v1',
 projectId:'evercraft-v4-audition',reviewerId:id,reviewerLocale:'en-US',
 qualifiedAccentReviewClaimed:qualified,consentAndRightsVerified:false,
 publicationAuthorityGranted:false,status:'draft_unverified',
 reviews:digests.map((digest,i)=>({
  candidateId:'take-'+(i+1),artifactDigest:digest,claimedReviewerId:id,
  claimedLocale:'en-US',claimedAccentQualification:qualified,
  scores:scores(score),notes:'Observed pacing and articulation.',unverifiedDraft:true,
 }))
});
test('two independent blind review drafts produce traceable editorial shortlist but never a release approval',()=>{
 const r=reconcileVoiceAudition({report:report(),drafts:[draft('reviewer-a',5),draft('reviewer-b',4)]});
 assert.equal(r.status,'unverified_draft_reconciliation_only');
 assert.equal(r.candidates[0].status,'eligible_for_further_verified_review');
 assert.deepEqual(r.editorialShortlist,['take-1','take-2']);
 assert.equal(r.candidates[0].meanScore,4.5);
 assert.equal(r.auditionSourceDigest.length,64);
 assert.equal(r.reviewerIdentityAuthenticated,false);
 assert.equal(r.independentHumanListeningVerified,false);
 assert.equal(r.commercialRightsVerified,false);
 assert.equal(r.publicationAuthorityGranted,false);
});
test('tampering with candidate audio SHA-256 blocks the entire shortlist',()=>{
 const v=draft('reviewer-b',5);v.reviews[0].artifactDigest='9'.repeat(64);
 const r=reconcileVoiceAudition({report:report(),drafts:[draft('reviewer-a',5),v]});
 assert.equal(r.status,'review_integrity_held');
 assert.ok(r.reasons.includes('review_audio_digest_mismatch:take-1'));
 assert.deepEqual(r.editorialShortlist,[]);
});
test('a single person submitting twice is not independent corroboration',()=>{
 const r=reconcileVoiceAudition({report:report(),drafts:[draft('same-id',5),draft('same-id',5)]});
 assert.ok(r.reasons.includes('reviewers_not_independent'));
 assert.equal(r.editorialShortlist.length,0);
});
test('missing scored takes cannot be hidden in a valid-looking reviewer draft',()=>{
 const second=draft('reviewer-b',5);second.reviews.pop();
 const r=reconcileVoiceAudition({report:report(),drafts:[draft('reviewer-a',5),second]});
 assert.ok(r.reasons.includes('reviewer_did_not_score_every_candidate'));
 assert.equal(r.status,'review_integrity_held');
});
test('a locale-claimed accent reviewer must match the candidate locale exactly',()=>{
 const a=draft('reviewer-a',5,false),b=draft('reviewer-b',5,false);
 const r=reconcileVoiceAudition({report:report(),drafts:[a,b]});
 assert.equal(r.candidates[0].status,'held_for_review');
 assert.ok(r.candidates[0].reasons.includes('accent_qualified_review_not_claimed'));
 assert.deepEqual(r.editorialShortlist,[]);
});
test('extreme reviewer disagreement and low axis scores get held instead of averaged away',()=>{
 const r=reconcileVoiceAudition({report:report(),drafts:[draft('reviewer-a',5),draft('reviewer-b',2)]});
 assert.ok(r.candidates.every(x=>x.reasons.includes('reviewer_disagreement_requires_discussion')));
 assert.ok(r.candidates.every(x=>x.reasons.includes('at_least_one_quality_dimension_below_four')));
 assert.deepEqual(r.editorialShortlist,[]);
});
test('tampered score axes and claimed reviewer IDs fail validation',()=>{
 const b=draft('reviewer-b',5);b.reviews[0].scores.naturalness=6;
 const r=reconcileVoiceAudition({report:report(),drafts:[draft('reviewer-a',5),b]});
 assert.ok(r.reasons.includes('review_score_set_invalid:take-1'));
 const c=draft('reviewer-b',5);c.reviews[0].claimedReviewerId='someone-else';
 const s=reconcileVoiceAudition({report:report(),drafts:[draft('reviewer-a',5),c]});
 assert.ok(s.reasons.includes('review_reviewer_claim_mismatch:take-1'));
});
test('rejects source reports without measured SHA-bound audio and false production status',()=>{
 const r=report();r.candidates[0].pacing.audioDigest='c'.repeat(64);
 assert.throws(()=>reconcileVoiceAudition({report:r,drafts:[draft('reviewer-a',5),draft('reviewer-b',5)]}),/candidate_audio_evidence_invalid/);
 const t=report();t.verdict='READY_TO_PUBLISH';
 assert.throws(()=>reconcileVoiceAudition({report:t,drafts:[draft('reviewer-a',5),draft('reviewer-b',5)]}),/original_audition_report_required/);
});

test('case variations of the same reviewer identity do not count as independent listens',()=>{
 const r=reconcileVoiceAudition({report:report(),drafts:[draft('SoundDirector',5),draft('sounddirector',5)]});
 assert.ok(r.reasons.includes('reviewers_not_independent'));
 assert.equal(r.editorialShortlist.length,0);
});
test('a manually altered publishable report is never considered valid input',()=>{
 const bad=report();bad.publicationAuthorityGranted=true;
 assert.throws(()=>reconcileVoiceAudition({report:bad,drafts:[draft('reviewer-a',5),draft('reviewer-b',5)]}),/original_audition_report_required/);
});
