const text = (value) => String(value || '').trim();

function verifiedState(value) {
  const state = text(value).toLowerCase();
  if (!state || state.includes('unverified') || state.includes('not_verified')) return false;
  return state === 'verified' || state.endsWith('_verified');
}

function normalizeHttpsRoute(value) {
  const raw = text(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function resolveLiveCanaryEvidence({ offer = null, productConformance = null } = {}) {
  const sourceEvidence = text(offer?.live_canary_evidence);
  if (sourceEvidence) return sourceEvidence;

  const fallbackEvidence = text(productConformance?.live_canary_evidence);
  if (!fallbackEvidence) return null;
  if (!verifiedState(productConformance?.conformance_state)) return null;
  if (!verifiedState(productConformance?.machine_commerce_handoff_state)) return null;

  const currentRoute = normalizeHttpsRoute(productConformance?.mcp);
  const evidenceRoute = normalizeHttpsRoute(productConformance?.live_canary_endpoint);
  if (!currentRoute || !evidenceRoute || currentRoute !== evidenceRoute) return null;

  return fallbackEvidence;
}

export function runtimeRequiresReverification(productConformance = null) {
  const fields = [
    productConformance?.legacy_provider_runtime,
    productConformance?.runtime_route_state,
    productConformance?.conformance_state,
    productConformance?.live_canary_evidence_state,
    productConformance?.mcp_registry?.endpoint_state
  ].map((value) => text(value).toLowerCase()).filter(Boolean);

  return fields.some((state) =>
    state === 'retired' ||
    state.includes('reverification') ||
    state.includes('pending_external_verification') ||
    state.includes('historical_pre_cutover') ||
    state.includes('not_current') ||
    state.includes('legacy_endpoint_retired')
  );
}
