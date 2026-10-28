/**
 * Visual Lock v1: fail-closed provenance and production-mode guard.
 * Never claims to measure character beauty or identity visually.
 */
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, isAbsolute, relative } from 'node:path';

const DIGEST = /^[0-9a-f]{64}$/;
const MODES = new Set(['concept_art', 'story_animatic', 'character_animation']);
const TECHNIQUES = new Set(['generated_stills','drawn_stills','procedural_vector_2d','cutout_2d','rigged_2d','rigged_3d']);
const nonempty = v => typeof v === 'string' && v.trim().length > 0;

export function digestFile(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/** Evidence from actual file bytes, with workspace path and symlink escape guards. */
export function collectAssetEvidence(rootDir, assets) {
  const root = resolve(rootDir);
  const found = {};
  for (const [key, path] of Object.entries(assets || {})) {
    if (!nonempty(path) || isAbsolute(path)) continue;
    const full = resolve(root, path);
    const rel = relative(root, full);
    if (rel.startsWith('..') || isAbsolute(rel)) continue;
    try {
      const real = realpathSync(full);
      const r = relative(root, real);
      if (r.startsWith('..') || isAbsolute(r) || !statSync(real).isFile()) continue;
      found[key] = { path, sha256: digestFile(real), bytes: statSync(real).size };
    } catch { /* Missing evidence fails closed. */ }
  }
  return found;
}

/** Validates provenance, design/technique locks and availability of 3D evidence.
 * It DOES NOT determine whether the artwork is beautiful, correctly modeled,
 * emotionally compelling, or approved for release.
 */
export function evaluateVisualLock(spec, submission, measured = {}) {
  const blockers = [];
  const add = x => { if (!blockers.includes(x)) blockers.push(x); };
  if (!spec || spec.schema !== 'evercraft.animation.visual-lock.v1') add('invalid_visual_lock_spec');
  if (!submission || typeof submission !== 'object')
    return {status:'BLOCKED',blockers:['submission_missing']};
  if (!nonempty(spec?.productionId) || submission.productionId !== spec?.productionId)
    add('production_id_mismatch');
  if (!DIGEST.test(spec?.reference?.sha256 || '') ||
      measured?.reference?.sha256 !== spec?.reference?.sha256)
    add('reference_asset_not_verified');
  if (!MODES.has(submission.stage)) add('invalid_stage');
  if (!TECHNIQUES.has(submission.technique)) add('invalid_technique');
  if (submission.stage !== spec?.target?.stage) add('stage_downgrade');
  if (submission.technique !== spec?.target?.technique) add('render_technique_downgrade');
  if (submission.visualStyle !== spec?.target?.visualStyle) add('visual_style_mismatch');
  if (submission.stage === 'character_animation' &&
      ['generated_stills','drawn_stills'].includes(submission.technique))
    add('stills_cannot_prove_character_animation');

  for (const trait of ['hair','skin','eyes','freckles']) {
    if (submission.character?.[trait] !== spec?.character?.[trait])
      add('character_trait_drift:' + trait);
  }

  if (spec?.target?.technique === 'rigged_3d') {
    if (!measured.model?.sha256 || !measured.render?.sha256)
      add('3d_model_or_render_asset_missing');
    if (!measured.rig_proof?.sha256 || !measured.rig_proof?.bytes)
      add('rig_proof_file_missing');
    const proof = submission.rigProof;
    if (!proof || proof.schema !== 'evercraft.animation.blender-rig-audit.v1' ||
        proof.status !== 'passed' || proof.modelSha256 !== measured.model?.sha256 ||
        proof.armatureCount < 1 || proof.deformBoneCount < 18 ||
        proof.meshCount < 1 || proof.facialShapeKeys < 3 || proof.cameraCount < 1)
      add('verified_blender_rig_proof_missing');
  }

  if (!nonempty(submission.humanReview?.reviewer) ||
      !nonempty(submission.humanReview?.evidence) ||
      submission.humanReview?.verdict !== 'approved')
    add('human_visual_approval_missing');

  return {status: blockers.length ? 'BLOCKED' : 'ELIGIBLE_FOR_NEXT_GATE', blockers,
    note:'Automated results verify claims/asset integrity, never aesthetics or release approval.'};
}

export function explainVisualLock(result) {
  return `${result.status}: ${result.blockers.join(', ') || 'no visual-lock blockers'}\n${result.note || ''}`;
}
