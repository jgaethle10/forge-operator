import { reconcileShadowSalesDelegation } from './shadow-delegated-sales-reconciliation.mjs';

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
  reconciliation = null,
  shadowSalesEvidence = null
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

  if (
    quality.require_transcription === true &&
    reconciliation?.transcription?.state !== 'transcribed'
  ) {
    failures.push({
      code: 'transcription_required',
      observed: reconciliation?.transcription?.state || null,
      segment_count: Number(reconciliation?.transcription?.segment_count || 0)
    });
  }

  // Opt-in only. A worker-provided verdict, narrative, or copied hash cannot
  // grant independent success. The coordinator reopens the declared artifacts
  // and reruns deterministic sales arithmetic against the authorized CSV.
  // This is a local shadow evidence check, NOT signed worker identity.
  const requiresShadowSalesEvidence = quality.require_shadow_sales_evidence === true;
  let shadowSalesEvidenceReceipt = null;
  if (requiresShadowSalesEvidence) {
    const evidence = reconcileShadowSalesDelegation(shadowSalesEvidence || {});
    shadowSalesEvidenceReceipt = {
      schema: evidence.schema,
      status: evidence.status,
      reason: evidence.reason,
      mission_id: evidence.mission_id,
      source_sha256: evidence.source_sha256,
      verified_artifacts: evidence.verified_artifacts,
      deterministic_sales_check_passed: evidence.deterministic_sales_check_passed,
      independent_worker_identity_verified: false,
      live_systemia_admission_verified: false,
      runtime_dispatched: false
    };
    if (evidence.status !== 'shadow_artifacts_reconciled' ||
        evidence.verified_artifacts !== 2 ||
        evidence.deterministic_sales_check_passed !== true) {
      failures.push({
        code: 'shadow_sales_evidence_required',
        observed: evidence.status,
        reason: evidence.reason
      });
    }
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
    // An explicitly opted-in proof requirement cannot silently downgrade to
    // receipt-only on failure. Existing contracts remain unchanged.
    enforcement: requiresShadowSalesEvidence ? 'fail_execution' : (quality.enforcement || 'receipt_only'),
    ...(requiresShadowSalesEvidence ? { shadow_sales_evidence: shadowSalesEvidenceReceipt } : {})
  };
}
