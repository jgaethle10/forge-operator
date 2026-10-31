// Scope-aware router mapping evidence. This reports only what a router
// responded to. It is NOT independent proof of WAN reachability or DNS health.
function matchesMapping(candidate, requested) {
  return candidate?.success === true &&
    candidate.requested?.external === requested.external &&
    candidate.requested?.internal === requested.internal &&
    candidate.requested?.proto === requested.proto;
}

export function evaluateRouterMappingEvidence(requestedMappings, attempts = []) {
  if (!Array.isArray(requestedMappings) || !Array.isArray(attempts)) {
    throw new TypeError('Mapping evidence requires requested mappings and attempts');
  }
  const successFor = (requested) => attempts.some(
    (attempt) => Array.isArray(attempt?.mappings) &&
      attempt.mappings.some((candidate) => matchesMapping(candidate, requested))
  );
  const required = requestedMappings.filter((mapping) => !mapping.diagnostic);
  const productionDns = requestedMappings.filter((mapping) => mapping.production === true);
  const diagnostics = requestedMappings.filter((mapping) => mapping.diagnostic === true);
  const evaluate = (group) => group.length ? group.every(successFor) : null;

  return {
    // null means "not included in this scope", never "passed".
    scope_mapping_control_ok: required.length > 0 && evaluate(required) === true,
    production_mapping_control_ok: evaluate(productionDns),
    diagnostic_mapping_control_ok: evaluate(diagnostics),
    mapping_evidence_state: 'router_report_only_not_external_reachability'
  };
}
