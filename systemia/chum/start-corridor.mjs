const BASE44_HOST = (hostname) => {
  const host = String(hostname || '').toLowerCase();
  return host === 'base44.app' || host.endsWith('.base44.app');
};

const BLOCKED_PUBLIC_HOSTS = new Set([
  'systemiacommandcenters.com',
  'www.systemiacommandcenters.com'
]);

export const BUYER_FRONTAGE_ORIGIN = null;
export const BUYER_FRONTAGE_GATEWAY = null;

function allowedHttpsUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    if (BASE44_HOST(host) || BLOCKED_PUBLIC_HOSTS.has(host)) return null;
    return url;
  } catch {
    return null;
  }
}

export function machineReviewUrl(
  publicId,
  gateway = process.env.EVERCRAFT_MACHINE_COMMERCE_GATEWAY_URL || ''
) {
  const id = String(publicId || '').trim();
  const base = allowedHttpsUrl(gateway);
  if (!id || !base) return null;
  const url = new URL(base.toString());
  url.searchParams.set('view', 'service');
  url.searchParams.set('public_id', id);
  return url.toString();
}

export function configuredChumPublicOrigin(value = process.env.CHUM_PUBLIC_ORIGIN) {
  const url = allowedHttpsUrl(value);
  return url ? url.origin : null;
}

export function buyerFrontageUrl(offer, {
  surface = 'chum_public_surface',
  source = 'chum',
  campaign = 'buyer-frontage',
  gateway = process.env.EVERCRAFT_BUYER_FRONTAGE_ORIGIN || ''
} = {}) {
  if (offer?.commercial_state !== 'sell_now' || !offer?.public_id) return null;
  const base = allowedHttpsUrl(gateway);
  if (!base) return null;
  const url = new URL('/buy/' + encodeURIComponent(String(offer.public_id)), base.origin);
  url.searchParams.set('src', String(source || 'chum').slice(0, 80));
  url.searchParams.set('campaign', String(campaign || 'buyer-frontage').slice(0, 120));
  url.searchParams.set('ec_surface', String(surface || 'chum_public_surface').slice(0, 80));
  url.searchParams.set('ec_public_id', String(offer.public_id));
  return url.toString();
}

export function directHumanBuyerUrl() {
  return null;
}

export function humanStartUrl(offer, {
  surface = 'chum_public_surface',
  publicOrigin = process.env.CHUM_PUBLIC_ORIGIN,
  gateway = process.env.EVERCRAFT_MACHINE_COMMERCE_GATEWAY_URL || ''
} = {}) {
  if (offer?.commercial_state !== 'sell_now' || !offer?.public_id) return null;
  const origin = configuredChumPublicOrigin(publicOrigin);
  if (origin) {
    return origin + '/api/chum/go/' + encodeURIComponent(String(offer.public_id))
      + '?surface=' + encodeURIComponent(String(surface || 'chum_public_surface'));
  }
  const frontage = buyerFrontageUrl(offer, { surface });
  if (frontage) return frontage;
  return machineReviewUrl(offer.public_id, gateway);
}

export function humanStartState(offer, {
  publicOrigin = process.env.CHUM_PUBLIC_ORIGIN
} = {}) {
  if (offer?.commercial_state !== 'sell_now' || !offer?.public_id) return 'not_sell_now';
  if (configuredChumPublicOrigin(publicOrigin)) return 'tracked_chum_handoff_configured_origin';
  if (buyerFrontageUrl(offer)) return 'owned_buyer_frontage';
  if (machineReviewUrl(offer.public_id)) return 'owned_machine_review';
  return 'held_no_owned_public_origin';
}
