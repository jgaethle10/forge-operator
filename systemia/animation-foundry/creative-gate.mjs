/**
 * Evercraft Animation Foundry: creative acceptance and claim integrity gate.
 * A passed geometry/sync test is NOT evidence of character appeal.
 * This module makes that release boundary explicit and reviewable.
 */
export const REVIEW_AXES = Object.freeze([
  'character_appeal',
  'anatomy_and_hands',
  'acting_and_expression',
  'story_readability',
  'shot_staging',
  'music_and_sound'
]);

const TECHNIQUES = new Set(['generated_stills','drawn_stills','cutout_2d','rigged_2d','rigged_3d','live_action']);
const CLAIMS = new Set(['concept_art','story_animatic','character_animation']);
const nonblank = x => typeof x === 'string' && x.trim().length > 0;

export function evaluateCreativeGate(submission) {
  const blockers = [];
  if (!submission || typeof submission !== 'object') {
    return { pass: false, blockers: ['submission_missing'], humanApprovalVerified: false };
  }
  if (!nonblank(submission.projectId)) blockers.push('project_id_missing');
  if (!TECHNIQUES.has(submission.technique)) blockers.push('technique_unknown');
  if (!CLAIMS.has(submission.claim)) blockers.push('claim_unknown');

  const stills = ['generated_stills', 'drawn_stills'];
  if (stills.includes(submission.technique) && submission.claim === 'character_animation') {
    blockers.push('stills_misrepresented_as_character_animation');
  }
  if (submission.claim === 'character_animation' &&
      !['cutout_2d', 'rigged_2d', 'rigged_3d', 'live_action'].includes(submission.technique)) {
    blockers.push('unsupported_character_animation_claim');
  }
  if (submission.audio?.sungVocalClaimed === true) {
    if (!nonblank(submission.audio?.vocalAsset)) blockers.push('sung_vocal_asset_missing');
    if (!nonblank(submission.audio?.performanceProvenance)) blockers.push('sung_performance_provenance_missing');
  }

  // Evidence/test claims must never silently become subjective artistic approval.
  if (submission.status === 'release_candidate') {
    if (!Array.isArray(submission.visualEvidence) || !submission.visualEvidence.length) {
      blockers.push('visual_evidence_missing');
    }
    for (const axis of REVIEW_AXES) {
      const r = submission.humanReviews?.[axis];
      if (!(r?.decision === 'approved' && nonblank(r.reviewer) && nonblank(r.evidence))) {
        blockers.push('human_review_missing:' + axis);
      }
    }
    if (submission.rights?.cleared !== true || !nonblank(submission.rights?.evidence)) {
      blockers.push('rights_review_missing');
    }
    if (submission.technical?.status !== 'passed') blockers.push('technical_checks_missing');
  }
  return {
    pass: blockers.length === 0,
    blockers,
    humanApprovalVerified: submission.status === 'release_candidate' &&
      REVIEW_AXES.every(axis => submission.humanReviews?.[axis]?.decision === 'approved' &&
        nonblank(submission.humanReviews?.[axis]?.reviewer) &&
        nonblank(submission.humanReviews?.[axis]?.evidence)),
    evaluatedClaim: submission.claim ?? null
  };
}

export function assertCreativeGate(submission) {
  const result = evaluateCreativeGate(submission);
  if (!result.pass) throw new Error('animation_foundry_held:' + result.blockers.join(','));
  return result;
}
