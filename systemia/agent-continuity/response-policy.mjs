// Defense plan only. This module cannot connect to agents, networks, or provider APIs.
const CONFIRMED = new Set(['OBSERVED', 'CORROBORATED']);
const KINDS = new Set([
  'unexpected_retry_growth', 'invalid_spawn_lease',
  'capability_scope_violation', 'unauthorized_successor', 'unexpected_network_flow',
]);
function bad(message) { throw new Error(message); }
const isNonEmpty = x => typeof x === 'string' && x.trim().length > 0;

export function planAuthorizedContainment(incident) {
  if (incident?.schema !== 'evercraft.defense.synthetic-drill.v1' || incident?.synthetic !== true)
    bad('Only synthetic defensive drills are accepted');
  for (const key of ['incident_id', 'mission_id', 'agent_id'])
    if (!isNonEmpty(incident[key])) bad('Missing ' + key);
  if (!Array.isArray(incident.signals) || incident.signals.length > 64)
    bad('Invalid signals list');
  const signals = incident.signals.map((s, i) => {
    if (!isNonEmpty(s?.source_ref) || !isNonEmpty(s?.source_family) ||
        !KINDS.has(s?.kind) || !['OBSERVED','CORROBORATED','INFERRED','REPORTED','UNKNOWN'].includes(s?.truth_state))
      bad('Invalid signal at index ' + i);
    return s;
  });
  const sourceFamilies = new Set(signals.filter(s=>CONFIRMED.has(s.truth_state)).map(s=>s.source_family));
  const verifiedKinds = new Set(signals.filter(s=>CONFIRMED.has(s.truth_state)).map(s=>s.kind));
  const scope = incident.scope;
  const owned = scope?.owner === 'Evercraft' && scope?.operator_authorized === true && isNonEmpty(scope?.resource_id);
  // Source claims are not the same as authenticated source connections. This is a synthetic drill.
  const concerning = sourceFamilies.size >= 2 &&
    (verifiedKinds.has('invalid_spawn_lease') || verifiedKinds.has('capability_scope_violation') || verifiedKinds.has('unauthorized_successor'));
  const phase = !owned ? 'OUT_OF_SCOPE' : concerning ? 'SUSPECTED_BOUNDARY_CROSSING' : 'WATCH_AND_CORROBORATE';
  const network = incident.network || {};
  const partitioned = network.partitioned === true;
  const priorities = !owned
    ? ['Preserve supplied evidence; notify the responsible owner through an authorized channel.']
    : concerning
      ? ['Request independent control-plane freeze of new spawn grants (proposal only).',
         'Request scoped quarantine of the affected agent identity and credentials (proposal only).',
         'Preserve evidence before modifying workloads; inventory retry queues, callbacks and successors.',
         'Compare provider-authenticated side effects before any replay or retry.']
      : ['Collect independent source evidence before proposing containment.',
         'Preserve current incident records and validate alert-source authenticity.'];
  const declaredApproval = incident.break_glass?.approval_declared === true;
  const independent = incident.break_glass?.issuer === 'independent-human-control-plane';
  // Deliberately do not turn a caller-supplied approval claim into a verified grant.
  return {
    schema:'evercraft.defense.response-plan.v1',
    synthetic:true, live_response_executed:false,
    incident_id:incident.incident_id, mission_id:incident.mission_id,
    threat_state:phase,
    evidence_summary:{signal_count:signals.length,corroborating_source_family_count:sourceFamilies.size,
      source_authenticity:'NOT_AUTHENTICATED_BY_THIS_MODULE',causality:'UNKNOWN'},
    suggested_actions:priorities,
    execution_authority:'NONE_READ_ONLY',
    destructive_eradication_authorized:false,
    independent_shutdown_gate: declaredApproval && independent
      ? 'DECLARED_APPROVAL_REQUIRES_EXTERNAL_SIGNATURE_VALIDATION'
      : 'NOT_APPROVED',
    saban_boundary:'COMPROMISED_OR_UNVERIFIED_AGENTS_CANNOT_SELF_AUTHORIZE_NEW_LEASES',
    network_continuity:partitioned
      ? 'PARTITIONED_STORE_CUSTODY_IF_LOCAL_POWER_AND_STORAGE_SURVIVE'
      : 'END_TO_END_TRANSPORT_UNVERIFIED',
    external_network_pursuit_authorized:false,
    impact_state:'UNKNOWN_NOT_PROVEN',
    next_verification:['Authenticate observers and authorization outside the monitored agent',
      'Obtain independent incident-admission receipt from Systemia',
      'Demonstrate reversible scoped containment and verify no re-spawn in a permissioned lab',
      'Validate actual device power, transport, custody and replay receipts under partition',
      'Test independent break-glass access when Saban and primary network are unavailable']
  };
}
