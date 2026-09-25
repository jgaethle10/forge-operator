const KINDS = new Set(['image', 'video', 'speech', 'music', 'sfx', 'lip_sync']);

function needFrom(item) {
  return item?.raw?.need || item?.raw || {};
}

function hasRequirement(need, requirement) {
  return Array.isArray(need?.requires) && need.requires.includes(requirement);
}

function inspect(role, need) {
  const findings = [];

  if (!need?.id) findings.push('need_id_missing');
  if (!KINDS.has(need?.kind)) findings.push('unsupported_creative_task_kind');
  if (!need?.continuityDigest) findings.push('continuity_digest_missing');
  if (!Array.isArray(need?.requires) || !need.requires.length) {
    findings.push('requirements_missing');
  }

  if (role === 'continuity_guard') {
    if (
      hasRequirement(need, 'reference_identity') &&
      (!Array.isArray(need.continuityEntityIds) || !need.continuityEntityIds.length)
    ) {
      findings.push('reference_identity_subjects_missing');
    }
  }

  if (role === 'identity_guard') {
    if (
      ['image', 'video', 'lip_sync'].includes(need.kind) &&
      !hasRequirement(need, 'reference_identity')
    ) {
      findings.push('visual_identity_requirement_missing');
    }
  }

  if (role === 'voice_guard' && need.kind === 'speech') {
    if (!need.voiceProfileId) findings.push('voice_profile_id_missing');
    if (!hasRequirement(need, 'voice_profile')) {
      findings.push('voice_profile_requirement_missing');
    }
  }

  if (role === 'rights_guard' && !hasRequirement(need, 'commercial_rights')) {
    findings.push('commercial_rights_requirement_missing');
  }

  if (role === 'provenance_guard' && !hasRequirement(need, 'provenance_receipt')) {
    findings.push('provenance_receipt_requirement_missing');
  }

  if (role === 'timing_guard') {
    if (!hasRequirement(need, 'timing_control')) {
      findings.push('timing_control_requirement_missing');
    }
    if (
      ['video', 'lip_sync'].includes(need.kind) &&
      (!Number.isFinite(Number(need.durationSec)) || Number(need.durationSec) <= 0)
    ) {
      findings.push('visual_duration_missing_or_invalid');
    }
  }

  return findings;
}

export async function runAssignment({ assignment }) {
  const need = needFrom(assignment.item);
  const findings = inspect(assignment.role, need);

  return {
    schema: 'evercraft.fallen.saban-production-check.v1',
    status: findings.length ? 'blocked' : 'completed',
    agent_id: assignment.agent_id,
    role: assignment.role,
    need_id: need.id || null,
    kind: need.kind || null,
    continuity_digest: need.continuityDigest || null,
    findings,
    boundaries: {
      planning_check_only: true,
      no_provider_call_implied: true,
      no_generated_asset_implied: true,
      no_publication_authority: true,
      no_payment_authority: true,
      continuity_digest_must_survive_execution: true
    }
  };
}

export async function reconcile({ results, plan }) {
  const rows = Array.isArray(results) ? results : [];
  const requiredRoles = new Set(plan?.roles || []);
  const grouped = new Map();

  for (const row of rows) {
    const key = row?.need_id || 'unknown';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  const needs = [];
  for (const [needId, entries] of grouped.entries()) {
    const roles = new Set(entries.map((entry) => entry?.role).filter(Boolean));
    const missingRoles = [...requiredRoles].filter((role) => !roles.has(role));
    const findings = entries.flatMap((entry) => entry?.findings || []);
    const digests = new Set(
      entries.map((entry) => entry?.continuity_digest).filter(Boolean)
    );

    needs.push({
      need_id: needId,
      status:
        missingRoles.length || findings.length || digests.size !== 1
          ? 'blocked'
          : 'ready_for_provider_routing',
      missing_roles: missingRoles,
      findings,
      continuity_digest_count: digests.size
    });
  }

  const blocked = needs.filter((need) => need.status === 'blocked');

  return {
    schema: 'evercraft.fallen.saban-production-reconciliation.v1',
    status: blocked.length ? 'blocked' : 'reconciled',
    production_need_count: needs.length,
    blocked_need_count: blocked.length,
    needs,
    execution_boundary: {
      provider_calls_performed: 0,
      generated_assets_claimed: 0,
      next_gate: 'verified_department_execution_then_fallen_production_admission'
    }
  };
}
