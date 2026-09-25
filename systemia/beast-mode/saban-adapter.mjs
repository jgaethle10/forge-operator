function clean(value) {
  return String(value ?? '').trim();
}

function artifactFrom(item) {
  return item?.raw?.artifact || item?.raw || {};
}

function inspect(role, item) {
  const artifact = artifactFrom(item);
  const findings = [];
  const sha = clean(artifact.sha256).toLowerCase();

  if (!/^[a-f0-9]{64}$/.test(sha)) findings.push('sha256_missing_or_invalid');
  if (!Number.isSafeInteger(Number(artifact.byte_count)) || Number(artifact.byte_count) < 0) {
    findings.push('byte_count_missing_or_invalid');
  }
  if (!clean(artifact.provenance?.source_asset_key)) findings.push('source_asset_key_missing');

  if (role === 'customer_boundary_guard') {
    const authority = item?.raw?.authority || {};
    const permissions = artifact.permissions || {};
    if (authority.scope === 'external_customer' && authority.customer_delivery_authorized !== true) {
      findings.push('external_delivery_authority_missing');
    }
    if (permissions.customer_visible === true && authority.scope !== 'external_customer') {
      findings.push('customer_visibility_outside_external_scope');
    }
  }

  return findings;
}

export async function runAssignment({ assignment }) {
  const findings = inspect(assignment.role, assignment.item);
  return {
    status: findings.length ? 'quarantine_candidate' : 'clear',
    agent_id: assignment.agent_id,
    role: assignment.role,
    work: assignment.work,
    cargo_id: assignment.item?.raw?.cargo_id || null,
    artifact_id: artifactFrom(assignment.item)?.artifact_id || null,
    findings,
    boundaries: {
      no_authority_escalation: true,
      no_payment_state_inference: true,
      no_customer_delivery_without_explicit_authority: true,
      no_source_mutation: true,
      hash_verification_required: true
    }
  };
}

export async function reconcile({ results }) {
  const rows = Array.isArray(results) ? results : [];
  const bad = rows.filter((row) => Array.isArray(row?.result?.findings) && row.result.findings.length);
  return {
    status: bad.length ? 'quarantine_required' : 'reconciled',
    result_count: rows.length,
    quarantine_candidate_count: bad.length,
    quarantine_candidates: bad.slice(0, 100).map((row) => ({
      agent_id: row?.assignment?.agent_id || row?.result?.agent_id || null,
      artifact_id: row?.result?.artifact_id || null,
      findings: row?.result?.findings || []
    }))
  };
}
