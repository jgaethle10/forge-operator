const ROLE_CONFIG = {
  subject_coverage_judge: {
    metric: 'subject_coverage',
    weight: 0.20,
    hard_fail: true
  },
  composition_judge: {
    metric: 'composition',
    weight: 0.14,
    hard_fail: false
  },
  motion_judge: {
    metric: 'motion_quality',
    weight: 0.12,
    hard_fail: false
  },
  continuity_judge: {
    metric: 'continuity',
    weight: 0.14,
    hard_fail: true
  },
  truth_judge: {
    metric: null,
    weight: 0.14,
    hard_fail: true
  },
  brand_judge: {
    metric: 'brand_fidelity',
    weight: 0.10,
    hard_fail: false
  },
  beauty_judge: {
    metric: 'beauty',
    weight: 0.10,
    hard_fail: false
  },
  editability_judge: {
    metric: 'editability',
    weight: 0.06,
    hard_fail: true
  }
};

function candidateFrom(item) {
  return item?.raw?.candidate || item?.candidate || item?.raw || {};
}

function cleanScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

function verifiedObservations(candidate, metric) {
  return (candidate?.observations || []).filter(
    (item) =>
      item?.metric === metric &&
      item?.verifierState === 'verified' &&
      cleanScore(item?.score) !== null &&
      cleanScore(item?.threshold) !== null &&
      Array.isArray(item?.evidenceRefs) &&
      item.evidenceRefs.length > 0
  );
}

function observedMetric(candidate, metric) {
  const rows = verifiedObservations(candidate, metric);
  if (!rows.length) {
    return {
      state: 'missing',
      score: 0,
      threshold: null,
      evidence_refs: [],
      findings: ['verified_visual_observation_missing']
    };
  }

  const failed = rows.filter(
    (item) => cleanScore(item.score) < cleanScore(item.threshold)
  );
  const score = rows.reduce((sum, item) => sum + cleanScore(item.score), 0) / rows.length;
  const threshold =
    rows.reduce((sum, item) => sum + cleanScore(item.threshold), 0) / rows.length;

  return {
    state: failed.length ? 'fail' : 'pass',
    score,
    threshold,
    evidence_refs: [...new Set(rows.flatMap((item) => item.evidenceRefs || []))],
    findings: [...new Set(rows.flatMap((item) => item.findings || []))]
  };
}

function subjectCoverage(candidate) {
  const required = [...new Set(candidate?.subjectIds || [])];
  if (!required.length) return observedMetric(candidate, 'subject_coverage');

  const rows = verifiedObservations(candidate, 'subject_coverage');
  const bySubject = new Map();
  for (const row of rows) {
    if (!row.subjectId) continue;
    if (!bySubject.has(row.subjectId)) bySubject.set(row.subjectId, []);
    bySubject.get(row.subjectId).push(row);
  }

  const missing = required.filter((subjectId) => !bySubject.has(subjectId));
  if (missing.length) {
    return {
      state: 'missing',
      score: 0,
      threshold: null,
      evidence_refs: [],
      findings: missing.map((subjectId) => `subject_observation_missing:${subjectId}`)
    };
  }

  const representative = required.map((subjectId) => {
    const subjectRows = bySubject.get(subjectId);
    const passing = subjectRows.filter(
      (item) => cleanScore(item.score) >= cleanScore(item.threshold)
    );
    const best = [...subjectRows].sort(
      (a, b) => cleanScore(b.score) - cleanScore(a.score)
    )[0];
    return {
      subjectId,
      pass: passing.length > 0,
      score: cleanScore(best.score),
      threshold: cleanScore(best.threshold),
      evidenceRefs: best.evidenceRefs || [],
      findings: best.findings || []
    };
  });

  const failed = representative.filter((item) => !item.pass);
  return {
    state: failed.length ? 'fail' : 'pass',
    score:
      representative.reduce((sum, item) => sum + item.score, 0) /
      representative.length,
    threshold:
      representative.reduce((sum, item) => sum + item.threshold, 0) /
      representative.length,
    evidence_refs: [
      ...new Set(representative.flatMap((item) => item.evidenceRefs))
    ],
    findings: [
      ...failed.map((item) => `required_subject_failed:${item.subjectId}`),
      ...new Set(representative.flatMap((item) => item.findings))
    ]
  };
}

function truthCheck(candidate) {
  const findings = [];
  if (candidate?.provenance !== 'complete') {
    findings.push('provenance_incomplete');
  }

  const synthetic =
    candidate?.sourceState === 'generated_visualization' ||
    candidate?.sourceState === 'modeled_visualization';

  if (synthetic && candidate?.syntheticLabelPresent !== true) {
    findings.push('synthetic_visualization_label_missing');
  }

  if (
    ![
      'observed_source',
      'licensed_source',
      'product_capture',
      'generated_visualization',
      'modeled_visualization'
    ].includes(candidate?.sourceState)
  ) {
    findings.push('source_state_unknown');
  }

  return {
    state: findings.length ? 'fail' : 'pass',
    score: findings.length ? 0 : 1,
    threshold: 1,
    evidence_refs: candidate?.artifactDigest ? [candidate.artifactDigest] : [],
    findings
  };
}

function editabilityCheck(candidate) {
  const observed = observedMetric(candidate, 'editability');
  const findings = [...observed.findings];

  if (!candidate?.artifactDigest) findings.push('artifact_digest_missing');
  if (!candidate?.artifactPath) findings.push('artifact_path_missing');
  if (!['9:16', '16:9', '1:1'].includes(candidate?.aspectRatio)) {
    findings.push('unsupported_aspect_ratio');
  }
  if (
    candidate?.kind === 'video' &&
    (!Number.isFinite(Number(candidate.durationSec)) || Number(candidate.durationSec) <= 0)
  ) {
    findings.push('video_duration_missing');
  }

  if (findings.length > observed.findings.length) {
    return {
      ...observed,
      state: 'fail',
      score: 0,
      findings
    };
  }

  return observed;
}

function inspect(role, candidate) {
  if (role === 'truth_judge') return truthCheck(candidate);
  if (role === 'subject_coverage_judge') return subjectCoverage(candidate);
  if (role === 'editability_judge') return editabilityCheck(candidate);

  const config = ROLE_CONFIG[role];
  if (!config?.metric) {
    return {
      state: 'missing',
      score: 0,
      threshold: null,
      evidence_refs: [],
      findings: ['judge_role_unconfigured']
    };
  }
  return observedMetric(candidate, config.metric);
}

export async function runAssignment({ assignment }) {
  const role = assignment?.role;
  const candidate = candidateFrom(assignment?.item);
  const creativeGenomeDigest = assignment?.item?.raw?.creativeGenomeDigest || assignment?.item?.creativeGenomeDigest || null;
  const config = ROLE_CONFIG[role];

  if (!config) {
    return {
      schema: 'evercraft.fallen.shot-judge-receipt.v1',
      status: 'blocked',
      agent_id: assignment?.agent_id || null,
      role,
      candidate_id: candidate?.id || null,
      score: 0,
      weighted_score: 0,
      hard_fail: true,
      findings: ['unknown_judge_role'],
      evidence_refs: []
    };
  }

  const inspected = inspect(role, candidate);
  const hardFail =
    config.hard_fail && inspected.state !== 'pass';

  return {
    schema: 'evercraft.fallen.shot-judge-receipt.v1',
    status:
      inspected.state === 'pass'
        ? 'completed'
        : inspected.state === 'missing'
          ? 'blocked'
          : 'rejected',
    agent_id: assignment?.agent_id || null,
    role,
    candidate_id: candidate?.id || null,
    shot_id: candidate?.shotId || null,
    artifact_digest: candidate?.artifactDigest || null,
    creative_genome_digest: creativeGenomeDigest,
    score: inspected.score,
    threshold: inspected.threshold,
    weight: config.weight,
    weighted_score: inspected.score * config.weight,
    hard_fail: hardFail,
    findings: inspected.findings,
    evidence_refs: inspected.evidence_refs,
    boundaries: {
      verified_observation_required: role !== 'truth_judge',
      no_visual_score_invented_from_filename: true,
      no_provider_call_implied: true,
      no_publication_authority: true
    }
  };
}

function rankableCandidate(entries, requiredRoles) {
  const roleMap = new Map(entries.map((entry) => [entry.role, entry]));
  const missingRoles = requiredRoles.filter((role) => !roleMap.has(role));
  const blockedRoles = entries
    .filter((entry) => entry.status === 'blocked')
    .map((entry) => entry.role);
  const hardFails = entries
    .filter((entry) => entry.hard_fail === true)
    .map((entry) => entry.role);
  const rejectedRoles = entries
    .filter((entry) => entry.status === 'rejected')
    .map((entry) => entry.role);

  const totalWeight = entries.reduce(
    (sum, entry) => sum + Number(entry.weight || 0),
    0
  );
  const weighted = entries.reduce(
    (sum, entry) => sum + Number(entry.weighted_score || 0),
    0
  );
  const score = totalWeight > 0 ? weighted / totalWeight : 0;

  return {
    candidate_id: entries[0]?.candidate_id || 'unknown',
    status:
      missingRoles.length || blockedRoles.length || hardFails.length
        ? 'blocked'
        : 'rankable',
    score,
    missing_roles: missingRoles,
    blocked_roles: blockedRoles,
    hard_fail_roles: hardFails,
    rejected_roles: rejectedRoles,
    findings: [
      ...new Set(entries.flatMap((entry) => entry.findings || []))
    ],
    evidence_refs: [
      ...new Set(entries.flatMap((entry) => entry.evidence_refs || []))
    ],
    artifact_digests: [
      ...new Set(entries.map((entry) => entry.artifact_digest).filter(Boolean))
    ],
    creative_genome_digests: [
      ...new Set(entries.map((entry) => entry.creative_genome_digest).filter(Boolean))
    ]
  };
}

export async function reconcile({ results, plan }) {
  const rows = Array.isArray(results) ? results : [];
  const requiredRoles = Array.isArray(plan?.roles)
    ? plan.roles
    : Object.keys(ROLE_CONFIG);

  const grouped = new Map();
  for (const row of rows) {
    const key = row?.candidate_id || 'unknown';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  const candidates = [...grouped.values()].map((entries) =>
    rankableCandidate(entries, requiredRoles)
  );

  const rankable = candidates
    .filter((candidate) => candidate.status === 'rankable')
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.candidate_id.localeCompare(b.candidate_id)
    );

  for (const candidate of candidates) {
    if (candidate.artifact_digests.length !== 1) {
      candidate.status = 'blocked';
      candidate.findings.push('candidate_artifact_digest_disagreement');
    }
    if (candidate.creative_genome_digests.length !== 1) {
      candidate.status = 'blocked';
      candidate.findings.push('creative_genome_digest_disagreement');
    }
  }

  const reRankable = candidates
    .filter((candidate) => candidate.status === 'rankable')
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.candidate_id.localeCompare(b.candidate_id)
    );

  const winner = reRankable[0] || null;
  const blocked = candidates.filter((candidate) => candidate.status === 'blocked');

  return {
    schema: 'evercraft.fallen.shot-tournament-reconciliation.v1',
    status: winner ? 'reconciled' : 'blocked',
    winner_candidate_id: winner?.candidate_id || null,
    winner_score: winner?.score ?? null,
    candidate_count: candidates.length,
    rankable_candidate_count: reRankable.length,
    blocked_candidate_count: blocked.length,
    winner_artifact_digest: winner?.artifact_digests?.[0] || null,
    creative_genome_digest: winner?.creative_genome_digests?.[0] || null,
    ranking: reRankable,
    blocked,
    execution_boundary: {
      winner_is_selected_for_next_gate_only: true,
      publication_authority: false,
      final_production_admission_still_required: true
    }
  };
}
