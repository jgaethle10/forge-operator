import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sha256 = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const HEX = /^[a-f0-9]{64}$/i;

export const COMMERCIAL_RELEASE_SCHEMA = 'evercraft.fallen.client-commercial-release-input.v1';

function add(reasons, code, test) {
  if (!test) reasons.push(code);
}

function validateRights(input, assetIds, reasons) {
  const rows = Array.isArray(input?.rights) ? input.rights : [];
  const seen = new Set();
  const used = new Set(assetIds);
  for (const row of rows) {
    if (!nonempty(row?.assetId)) { reasons.push('rights_asset_id_missing'); continue; }
    if (seen.has(row.assetId)) reasons.push('rights_duplicate_asset:' + row.assetId);
    seen.add(row.assetId);
    if (!used.has(row.assetId)) reasons.push('rights_unused_asset:' + row.assetId);
    add(reasons, 'rights_not_verified:' + row.assetId, row.status === 'verified');
    add(reasons, 'rights_commercial_scope_missing:' + row.assetId,
      Array.isArray(row.permittedUses) && row.permittedUses.includes('commercial_video'));
    add(reasons, 'rights_evidence_missing:' + row.assetId, nonempty(row.evidenceRef));
    add(reasons, 'rights_reviewer_missing:' + row.assetId, nonempty(row.reviewedBy) && nonempty(row.reviewedAt));
  }
  for (const assetId of used) {
    if (!seen.has(assetId)) reasons.push('rights_missing_asset:' + assetId);
  }
}

function validateStory(input, expected, reasons) {
  const beats = Array.isArray(input?.storyboard?.beats) ? input.storyboard.beats : [];
  add(reasons, 'storyboard_insufficient_beats', beats.length >= 3);
  const ids = new Set();
  let duration = 0;
  for (const beat of beats) {
    if (!nonempty(beat?.id) || ids.has(beat.id)) reasons.push('storyboard_beat_id_missing_or_duplicate');
    else ids.add(beat.id);
    if (!finite(beat?.durationSec) || beat.durationSec <= 0) reasons.push('storyboard_beat_duration_invalid');
    else duration += beat.durationSec;
    add(reasons, 'storyboard_beat_purpose_missing', nonempty(beat?.purpose));
  }
  add(reasons, 'storyboard_missing_hook', beats.some(x => x?.role === 'hook'));
  add(reasons, 'storyboard_missing_cta', beats.some(x => x?.role === 'cta'));
  if (finite(expected)) add(reasons, 'storyboard_duration_mismatch', Math.abs(duration - expected) <= 0.15);
}

function validateCreative(input, reasons) {
  const creative = input?.creativeReview;
  add(reasons, 'creative_review_unsigned', nonempty(creative?.reviewedBy) && nonempty(creative?.reviewedAt));
  const checks = ['brandAccurate', 'subjectVisible', 'mobileReadable', 'motionAndContinuity',
    'factualClaimsVerified', 'musicAndVoiceBalanced', 'clearCallToAction'];
  if (input?.order?.includesNarration === true) checks.push('naturalVoiceAndPronunciation');
  for (const check of checks) {
    add(reasons, 'creative_review_failed:' + check, creative?.checks?.[check] === true);
  }
}

/**
 * Preflight for a scoped commissioned commercial, not a payment, send, or publication API.
 * All referenced QC receipts must describe one exact rendered master SHA-256.
 * An approved client package still requires deliberate delivery authority elsewhere.
 */
export function assessClientCommercialRelease(input) {
  if (input?.schema !== COMMERCIAL_RELEASE_SCHEMA) {
    throw new Error('commercial_release_input_schema_invalid');
  }
  const reasons = [];
  const order = input.order || {};
  const render = input.renderReceipt || {};
  const master = input.masterQc || {};
  const audio = input.audioQc || {};
  add(reasons, 'order_id_missing', nonempty(order.id));
  add(reasons, 'order_scope_not_confirmed', order.scopeConfirmed === true);
  add(reasons, 'order_format_invalid', ['9:16', '16:9', '1:1'].includes(order.aspectRatio));
  add(reasons, 'order_duration_invalid', finite(order.expectedDurationSec) && order.expectedDurationSec > 0);
  add(reasons, 'order_channels_missing', Array.isArray(order.channels) &&
    order.channels.length > 0 && order.channels.every(nonempty));

  add(reasons, 'render_receipt_schema_invalid', render.schema === 'evercraft.fallen.timeline-export-receipt.v1');
  add(reasons, 'master_qc_schema_invalid', master.schema === 'evercraft.fallen.master-qc-receipt.v1');
  add(reasons, 'audio_qc_schema_invalid', audio.schema === 'evercraft.fallen.commercial-audio-qc.v1');
  add(reasons, 'master_qc_not_accepted', master.status === 'accepted');
  add(reasons, 'audio_qc_not_accepted', audio.status === 'accepted');

  const digest = typeof render.sha256 === 'string' ? render.sha256.toLowerCase() : '';
  add(reasons, 'render_digest_invalid', HEX.test(digest));
  add(reasons, 'master_digest_mismatch', HEX.test(digest) && master.sha256 === digest);
  const audioMasterDigest = typeof audio.masterSha256 === 'string' ? audio.masterSha256.toLowerCase() :
    typeof audio.sha256 === 'string' ? audio.sha256.toLowerCase() : '';
  add(reasons, 'audio_receipt_digest_ambiguous',
    !(audio.masterSha256 && audio.sha256 && audio.masterSha256.toLowerCase() !== audio.sha256.toLowerCase()));
  add(reasons, 'audio_digest_mismatch', HEX.test(digest) && audioMasterDigest === digest);
  add(reasons, 'audio_measured_loudness_missing', finite(audio.measurements?.integratedLufs));
  add(reasons, 'audio_measured_true_peak_missing', finite(audio.measurements?.truePeakDbtp));
  add(reasons, 'audio_loudness_outside_commercial_standard',
    finite(audio.measurements?.integratedLufs) &&
    audio.measurements.integratedLufs >= -18 && audio.measurements.integratedLufs <= -14);
  add(reasons, 'audio_true_peak_above_commercial_ceiling',
    finite(audio.measurements?.truePeakDbtp) && audio.measurements.truePeakDbtp <= -1);
  if (input.clipManifest) {
    add(reasons, 'clip_manifest_schema_invalid', input.clipManifest.schema === 'evercraft.clip.media-intake.v1');
    add(reasons, 'clip_manifest_digest_mismatch', input.clipManifest.media?.sha256 === digest);
  }

  const width = Number(render.width), height = Number(render.height);
  const format = order.aspectRatio;
  const aspect = format === '9:16' ? 9 / 16 : format === '16:9' ? 16 / 9 : 1;
  add(reasons, 'render_resolution_invalid',
    Number.isInteger(width) && Number.isInteger(height) && Math.min(width, height) >= 1080);
  add(reasons, 'render_aspect_ratio_mismatch',
    finite(aspect) && height > 0 && Math.abs(width / height - aspect) < 0.012);
  add(reasons, 'render_fps_invalid', finite(render.fps) && render.fps >= 23.9 && render.fps <= 60.1);
  add(reasons, 'render_duration_mismatch',
    finite(render.durationSec) && finite(order.expectedDurationSec) &&
    Math.abs(render.durationSec - order.expectedDurationSec) <= 0.2);
  add(reasons, 'master_duration_mismatch',
    finite(master.measurements?.durationSec) && finite(render.durationSec) &&
    Math.abs(master.measurements.durationSec - render.durationSec) <= 0.2);
  add(reasons, 'master_dimensions_mismatch',
    master.measurements?.width === width && master.measurements?.height === height);
  add(reasons, 'audio_stream_count_invalid', audio.measurements?.streamCount === 1);
  add(reasons, 'render_video_codec_invalid', render.videoCodec === 'h264');
  add(reasons, 'render_audio_codec_invalid', render.audioCodec === 'aac');

  const assetIds = Array.isArray(render.inputAssetIds) ? render.inputAssetIds : [];
  add(reasons, 'render_source_assets_missing', assetIds.length > 0);
  add(reasons, 'render_source_assets_duplicate',
    assetIds.every(nonempty) && new Set(assetIds).size === assetIds.length);
  validateRights(input, assetIds, reasons);
  validateStory(input, order.expectedDurationSec, reasons);
  const production = input.productionGrade || {};
  add(reasons, 'production_grade_schema_invalid', production.schema === 'evercraft.fallen.production-grade-report.v1');
  add(reasons, 'production_grade_not_accepted', production.status === 'accepted');
  const reports = Array.isArray(production.beatReports) ? production.beatReports : [];
  const beatSet = new Set();
  for (const row of reports) {
    if (!nonempty(row?.beatId)) { reasons.push('production_grade_beat_id_missing'); continue; }
    if (beatSet.has(row.beatId)) reasons.push('production_grade_duplicate_beat:' + row.beatId);
    beatSet.add(row.beatId);
    if (row.status !== 'accepted') reasons.push('production_grade_beat_rejected:' + row.beatId);
  }
  for (const beat of input.storyboard?.beats || []) {
    if (nonempty(beat?.id) && !reports.some(row => row.beatId === beat.id && row.status === 'accepted')) {
      reasons.push('production_grade_beat_missing:' + beat.id);
    }
  }
  validateCreative(input, reasons);

  const approval = input.clientApproval || { status: 'pending' };
  add(reasons, 'client_approval_state_invalid', ['pending', 'approved', 'changes_requested'].includes(approval.status));
  if (approval.status === 'approved') {
    add(reasons, 'client_approval_evidence_missing', nonempty(approval.evidenceRef) &&
      nonempty(approval.approvedAt));
  }
  if (approval.status === 'changes_requested') reasons.push('client_changes_requested');

  const uniqueReasons = [...new Set(reasons)].sort();
  const status = uniqueReasons.length ? 'blocked' :
    approval.status === 'approved' ? 'reviewed_for_delivery' : 'ready_for_client_preview';

  const core = {
    schema: 'evercraft.fallen.client-commercial-release-report.v1',
    orderId: order.id || null,
    status,
    reasons: uniqueReasons,
    masterSha256: HEX.test(digest) ? digest : null,
    clientApproved: approval.status === 'approved',
    promotionalReuseAuthorized: input.promotionalReuse?.authorized === true &&
      nonempty(input.promotionalReuse?.evidenceRef),
    boundaries: {
      licenseEvidenceRequiresHumanVerification: true,
      humanCreativeReviewRequired: true,
      paymentAuthorityGranted: false,
      deliveryAuthorityGranted: false,
      publicationAuthorityGranted: false,
      promotionalReuseNotImpliedByDeliveryApproval: true,
    },
  };
  return { ...core, reportDigest: sha256(core) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath) {
    console.error('Usage: node commercial-release-preflight.mjs <input.json> [receipt.json]');
    process.exitCode = 1;
  } else {
    try {
      const source = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
      const result = assessClientCommercialRelease(source);
      if (outputPath) {
        fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
        fs.writeFileSync(path.resolve(outputPath), JSON.stringify(result, null, 2) + '\n', 'utf8');
      }
      console.log(JSON.stringify(result, null, 2));
      if (result.status === 'blocked') process.exitCode = 2;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
