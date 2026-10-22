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
      p.intents.some(i => i.buyer_handoff_state === 'held_payment_authority'))) {
    return {
      code: 'buyer_handoff_held_by_payment_authority',
      evidence: 'authoritative_connection_options_suppress_buyer_url',
      next_action: 'obtain_fresh_provider_payment_receipt_and_revalidate_buyer_options',
      limitation: 'catalog_sell_now_label_does_not_override_connection_options_hold'
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

// The buyer connection-options response is authoritative. Never resurrect a
// suppressed purchase link from the more permissive discovery/match catalog.
export function assessBuyerHandoff(match, options, expectedId, expectedUrl) {
  const match_ok = match?.public_id === expectedId;
  const held = options?.buyer_checkout_available === false ||
    Boolean(options?.checkout_suppression_reason) ||
    /^held(?:_|-)/.test(options?.human_buyer_options_state || '');
  const optionUrl = options?.human_offer_url;
  // Explicit authorization belongs to the connection-options service for this
  // exact product. A URL on its own, or a successful catalog match, is not proof.
  const correctOption = options?.ok === true && options?.public_id === expectedId;
  const authorized = correctOption && options?.buyer_checkout_available === true;
  const offer_link_ok = !held && match_ok && authorized &&
    typeof optionUrl === 'string' && optionUrl === expectedUrl;
  return {
    matched: match_ok ? expectedId : null,
    match_ok,
    human_offer_url: offer_link_ok ? expectedUrl : null,
    offer_link_ok,
    buyer_handoff_state: held ? 'held_payment_authority' :
      !authorized ? 'unverified_payment_authority' :
      offer_link_ok ? 'verified_connection_option' : 'missing_or_mismatched_connection_option'
  };
}


// Report independent readiness layers without treating discovery as payment proof.
// A held buyer route is a commercial gate, not a failed MCP handshake.
export function summarizeDiscoveryLayers(receipt, expectedIntentsPerProfile = 3) {
  const profiles = Array.isArray(receipt?.profiles) ? receipt.profiles : [];
  const surfaces = Array.isArray(receipt?.surfaces) ? receipt.surfaces : [];
  const mcp_readonly_ok = profiles.length > 0 &&
    profiles.every(p => p?.initialized === true && Array.isArray(p.errors) && p.errors.length === 0);
  const public_discovery_surfaces_ok = surfaces.length > 0 &&
    surfaces.every(s => s?.status === 200);
  const catalog_matches_ok = mcp_readonly_ok && profiles.every(p =>
    Array.isArray(p.intents) && p.intents.length === expectedIntentsPerProfile &&
    p.intents.every(i => i.match_ok === true));
  const routes = profiles.flatMap(p => Array.isArray(p?.intents) ? p.intents : []);
  const buyer_handoff_authorized = catalog_matches_ok && routes.length > 0 &&
    routes.every(i => i.offer_link_ok === true &&
      i.buyer_handoff_state === 'verified_connection_option');
  const buyer_handoff_held = routes.some(i => i.buyer_handoff_state === 'held_payment_authority');
  const discovery_ok = mcp_readonly_ok && public_discovery_surfaces_ok && catalog_matches_ok;
  const state = !discovery_ok ? 'discovery_probe_incomplete_or_failed' :
    buyer_handoff_held ? 'discovery_ok_buyer_handoff_held' :
    buyer_handoff_authorized ? 'discovery_ok_buyer_navigation_authorized' :
      'discovery_ok_buyer_navigation_unverified';
  return {
    mcp_readonly_ok,
    public_discovery_surfaces_ok,
    catalog_matches_ok,
    buyer_handoff_authorized: discovery_ok && buyer_handoff_authorized,
    buyer_handoff_held,
    state,
    paid_order_verified: false,
    provider_recommendation_verified: false,
    note: 'Read-only protocol checks cannot prove checkout, settlement or independent LLM recommendation.'
  };
}
