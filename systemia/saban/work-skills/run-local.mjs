import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { planWorkSaban } from './index.mjs';
import { runRegisteredAssignment } from '../registered-worker.mjs';
import { reconcile } from './commercial-adapter.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function runLocalCommercialBrief({ task, brief, rootDir = repoRoot, outDir = null } = {}) {
  const plan = planWorkSaban({ task, root: path.join(rootDir, 'systemia/saban/work-skills') });
  if (plan.status !== 'planned' || plan.skill.id !== 'commercial-brief') {
    throw new Error('work_saban_local_run_not_admitted_to_skill');
  }
  if (!brief || Array.isArray(brief) || typeof brief !== 'object' ||
      Buffer.byteLength(JSON.stringify(brief)) > 32000) {
    throw new Error('work_saban_local_brief_invalid_or_oversized');
  }
  // Only a registered deterministic local draft worker is called.
  // A plan or request never authorizes external effects.
  const receipts = [];
  for (const step of plan.team) {
    const assignment = {
      agent_id: 'work-saban-local-' + step.role,
      idempotency_key: 'sha256:' + sha([plan.task_sha256, plan.skill.sha256, brief, step.role]),
      role: step.role,
      work: { type: 'draft_commercial_brief', task_hash: plan.task_sha256 },
      item: { raw: { brief, prior_receipts: receipts } }
    };
    const receipt = await runRegisteredAssignment({
      software: 'work-saban-commercial-brief', assignment, rootDir,
      executionContext: { allowed_effects: ['local_draft'], network: false, publish: false }
    });
    if (receipt?.result?.local_draft_created !== true ||
        receipt?.result?.external_effects_performed !== false) {
      throw new Error('work_saban_local_receipt_failed:' + step.role);
    }
    receipts.push(receipt);
  }
  const reconciliation = await reconcile({ results: receipts,
    plan: { roles: plan.team.map(t => t.role) } });
  const artifacts = Object.fromEntries(receipts.map(r => [r.role, r.result.output]));
  const body = {
    schema: 'evercraft.work-saban.local-commercial-run-receipt.v1',
    state: reconciliation.status === 'reconciled_with_holds' ? 'drafts_produced_held' : 'blocked',
    plan_receipt_hash: plan.receipt_sha256,
    task_sha256: plan.task_sha256,
    skill: plan.skill,
    worker_receipts: receipts,
    reconciliation, artifacts, role_count: receipts.length,
    execution_scope: 'local_deterministic_registered_workers_only',
    agent_model_invoked: false, generated_video: false, generated_audio: false,
    external_effects_performed: false, publication_performed: false,
    customer_delivery_performed: false,
    next_gate: 'owner_review_and_approved_production_adapter'
  };
  const final = { ...body, receipt_sha256: sha(body) };
  if (outDir) {
    const target = path.resolve(outDir);
    fs.mkdirSync(target, { recursive: true, mode: 0o700 });
    const file = path.join(target, 'work-saban-local-receipt.json');
    const tmp = path.join(target, '.receipt-' + process.pid + '-' + randomBytes(6).toString('hex') + '.tmp');
    fs.writeFileSync(tmp, JSON.stringify(final, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    fs.renameSync(tmp, file);
  }
  return final;
}
