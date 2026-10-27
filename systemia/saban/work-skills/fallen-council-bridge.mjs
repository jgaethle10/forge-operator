import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runLocalCommercialBrief } from './run-local.mjs';
import { runRegisteredAssignment } from '../registered-worker.mjs';
import { reconcile as reconcileCouncil } from '../../media-studio/creative-council-saban-adapter.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const COUNCIL_ROLES = Object.freeze([
  'story_architect', 'cinematography_director', 'visual_evidence_scout',
  'data_graphics_director', 'world_builder', 'edit_rhythm_director',
  'sound_director', 'mixing_engineer', 'sound_design_engineer',
  'music_composer', 'voice_performance_director', 'brand_art_director',
  'documentary_truth_guard', 'beauty_judge'
]);
const beats = Object.freeze(['opening', 'service', 'trust', 'close']);
const councilBeats = Object.freeze(['hook', 'body', 'proof', 'cta']);
const fractions = Object.freeze([0.2, 0.45, 0.2, 0.15]);

export async function runLocalCreativeCouncilPreview({ task, brief, rootDir = ROOT, outDir = null } = {}) {
  const local = await runLocalCommercialBrief({ task, brief, rootDir });
  if (local.state !== 'drafts_produced_held' ||
      local.worker_receipts.length !== 4 ||
      local.worker_receipts.some(r => r.result?.local_draft_created !== true ||
                                     r.result?.external_effects_performed !== false)) {
    throw new Error('work_saban_council_local_draft_not_verified');
  }
  const story = local.artifacts?.creative?.storyboard;
  if (!Array.isArray(story) || story.length !== 4 ||
      story.some((beat, i) => beat?.beat !== beats[i])) {
    throw new Error('work_saban_council_storyboard_not_supported');
  }
  const duration = Number(local.artifacts.creative.duration_seconds);
  if (!Number.isFinite(duration) || duration < 5 || duration > 180) {
    throw new Error('work_saban_council_duration_invalid');
  }
  const allReceipts = [];
  const shots = [];
  for (let i = 0; i < 4; i++) {
    const beat = story[i];
    const shotId = 'work-saban-shot-' + (i + 1);
    const subjectId = 'unverified-commercial-subject-' + (i + 1);
    const shot = {
      id: shotId,
      sourceType: 'scene',
      sourceId: shotId,
      beat: councilBeats[i],
      durationSec: Number((duration * fractions[i]).toFixed(3)),
      aspectRatio: '9:16',
      storyPrompt: String(task).slice(0, 6000),
      intent: String(beat.narration || '').slice(0, 400),
      subjectIds: [subjectId],
      // No supplied source is assumed to depict the suggested visual.
      coverage: [{
        subjectId, subjectLabel: String(brief?.business_name || 'Business').slice(0, 120),
        status: 'missing', preferredTreatment: 'documentary_or_verified_visualization'
      }]
    };
    shots.push(shot);
    for (const role of COUNCIL_ROLES) {
      const receipt = await runRegisteredAssignment({
        software: 'fallen-creative-council',
        assignment: {
          agent_id: 'work-saban-fallen-' + i + '-' + role,
          idempotency_key: 'sha256:' + sha([local.task_sha256, local.skill.sha256, shotId, role]),
          role,
          work: { type: 'commercial_creative_direction_only', task_hash: local.task_sha256 },
          item: { raw: { shot } }
        },
        rootDir,
        executionContext: { network: false, generation: false, external_effects: false }
      });
      if (receipt?.schema !== 'evercraft.saban.registered-worker-receipt.v1' ||
          receipt?.result?.schema !== 'evercraft.fallen.creative-council-note.v1' ||
          receipt?.result?.shot_id !== shotId || receipt?.result?.role !== role ||
          receipt?.result?.boundaries?.no_provider_call_implied !== true ||
          receipt?.result?.boundaries?.no_generated_asset_implied !== true ||
          receipt?.result?.boundaries?.no_publication_authority !== true) {
        throw new Error('work_saban_council_worker_receipt_invalid:' + shotId + ':' + role);
      }
      allReceipts.push(receipt);
    }
  }
  const council = await reconcileCouncil({
    results: allReceipts.map(r => r.result),
    plan: { roles: [...COUNCIL_ROLES] }
  });
  if (council.shot_count !== 4 || council.blueprints.length !== 4 ||
      allReceipts.length !== 56 ||
      council.execution_boundary?.provider_calls_performed !== 0 ||
      council.execution_boundary?.assets_generated !== 0) {
    throw new Error('work_saban_council_reconciliation_invalid');
  }
  // Council may reconcile its creative notes while missing licensed visual coverage.
  // The Workroom MUST display "held" regardless of its provider-routing recommendation.
  const body = {
    schema: 'evercraft.work-saban.fallen-council-preview.v1',
    state: 'creative_direction_generated_source_held',
    task_sha256: local.task_sha256,
    local_work: local,
    shot_count: shots.length,
    council_role_count: COUNCIL_ROLES.length,
    registered_council_invocations: allReceipts.length,
    shots,
    council_worker_receipts: allReceipts,
    council_reconciliation: council,
    source_coverage_verified: false,
    generated_media: false,
    model_agent_invoked: false,
    provider_calls_performed: 0,
    external_effects_performed: false,
    publication_performed: false,
    customer_delivery_performed: false,
    next_gate: 'independent_source_and_rights_verification_then_authorized_provider_admission'
  };
  const final = { ...body, receipt_sha256: sha(body) };
  if (outDir) {
    fs.mkdirSync(path.resolve(outDir), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(path.resolve(outDir), 'work-saban-fallen-council-receipt.json'),
      JSON.stringify(final, null, 2) + '\n', { mode: 0o600 });
  }
  return final;
}
