const ENTRANCE_IDENTITY_RE = /\b(registry|directory|catalog|marketplace|tool store|plugin store)\b/i;

export function classifyEcosystemCandidate({ repo = {}, signals = [], score = 0 } = {}) {
  const signalSet = new Set(Array.isArray(signals) ? signals : []);
  const topics = Array.isArray(repo?.topics) ? repo.topics.join(' ') : '';
  const identityText = [
    repo?.name || '',
    repo?.description || '',
    topics
  ].join(' ');

  const archived = Boolean(repo?.archived);
  const explicitSubmission = signalSet.has('submission');
  const registryIdentity = ENTRANCE_IDENTITY_RE.test(identityText)
    && (signalSet.has('registry') || signalSet.has('marketplace'));
  const machineEntranceCandidate = explicitSubmission || registryIdentity;

  if (archived) {
    return {
      state: 'watch',
      reason: 'archived_repository',
      machine_entrance_candidate: false
    };
  }

  if (score >= 70 && machineEntranceCandidate) {
    return {
      state: 'engage_now',
      reason: explicitSubmission ? 'explicit_submission_path_signal' : 'registry_or_marketplace_identity',
      machine_entrance_candidate: true
    };
  }

  if (score >= 50) {
    return {
      state: 'recon_next',
      reason: machineEntranceCandidate
        ? 'machine_entrance_needs_mapping'
        : 'mcp_project_not_verified_distribution_entrance',
      machine_entrance_candidate: machineEntranceCandidate
    };
  }

  return {
    state: 'watch',
    reason: machineEntranceCandidate ? 'low_confidence_machine_entrance' : 'low_signal_project',
    machine_entrance_candidate: machineEntranceCandidate
  };
}
