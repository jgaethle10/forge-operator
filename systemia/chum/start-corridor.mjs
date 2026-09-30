const LEGACY_HOST_PATTERN = /(^|\.)base44\.app$/i;

export function configuredChumPublicOrigin(value = process.env.CHUM_PUBLIC_ORIGIN) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    if (LEGACY_HOST_PATTERN.test(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function configuredMachineCommerceGateway(value = process.env.EVERCRAFT_MACHINE_COMMERCE_GATEWAY_URL) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    if (LEGACY_HOST_PATTERN.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function machineReviewUrl(publicId, gateway = process.env.EVERCRAFT_MACHINE_COMMERCE_GATEWAY_URL) {
  const id = String(publicId || '').trim();
  const configured = configuredMachineCommerceGateway(gateway);
  if (!id || !configured) return null;
  const url = new URL(configured);
  url.searchParams.set('view', 'service');
  url.searchParams.set('public_id', id);
  return url.toString();
}

export function buyerFrontageUrl(offer, {
  surface = 'chum_public_surface',
  source = 'chum',
  campaign = 'buyer-frontage',
  publicOrigin = process.env.CHUM_PUBLIC_ORIGIN
} = {}) {
  if (offer?.commercial_state !== 'sell_now' || !offer?.public_id) return null;
  const origin = configuredChumPublicOrigin(publicOrigin);
  if (!origin) return null;
  try {
    const url = new URL('/buy/' + encodeURIComponent(String(offer.public_id)), origin);
    url.searchParams.set('src', String(source || 'chum').slice(0, 80));
    url.searchParams.set('campaign', String(campaign || 'buyer-frontage').slice(0, 120));
    url.searchParams.set('ec_surface', String(surface || 'chum_public_surface').slice(0, 80));
    url.searchParams.set('ec_public_id', String(offer.public_id));
    return url.toString();
  } catch {
    return null;
  }
}

export function directHumanBuyerUrl(_offer, _options = {}) {
  return null;
}

export function humanStartUrl(offer, {
  surface = 'chum_public_surface',
  publicOrigin = process.env.CHUM_PUBLIC_ORIGIN,
  gateway = process.env.EVERCRAFT_MACHINE_COMMERCE_GATEWAY_URL
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
  gateway = process.env.EVERCRAFT_MACHINE_COMMERCE_GATEWAY_URL
} = {}) {
  if (offer?.commercial_state !== 'sell_now' || !offer?.public_id) return 'not_sell_now';
  if (configuredChumPublicOrigin(publicOrigin)) return 'owned_chum_handoff_configured';
  if (configuredMachineCommerceGateway(gateway)) return 'owned_machine_commerce_gateway';
  return 'blocked_no_owned_handoff';
}
