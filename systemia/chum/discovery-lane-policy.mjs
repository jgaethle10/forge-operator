export const DISCOVERY_LANES = new Set(['search','user_fetch','agent_crawl']);

export function surfaceUsable(result) {
  if (!result) return false;
  if (result.robots_allowed === false) return false;
  if (result.live?.checked) return result.live.ok === true;
  return result.robots_allowed === true;
}

export function resolveDiscoveryLane({ origin, fallback, lane }) {
  const discoverableLane = DISCOVERY_LANES.has(lane);
  const originUsable = surfaceUsable(origin);
  if (!discoverableLane) {
    return {
      blocked: false,
      route: originUsable ? 'origin' : 'policy_only',
      recovered_by_fallback: false,
      effective: origin
    };
  }
  if (originUsable) {
    return {
      blocked: false,
      route: 'origin',
      recovered_by_fallback: false,
      effective: origin
    };
  }
  if (surfaceUsable(fallback)) {
    return {
      blocked: false,
      route: 'chum_mirror_fallback',
      recovered_by_fallback: true,
      effective: fallback
    };
  }
  return {
    blocked: true,
    route: 'blocked',
    recovered_by_fallback: false,
    effective: origin || fallback || null
  };
}
