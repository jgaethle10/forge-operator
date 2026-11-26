import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FALLEN_SIGNATURE_SCHEMA = 'evercraft.fallen.signature-review.v1';
export const FALLEN_SIGNATURE_REPORT_SCHEMA = 'evercraft.fallen.signature-gate-report.v1';

// Human creative decisions. Automated frame activity and loudness measurements
// cannot establish whether a commercial is beautiful, credible or worth airing.
export const REQUIRED_CREATIVE_CHECKS = Object.freeze([
  'compellingOpening',
  'clearStoryAndAudience',
  'accurateBrandAndOffer',
  'authenticPurposefulVisuals',
  'variedShotsWithoutAccidentalRepetition',
  'intentionalMotionAndPacing',
  'legibleTextAndClearCta',
  'appropriateOriginalOrLicensedMusic',
  'cleanDeliberateAudioMix',
  'noPlaceholderMediaOrVisibleArtifacts',
  'professionalFinishedExperience',
]);
export const REQUIRED_PLAYBACK_CHECKS = Object.freeze([
  'phoneSpeaker',
  'headphones',
  'desktopScreen',
]);

const HEX = /^[0-9a-f]{64}$/i;
const text = value => typeof value === 'string' && value.trim().length > 0;
const validDate = value => text(value) && Number.isFinite(Date.parse(value));
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const add = (reasons, reason, condition) => { if (!condition) reasons.push(reason); };
const accepted = value => value?.passed === true && text(value?.evidenceRef);

/**
 * Final creative clearance layered *on top of* the current technical, rights,
 * production-grade and client preflight. This is intentionally fail-closed.
 *
 * A signed review is an accountable human attestation, not AI verification
 * of aesthetic quality, evidence-link validity or a grant to deliver/publish.
 */
export function assessFallenSignatureQuality({release, review, includesNarration} = {}) {
  const reasons = [];
  add(reasons, 'signature_upstream_release_missing',
    release?.schema === 'evercraft.fallen.client-commercial-release-report.v1');
  add(reasons, 'signature_upstream_not_accepted',
    release?.status === 'ready_for_client_preview' || release?.status === 'reviewed_for_delivery');
  add(reasons, 'signature_upstream_reasons_present',
    Array.isArray(release?.reasons) && release.reasons.length === 0);
  add(reasons, 'signature_upstream_digest_invalid', HEX.test(release?.masterSha256 || ''));
  add(reasons, 'signature_upstream_report_digest_invalid', HEX.test(release?.reportDigest || ''));

  add(reasons, 'signature_review_schema_invalid', review?.schema === FALLEN_SIGNATURE_SCHEMA);
  add(reasons, 'signature_review_master_mismatch',
    HEX.test(release?.masterSha256 || '') &&
    review?.masterSha256 === release.masterSha256);
  add(reasons, 'signature_review_upstream_changed',
    HEX.test(release?.reportDigest || '') &&
    review?.releaseReportDigest === release.reportDigest);
  add(reasons, 'signature_review_unsigned',
    text(review?.reviewedBy) && validDate(review?.reviewedAt) &&
    text(review?.signoffEvidenceRef));
  add(reasons, 'signature_final_decision_not_approved', review?.overallDecision === 'approved');
  add(reasons, 'signature_open_defects',
    Array.isArray(review?.unresolvedDefects) && review.unresolvedDefects.length === 0);

  for (const check of REQUIRED_CREATIVE_CHECKS) {
    add(reasons, 'signature_creative_failed:' + check, accepted(review?.checks?.[check]));
  }
  for (const device of REQUIRED_PLAYBACK_CHECKS) {
    add(reasons, 'signature_playback_failed:' + device, accepted(review?.playback?.[device]));
  }

  add(reasons, 'signature_narration_scope_unknown', typeof includesNarration === 'boolean');
  if (includesNarration === true) {
    add(reasons, 'signature_voice_audition_failed',
      accepted(review?.voiceAudition) &&
      review.voiceAudition.pronunciationVerified === true);
  } else if (includesNarration === false) {
    add(reasons, 'signature_no_narration_unconfirmed', review?.noNarrationConfirmed === true);
  }

  const uniqueReasons = [...new Set(reasons)].sort();
  const status = uniqueReasons.length ? 'blocked' :
    release.status === 'reviewed_for_delivery'
      ? 'signature_reviewed_for_delivery'
      : 'signature_ready_for_client_preview';
  const core = {
    schema: FALLEN_SIGNATURE_REPORT_SCHEMA,
    status,
    reasons: uniqueReasons,
    masterSha256: HEX.test(release?.masterSha256 || '') ? release.masterSha256 : null,
    upstreamReportDigest: HEX.test(release?.reportDigest || '') ? release.reportDigest : null,
    boundaries: {
      humanAttestationNotIndependentEvidenceVerification: true,
      creativeJudgmentCannotBeGuaranteedByCode: true,
      technicalAndRightsReleaseStillRequired: true,
      stationSpecificDeliverySpecsNotVerified: true,
      paymentAuthorityGranted: false,
      clientDeliveryAuthorityGranted: false,
      broadcastPlacementAuthorityGranted: false,
      publicationAuthorityGranted: false,
    },
  };
  return {...core, reportDigest: digest(core)};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , inputFile, outputFile] = process.argv;
  try {
    if (!inputFile) throw Error('Usage: node fallen-signature-gate.mjs <private-evidence.json> [private-report.json]');
    const input = JSON.parse(fs.readFileSync(path.resolve(inputFile), 'utf8'));
    const report = assessFallenSignatureQuality(input);
    if (outputFile) {
      fs.mkdirSync(path.dirname(path.resolve(outputFile)), {recursive:true});
      fs.writeFileSync(path.resolve(outputFile), JSON.stringify(report,null,2) + '\n', 'utf8');
    }
    console.log(JSON.stringify(report,null,2));
    if (report.status === 'blocked') process.exitCode = 2;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
