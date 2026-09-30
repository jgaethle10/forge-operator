const DEFAULT_MACHINE_COMMERCE_GATEWAY = '';
export const BUYER_FRONTAGE_ORIGIN = '';
export const BUYER_FRONTAGE_GATEWAY = '';

const BLOCKED_PUBLIC_HOSTS = new Set([
  'systemiacommandcenters.com',
  'www.systemiacommandcenters.com'
]);

const DIRECT_HUMAN_BUYER_DESTINATIONS = Object.freeze({});

function safeOwnedHttps(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:') return null;
    if (host === 'base44.app' || host.endsWith('.base44.app')) return null;
    return url;
  } catch {
    return null;
  }
}

export function machineReviewUrl(publicId, gateway = DEFAULT_MACHINE_COMMERCE_GATEWAY) {
  const id = String(publicId || '').trim();
  const url = safeOwnedHttps(gateway);
  if (!id || !url) return null;
  url.searchParams.set('view', 'service');
  url.searchParams.set('public_id', id);
  return url.toString();
}

export function configuredChumPublicOrigin(value = process.env.CHUM_PUBLIC_ORIGIN) {
  const url = safeOwnedHttps(value);
  if (!url) return null;
  if (BLOCKED_PUBLIC_HOSTS.has(url.hostname.toLowerCase())) return null;
  return url.origin;
}

export function buyerFrontageUrl() {
  return null;
}

export function directHumanBuyerUrl() {
  return null;
}

export function humanStartUrl(offer, {
  surface = 'chum_public_surface',
  publicOrigin = process.env.CHUM_PUBLIC_ORIGIN,
  gateway = DEFAULT_MACHINE_COMMERCE_GATEWAY
} = {}) {
  if (offer?.commercial_state !== 'sell_now' || !offer?.public_id) return null;

  const origin = configuredChumPublicOrigin(publicOrigin);
  if (origin) {
    return origin + '/api/chum/go/' + encodeURIComponent(String(offer.public_id))
      + '?surface=' + encodeURIComponent(String(surface || 'chum_public_surface'));
  }

  return machineReviewUrl(offer.public_id, gateway);
}

export function humanStartState(offer, {
  publicOrigin = process.env.CHUM_PUBLIC_ORIGIN,
  gateway = DEFAULT_MACHINE_COMMERCE_GATEWAY
} = {}) {
  if (offer?.commercial_state !== 'sell_now' || !offer?.public_id) return 'not_sell_now';
  if (configuredChumPublicOrigin(publicOrigin)) return 'tracked_chum_handoff_configured_origin';
  if (machineReviewUrl(offer.public_id, gateway)) return 'owned_machine_review_configured';
  return 'migration_hold_no_owned_start_route';
}
