// Classify Saban cold-client probe receipts without conflating remote-network outages
// with MCP capability quality or provider recommendations.
// Expose only known transport cause codes, never underlying URLs, messages or identities.
// A code is an observation from this runner, not a diagnosis of the remote server.
const SAFE_CAUSE_CODES = new Set([
  'ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ECONNRESET','ETIMEDOUT',
  'EHOSTUNREACH','ENETUNREACH','UND_ERR_CONNECT_TIMEOUT',
  'ERR_TLS_CERT_ALTNAME_INVALID','CERT_HAS_EXPIRED',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE','DEPTH_ZERO_SELF_SIGNED_CERT',
  'ERR_SSL_WRONG_VERSION_NUMBER'
]);
export function safeNetworkFailure(error) {
  const rawCode = error?.cause?.code ?? error?.code;
  const cause_code = typeof rawCode === 'string' && SAFE_CAUSE_CODES.has(rawCode) ? rawCode : null;
  const type = error?.name === 'TimeoutError' || error?.name === 'AbortError'
    ? 'request_timeout'
    : error?.message === 'fetch failed' ? 'fetch_failed' : 'request_failed';
  return cause_code ? { error: type, cause_code } : { error: type };
}

// Never serialize arbitrary upstream RPC messages, URLs, stack traces or private hostnames.
export function safeProbeError(error) {
  const network = safeNetworkFailure(error);
  if(network.error !== 'request_failed') return network.error;
  if(error?.message === 'unreadable_rpc_response') return 'unreadable_rpc_response';
  const match = /^rpc_([1-5][0-9]{2})(?:_|$)/.exec(error?.message || '');
  return match ? 'rpc_' + match[1] : 'request_failed';
}

export function classifyDiscoveryReceipt(receipt) {
  if (receipt?.ok === true) {
    return { code: 'healthy', evidence: 'probe_passed', next_action: 'none' };
  }
  const profiles = Array.isArray(receipt?.profiles) ? receipt.profiles : [];
  const surfaces = Array.isArray(receipt?.surfaces) ? receipt.surfaces : [];
  const allSurfacesUnreachable = surfaces.length > 0 && surfaces.every(s => s.status === 0);
  const allClientsFailedBeforeInitialization = profiles.length > 0 && profiles.every(p => !p.initialized && Array.isArray(p.errors) && p.errors.length > 0 && p.errors.every(e => ['fetch_failed','fetch failed','request_timeout'].includes(e)));
  const observedCodes = [...new Set([
    ...surfaces.map(s => s.cause_code),
    ...profiles.flatMap(p => Array.isArray(p.error_causes) ? p.error_causes : [])
  ].filter(c => typeof c === 'string' && SAFE_CAUSE_CODES.has(c)))].sort();
  if (allSurfacesUnreachable && allClientsFailedBeforeInitialization) {
    return {
      code: 'external_origin_unreachable',
      evidence: 'all_public_surfaces_status_0_and_mcp_initialization_failed',
      observed_cause_codes: observedCodes,
      next_action: 'check_public_dns_tcp443_tls_origin_from_independent_network',
      limitation: 'runner_cannot_identify_network_root_cause_or_prove_production_state'
    };
  }
  if (profiles.some(p => Array.isArray(p.errors) && p.errors.length > 0) ||
      profiles.some(p => !p.initialized)) {
    return {
      code: 'mcp_protocol_or_transport_failure',
      evidence: 'one_or_more_mcp_clients_failed',
      next_action: 'inspect_mcp_init_response_status_transport_and_server_logs',
      limitation: 'not_evidence_of_provider_recommendation_failure'
    };
  }
  if (profiles.some(p => Array.isArray(p.intents) &&
      p.intents.some(i => !i.match_ok || !i.offer_link_ok))) {
    return {
      code: 'capability_match_or_offer_route_mismatch',
      evidence: 'mcp_responded_but_intent_or_offer_mismatch',
      next_action: 'inspect_exact_public_id_price_and_human_offer_url',
      limitation: 'does_not_measure_real_external_provider_recommendations'
    };
  }
  if (surfaces.some(s => s.status !== 200)) {
    return {
      code: 'public_discovery_surface_failure',
      evidence: 'one_or_more_public_discovery_surfaces_not_http_200',
      next_action: 'inspect_failing_paths_and_status_codes',
      limitation: 'not_evidence_of_failed_sale_or_customer_delivery'
    };
  }
  return {
    code: 'incomplete_or_unclassified_probe',
    evidence: 'probe_failed_without_one_known_failure_pattern',
    next_action: 'inspect_complete_receipt',
    limitation: 'no_commercial_outcome_inferred'
  };
}
