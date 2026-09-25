function ratio(numerator, denominator) {
  if (!denominator) return 1;
  return numerator / denominator;
}

function countByRole(results = []) {
  const counts = {};
  for (const result of results) {
    const role = String(result?.role || 'unknown');
    counts[role] = (counts[role] || 0) + 1;
  }
  return counts;
}

export function evaluateSwarmQuality({
  contract,
  plan,
  results = [],
  schedulerSummary = {},
  reconciliation = null
}) {
  const quality = contract?.quality || {};
  const completed = Number(schedulerSummary?.counts?.completed || 0);
  const deadLetter = Number(schedulerSummary?.counts?.dead_letter || 0);
  const total = Number(schedulerSummary?.total || plan?.logical_agents || 0);
  const completionRatio = ratio(completed, total);
  const roleCounts = countByRole(results);
  const missingRoles = (plan?.roles || []).filter((role) => !roleCounts[role]);
  const failures = [];

  const minimumCompletionRatio = Number(
    quality.minimum_completion_ratio ?? 1
  );
  if (completionRatio < minimumCompletionRatio) {
    failures.push({
      code: 'completion_ratio_below_contract',
      observed: completionRatio,
      required: minimumCompletionRatio
    });
  }

  if (quality.dead_letter_allowed === false && deadLetter > 0) {
    failures.push({
      code: 'dead_letter_not_allowed',
      observed: deadLetter
    });
  }

  if (quality.require_all_roles !== false && missingRoles.length) {
    failures.push({
      code: 'required_roles_missing',
      roles: missingRoles
    });
  }

  if (quality.require_reconciliation === true) {
    if (!reconciliation) {
      failures.push({
        code: 'reconciliation_required'
      });
    } else if (!['reconciled', 'pass', 'completed'].includes(String(reconciliation.status))) {
      failures.push({
        code: 'reconciliation_failed',
        observed: reconciliation.status || null
      });
    }
  }

  if (
    quality.require_source_integrity === true &&
    reconciliation?.source_integrity_preserved !== true
  ) {
    failures.push({
      code: 'source_integrity_not_verified'
    });
  }

  return {
    schema: 'evercraft.saban.quality-receipt.v1',
    status: failures.length ? 'fail' : 'pass',
    completion_ratio: completionRatio,
    completed,
    total,
    dead_letter: deadLetter,
    role_counts: roleCounts,
    missing_roles: missingRoles,
    failures,
    enforcement: quality.enforcement || 'receipt_only'
  };
}
