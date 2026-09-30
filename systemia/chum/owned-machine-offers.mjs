const clean = (value) => String(value ?? '').trim();

export function normalizeOwnedMachineOfferRegistry(raw = {}) {
  const offers = Array.isArray(raw.offers) ? raw.offers : [];
  const seen = new Set();
  const normalized = [];

  for (const offer of offers) {
    const publicId = clean(offer?.public_id);
    if (!publicId) throw new Error('owned_offer_public_id_required');
    if (seen.has(publicId)) throw new Error('duplicate_owned_offer_public_id:' + publicId);
    seen.add(publicId);
    normalized.push({ ...offer, public_id: publicId });
  }

  return {
    schema: clean(raw.schema) || 'evercraft.owned-machine-offers.v1',
    authority: clean(raw.authority) || 'forge_owned_source',
    offers: normalized
  };
}

export function mergeMachineOfferSources(remoteOffers = [], ownedRegistryRaw = {}) {
  const ownedRegistry = normalizeOwnedMachineOfferRegistry(ownedRegistryRaw);
  const map = new Map();
  const sources = new Map();

  for (const offer of Array.isArray(remoteOffers) ? remoteOffers : []) {
    const publicId = clean(offer?.public_id);
    if (!publicId) continue;
    map.set(publicId, offer);
    sources.set(publicId, 'remote_legacy_catalog');
  }

  let overridden = 0;
  let added = 0;
  for (const offer of ownedRegistry.offers) {
    if (map.has(offer.public_id)) overridden += 1;
    else added += 1;
    map.set(offer.public_id, offer);
    sources.set(offer.public_id, ownedRegistry.authority);
  }

  const offers = [...map.entries()]
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([public_id, offer]) => ({
      public_id,
      source_authority: sources.get(public_id),
      offer
    }));

  return {
    schema: 'evercraft.machine-offer-source-merge.v1',
    remote_offer_count: Array.isArray(remoteOffers) ? remoteOffers.filter((x) => clean(x?.public_id)).length : 0,
    owned_offer_count: ownedRegistry.offers.length,
    owned_added_count: added,
    owned_override_count: overridden,
    merged_offer_count: offers.length,
    offers
  };
}
