import crypto from 'node:crypto';
import { assessVoicePerformance } from './voice-performance.mjs';
import { checkVoiceContinuity } from './voice-continuity.mjs';

const DIGEST = /^[a-f0-9]{64}$/i;
const VOICE_SCORE_KEYS = ['naturalness','accentAuthenticity','emotionalTruth','intelligibility','identityConsistency','mixFit'];

function fingerprint(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function validLocale(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try { return Intl.getCanonicalLocales(value).length === 1; } catch { return false; }
}
function eqLocale(a,b) {
  return Intl.getCanonicalLocales(a)[0] === Intl.getCanonicalLocales(b)[0];
}
function unique(items) { return new Set(items).size === items.length; }
function checkedString(value) { return typeof value === 'string' && value.trim().length > 0; }

/** Locale-aware term matching. Do not flag "Evercrafting" as "Evercraft".
 * CJK scripts can be unspaced and need qualified human pronunciation review;
 * matching a written term does NOT verify its phonetic realization.
 */
export function containsPronunciationTerm(text, term, locale) {
  if (!checkedString(text) || !checkedString(term) || !validLocale(locale)) return false;
  const language=Intl.getCanonicalLocales(locale)[0];
  const hay=text.normalize('NFC').toLocaleLowerCase(language);
  const word=term.normalize('NFC').toLocaleLowerCase(language);
  if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(word)) return hay.includes(word);
  let start=0;
  while (start < hay.length) {
    const position=hay.indexOf(word,start);
    if (position<0) return false;
    const left=Array.from(hay.slice(0,position)).at(-1)??'';
    const right=Array.from(hay.slice(position+word.length))[0]??'';
    const wordChar=/[\p{L}\p{N}\p{M}]/u;
    if ((!left||!wordChar.test(left))&&(!right||!wordChar.test(right))) return true;
    start=position+word.length;
  }
  return false;
}

/**
 * No provider calls are made. This is a deterministic, fail-closed casting and
 * performance contract for upstream TTS adapters, actors, and audio QA workers.
 */
export function planVoiceSession({profiles, cues, lexicon=[], previousCast=[]}) {
  if (!Array.isArray(profiles) || !Array.isArray(cues) || !Array.isArray(lexicon)) {
    throw new TypeError('voice_foundry_arrays_required');
  }
  const ids = profiles.map(p=>p?.id);
  if (!unique(ids) || ids.some(id=>!checkedString(id))) throw new Error('voice_foundry_profile_ids_invalid');
  const cueIds=cues.map(c=>c?.id);
  if (!unique(cueIds) || cueIds.some(id=>!checkedString(id))) throw new Error('voice_foundry_cue_ids_invalid');
  const catalog=new Map(profiles.map(p=>[p.id,p]));
  const results=cues.map(cue=>{
    const reasons=[];
    const profile=catalog.get(cue?.voiceProfileId);
    if (!profile) reasons.push('voice_profile_unregistered');
    if (!checkedString(cue?.speakerId)) reasons.push('speaker_id_missing');
    if (!checkedString(cue?.text)) reasons.push('spoken_text_missing');
    // No inline provider instructions can bypass separate human-approved acting cues.
    if(checkedString(cue?.text)&&cue.text.includes('[')&&cue.text.includes(']')) reasons.push('inline_audio_tags_unapproved');
    if (!validLocale(cue?.locale)) reasons.push('locale_invalid');
    if (!checkedString(cue?.accent)) reasons.push('accent_not_cast');
    if (!checkedString(cue?.direction)) reasons.push('performance_direction_missing');
    const approvedPerformance=assessVoicePerformance(cue?.performance);
    if(approvedPerformance.status==='held') reasons.push(...approvedPerformance.reasons);
    if (cue?.maxDurationSec !== undefined && (!Number.isFinite(cue.maxDurationSec) || cue.maxDurationSec <= 0)) reasons.push('duration_invalid');
    if (profile) {
      if (profile.approval !== 'human_audition_approved') reasons.push('voice_audition_unapproved');
      if (profile.rights?.status !== 'cleared' || profile.rights?.commercialUse !== true || !checkedString(profile.rights?.evidenceRef)) reasons.push('voice_rights_or_consent_unverified');
      if (!checkedString(profile.provider) || !checkedString(profile.providerVoiceId)) reasons.push('provider_voice_binding_missing');
      if (!checkedString(profile.identityVersion)) reasons.push('identity_version_missing');
      if (validLocale(cue?.locale)) {
        const supported=(profile.locales??[]).some(locale=>validLocale(locale) && eqLocale(locale,cue.locale));
        if (!supported) reasons.push('requested_locale_not_verified_for_voice');
      }
      if (checkedString(cue?.accent) && !((profile.accents??[]).includes(cue.accent))) reasons.push('requested_accent_not_verified_for_voice');
    }
    const matchedLexicon=[];
    for (const entry of lexicon) {
      if (!checkedString(entry?.term) || !checkedString(entry?.reading) || !validLocale(entry?.locale) || !checkedString(entry?.reviewerEvidenceRef)) {
        reasons.push('pronunciation_entry_unverified');
        continue;
      }
      if (validLocale(cue?.locale) && eqLocale(entry.locale,cue.locale) && checkedString(cue?.text) && containsPronunciationTerm(cue.text,entry.term,cue.locale)) {
        matchedLexicon.push({term:entry.term,reading:entry.reading,evidenceRef:entry.reviewerEvidenceRef});
      }
    }
    const plan={
      cueId:cue.id,
      speakerId:cue.speakerId,
      voiceProfileId:cue.voiceProfileId,
      identityVersion:profile?.identityVersion??null,
      provider:profile?.provider??null,
      providerVoiceId:profile?.providerVoiceId??null,
      locale:cue.locale,
      accent:cue.accent,
      text:cue.text,
      direction:cue.direction,
      performance:approvedPerformance.performance,
      maxDurationSec:cue.maxDurationSec??null,
      pronunciation:matchedLexicon,
    };
    return {
      ...plan,
      status:reasons.length?'blocked':'ready_for_authorized_generation',
      reasons:[...new Set(reasons)],
      planDigest:fingerprint(plan),
    };
  });
  const continuity=checkVoiceContinuity({session:{schema:'evercraft.voice-foundry.session.v1',cues:results},previousCast});
  return {
    schema:'evercraft.voice-foundry.session.v1',
    status:results.length>0 && results.every(r=>r.status==='ready_for_authorized_generation') && continuity.status==='cast_contract_consistent_requires_listening'?'ready_for_authorized_generation':'held',
    continuity,
    cues:results,
    providerCallMade:false,
    paidGenerationAuthorized:false,
    publicationAuthorityGranted:false,
  };
}

/**
 * Reviews must be performed by two distinct people, including a listener who
 * can attest to the specified locale/accent. Scores alone are not assertions
 * of quality: evidence is required and reviewers remain humans.
 */
export function evaluateVoiceTake({plannedCue, take, reviews, signal, pacing, transcript}) {
  const reasons=[];
  if (!plannedCue || plannedCue.status!=='ready_for_authorized_generation') reasons.push('casting_plan_not_ready');
  if (!checkedString(take?.cueId) || take.cueId!==plannedCue?.cueId) reasons.push('take_cue_mismatch');
  if (!checkedString(take?.voiceProfileId) || take.voiceProfileId!==plannedCue?.voiceProfileId) reasons.push('take_voice_identity_mismatch');
  if (!checkedString(take?.planDigest) || take.planDigest!==plannedCue?.planDigest) reasons.push('take_plan_digest_mismatch');
  if (!DIGEST.test(take?.artifactDigest??'')) reasons.push('audio_digest_missing');
  if (!checkedString(take?.providerReceiptRef)) reasons.push('provider_receipt_missing');
  if (take?.rightsVerified!==true) reasons.push('take_rights_unverified');
  if (!validLocale(take?.locale) || (validLocale(plannedCue?.locale) && !eqLocale(take.locale,plannedCue.locale))) reasons.push('take_locale_mismatch');
  if (take?.accent!==plannedCue?.accent) reasons.push('take_accent_mismatch');
  if (!Number.isFinite(take?.durationSec) || take.durationSec<=0) reasons.push('take_duration_missing');
  if (plannedCue?.maxDurationSec && take?.durationSec > plannedCue.maxDurationSec+.10) reasons.push('speech_outside_editorial_window');
  if (!checkedString(take?.timingEvidenceRef)) reasons.push('timing_measurement_missing');
  if (!checkedString(take?.transcriptEvidenceRef)) reasons.push('transcript_review_missing');
  if (!checkedString(take?.audioMeasurementEvidenceRef)) reasons.push('signal_measurement_missing');
  if (!checkedString(take?.pacingEvidenceRef)) reasons.push('pacing_measurement_evidence_missing');
  if (signal?.schema !== 'evercraft.voice-foundry.signal-inspection.v1' || signal?.status !== 'objective_measurements_only') reasons.push('verified_signal_inspection_missing_or_held');
  if (signal?.audioDigest !== take?.artifactDigest) reasons.push('signal_audio_digest_mismatch');
  if (!Number.isFinite(signal?.durationSec) || !Number.isFinite(take?.durationSec) || Math.abs(signal.durationSec-take.durationSec)>0.05) reasons.push('signal_duration_mismatch');
  if (!Number.isFinite(signal?.samplePeakDbFS) || !Number.isFinite(take?.samplePeakDbFS) || Math.abs(signal.samplePeakDbFS-take.samplePeakDbFS)>0.15) reasons.push('signal_peak_mismatch');
  if (pacing?.schema!=='evercraft.voice-foundry.pacing-inspection.v1' || !['measured_not_performance_approved','needs_human_rhythm_review'].includes(pacing?.status)) reasons.push('measured_pacing_missing');
  if (pacing?.audioDigest !== take?.artifactDigest) reasons.push('pacing_audio_digest_mismatch');
  if (!Number.isFinite(pacing?.durationSec) || !Number.isFinite(take?.durationSec) || Math.abs(pacing.durationSec-take.durationSec)>0.05) reasons.push('pacing_duration_mismatch');
  if (pacing?.status==='needs_human_rhythm_review' && (take?.pacingNotesReviewed!==true || !checkedString(take?.pacingReviewEvidenceRef))) reasons.push('pacing_warnings_need_editorial_acknowledgement');
  if (transcript?.schema!=='evercraft.voice-foundry.transcript-audit.v1' || transcript?.status!=='candidate_text_match_needs_human_review') reasons.push('recognized_script_requires_review_or_correction');
  if (transcript?.audioDigest!==take?.artifactDigest) reasons.push('transcript_audio_digest_mismatch');
  if (transcript?.cueId!==plannedCue?.cueId) reasons.push('transcript_cue_mismatch');
  if (!validLocale(transcript?.locale) || (validLocale(plannedCue?.locale)&&!eqLocale(transcript.locale,plannedCue.locale))) reasons.push('transcript_locale_mismatch');
  if (!Number.isFinite(transcript?.wordErrorRate) || transcript.wordErrorRate>0.05) reasons.push('transcript_word_error_rate_unacceptable');
  if (!checkedString(transcript?.evidenceDigest)) reasons.push('transcript_audit_evidence_missing');
  if (!Number.isFinite(take?.samplePeakDbFS) || take.samplePeakDbFS>=0) reasons.push('digital_clipping_or_peak_unmeasured');
  if (!Array.isArray(reviews) || reviews.length < 2) reasons.push('two_human_reviews_required');
  else {
    const ids=reviews.map(r=>r?.reviewerId);
    if (!unique(ids) || ids.some(id=>!checkedString(id))) reasons.push('independent_reviewers_required');
    if (!reviews.some(r=>r?.localeAccentQualified===true && r?.locale===plannedCue?.locale && r?.accent===plannedCue?.accent)) reasons.push('native_or_qualified_accent_review_required');
    for(const review of reviews) {
      if (!checkedString(review?.evidenceRef)) reasons.push('human_review_evidence_missing');
      if (review?.approved!==true) reasons.push('human_reviewer_rejected');
      for (const key of VOICE_SCORE_KEYS) {
        const score=review?.scores?.[key];
        if (!Number.isFinite(score) || score<4 || score>5) reasons.push('human_quality_below_threshold:'+key);
      }
      const scores=VOICE_SCORE_KEYS.map(k=>review?.scores?.[k]);
      if (scores.every(Number.isFinite) && scores.reduce((a,b)=>a+b,0)/scores.length < 4.5) reasons.push('human_average_below_4_5');
    }
  }
  const accepted=reasons.length===0;
  return {
    schema:'evercraft.voice-foundry.take-qa.v1',
    cueId:plannedCue?.cueId??null,
    artifactDigest:take?.artifactDigest??null,
    status:accepted?'passed_internal_voice_qa':'held',
    reasons:[...new Set(reasons)],
    manualEditorialApprovalStillRequired:true,
    publicationAuthorityGranted:false,
    reviewDigest:fingerprint({planDigest:plannedCue?.planDigest,take,reviews,signal,pacing,transcript}),
  };
}
