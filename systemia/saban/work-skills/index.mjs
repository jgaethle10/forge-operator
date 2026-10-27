import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SHA256 = text => createHash('sha256').update(text).digest('hex');
const DENIED = Object.freeze([
  'arbitrary_code_execution', 'remote_execution', 'external_message',
  'publication', 'deployment', 'customer_delivery', 'payment', 'purchase',
  'credential_use', 'private_account_access', 'video_rendering'
]);

export function loadSkills({ root = ROOT } = {}) {
  const location = path.resolve(root);
  const registry = JSON.parse(fs.readFileSync(path.join(location, 'registry.json'), 'utf8'));
  if (registry?.schema !== 'evercraft.work-saban.skills-registry.v1' ||
      !Array.isArray(registry.skills) || registry.skills.length === 0) {
    throw new Error('work_saban_registry_invalid');
  }
  const ids = new Set();
  return registry.skills.map(entry => {
    if (!/^[a-z][a-z0-9-]*$/.test(entry?.id || '') || ids.has(entry.id)) {
      throw new Error('work_saban_skill_id_invalid_or_duplicate');
    }
    ids.add(entry.id);
    // A registry entry is a pinned, local instruction file, never a URL or executable.
    if (!/^skills\/[a-z0-9-]+\/SKILL\.md$/.test(entry.path || '')) {
      throw new Error('work_saban_skill_path_rejected');
    }
    const locationOfSkill = path.join(location, entry.path);
    if (!fs.realpathSync(locationOfSkill).startsWith(fs.realpathSync(location) + path.sep)) {
      throw new Error('work_saban_skill_outside_registry');
    }
    const instruction = fs.readFileSync(locationOfSkill, 'utf8');
    if (SHA256(instruction) !== entry.sha256) {
      throw new Error('work_saban_skill_hash_mismatch');
    }
    if (entry.execution_mode !== 'plan_only' || !Array.isArray(entry.roles) ||
        !Array.isArray(entry.review_criteria) || !Array.isArray(entry.approval_gates) ||
        !Array.isArray(entry.match?.all_any) || !entry.match.all_any.length) {
      throw new Error('work_saban_skill_contract_invalid');
    }
    if (entry.roles.some(role => !/^[a-z][a-z0-9_-]*$/.test(role))) {
      throw new Error('work_saban_skill_roles_invalid');
    }
    return { ...entry, instruction };
  });
}

function normalizeTask(task) {
  if (typeof task !== 'string' || !task.trim() || task.length > 6000) {
    throw new Error('work_saban_task_invalid');
  }
  return task.trim().replace(/\s+/g, ' ');
}

export function planWorkSaban({ task, skillId = null, root = ROOT } = {}) {
  const objective = normalizeTask(task);
  const skills = loadSkills({ root });
  const matches = skills.filter(skill => skill.match.all_any.some(term =>
    new RegExp('(?:^|[^\\p{L}\\p{N}])' + term.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&') + '(?:$|[^\\p{L}\\p{N}])', 'iu').test(objective)
  ));
  const skill = skillId ? matches.find(item => item.id === skillId) : matches.length === 1 ? matches[0] : null;
  const basis = {
    schema: 'evercraft.work-saban.skill-plan-receipt.v1',
    task_sha256: SHA256(objective),
    selection: skill?.id || null,
    status: skill ? 'planned' : 'blocked',
    execution_performed: false,
    publishing_performed: false,
    authorized_remote_compute: false,
    external_effects_performed: false,
    next_gate: skill ? 'systemia_admission_and_owner_approval_before_execution' : 'clarify_or_select_approved_skill',
    denied_capabilities: DENIED,
  };
  if (!skill) return {
    ...basis,
    reason: skillId && !skills.some(s => s.id === skillId) ? 'unknown_skill' :
      matches.length > 1 ? 'ambiguous_skill' : 'no_matching_approved_skill',
    available_skills: skills.map(s => ({ id: s.id, version: s.version }))
  };
  return {
    ...basis,
    skill: { id: skill.id, version: skill.version, sha256: skill.sha256,
      registry_schema: 'evercraft.work-saban.skills-registry.v1' },
    team: skill.roles.map((role, i) => ({
      role, sequence: i + 1,
      state: 'not_dispatched',
      depends_on: i ? [skill.roles[i - 1]] : [],
    })),
    proposed_outputs: ['intake_and_verified_facts_queue', 'narrated_storyboard_outline',
      'shot_and_audio_plan', 'asset_rights_ledger_requirements', 'qa_and_owner_approval_packet'],
    review_criteria: skill.review_criteria,
    approval_gates: skill.approval_gates,
    allowed_capabilities: skill.allowed_capabilities,
    unresolved_inputs: ['business_name', 'verified_services_and_claims', 'audience',
      'call_to_action', 'approved_asset_ledger', 'preferred_platforms'],
    receipt_sha256: SHA256(JSON.stringify({ task: objective, skill: skill.sha256,
      roles: skill.roles, gates: skill.approval_gates }))
  };
}
