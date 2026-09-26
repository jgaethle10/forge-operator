function reason(code, detail = null) {
  return detail ? { code, detail } : { code };
}

export function evaluateForensiScopePublicCutover({
  deployment,
  canary
} = {}) {
  const blockers = [];
  const receipt = deployment?.receipt || {};
  const result = deployment?.result || {};
  const route = deployment?.public_route || {};

  if (deployment?.state !== 'ready') {
    blockers.push(reason('deployment_not_ready', deployment?.state || null));
  }
  if (receipt.workload_class !== 'systemia.forensiscope-evidence-query.v1') {
    blockers.push(reason('wrong_workload_class', receipt.workload_class || null));
  }
  if (receipt.runtime_fabric !== 'Evercraft Compute') {
    blockers.push(reason('wrong_runtime_fabric', receipt.runtime_fabric || null));
  }
  if (receipt.health_verification !== 'healthy') {
    blockers.push(reason('local_health_not_verified', receipt.health_verification || null));
  }

  if (result.raw_media_intake !== false) {
    blockers.push(reason('raw_media_boundary_not_closed'));
  }
  if (result.starts_analysis_jobs !== false) {
    blockers.push(reason('analysis_admission_boundary_not_closed'));
  }
  if (result.checkout_or_payment !== false) {
    blockers.push(reason('commerce_boundary_not_closed'));
  }
  if (result.scoped_evidence_access_required !== true) {
    blockers.push(reason('scoped_access_not_required'));
  }

  if (route.verified !== true || route.scope !== 'public_https') {
    blockers.push(reason('public_https_route_not_verified', route.scope || null));
  }
  if (route.service !== 'forensiscope-evidence-query') {
    blockers.push(reason('public_route_service_mismatch', route.service || null));
  }
  if (route.deployment_receipt_hash !== receipt.receipt_hash) {
    blockers.push(reason('public_route_receipt_not_bound'));
  }
  if (route.instance_id !== result.instance_id) {
    blockers.push(reason('public_route_instance_mismatch'));
  }

  if (canary?.schema !== 'evercraft.forensiscope.public-mcp-canary.v1') {
    blockers.push(reason('mcp_canary_missing'));
  } else {
    if (canary.origin !== route.origin) {
      blockers.push(reason('mcp_canary_origin_mismatch'));
    }
    if (canary.deployment_receipt_hash !== receipt.receipt_hash) {
      blockers.push(reason('mcp_canary_deployment_mismatch'));
    }
    if (canary.initialize_or_discover_ok !== true) {
      blockers.push(reason('mcp_handshake_canary_failed'));
    }
    if (canary.tools_list_ok !== true) {
      blockers.push(reason('mcp_tools_list_canary_failed'));
    }
    if (canary.scoped_access_enforced !== true) {
      blockers.push(reason('mcp_scoped_access_canary_failed'));
    }
    if (canary.raw_media_tools_exposed === true) {
      blockers.push(reason('raw_media_tool_exposed'));
    }
    if (canary.checkout_tools_exposed === true) {
      blockers.push(reason('checkout_tool_exposed'));
    }
  }

  return {
    schema: 'evercraft.forensiscope.public-cutover-gate.v1',
    eligible: blockers.length === 0,
    blockers,
    required_public_state: {
      workload_class: 'systemia.forensiscope-evidence-query.v1',
      runtime_fabric: 'Evercraft Compute',
      public_route_scope: 'public_https',
      scoped_evidence_access_required: true,
      raw_media_intake: false,
      analysis_admission: false,
      checkout_or_payment: false,
      live_mcp_canary_required: true
    },
    migration_action: blockers.length === 0
      ? 'public_mcp_origin_may_be_updated_with_receipt'
      : 'keep_existing_public_mcp_origin'
  };
}
