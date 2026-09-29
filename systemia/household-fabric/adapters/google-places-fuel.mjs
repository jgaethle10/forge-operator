const FUEL_MAP = Object.freeze({
  REGULAR_UNLEADED: 'regular-unleaded',
  MIDGRADE: 'midgrade',
  PREMIUM: 'premium',
  DIESEL: 'diesel',
  DIESEL_PLUS: 'diesel-plus',
  E85: 'e85',
  E80: 'e80',
  E100: 'e100',
  BIO_DIESEL: 'biodiesel',
  TRUCK_DIESEL: 'truck-diesel',
});

const clean = (value) => String(value ?? '').trim();

function moneyToCents(money) {
  if (!money || clean(money.currencyCode).toUpperCase() !== 'USD') return null;
  const units = Number(money.units ?? 0);
  const nanos = Number(money.nanos ?? 0);
  if (!Number.isFinite(units) || !Number.isFinite(nanos)) return null;
  return units * 100 + nanos / 10_000_000;
}

export function googlePlacesFuelToObservations(payload, options = {}) {
  const places = Array.isArray(payload?.places)
    ? payload.places
    : payload && typeof payload === 'object' && (payload.id || payload.name)
      ? [payload]
      : [];
  const fallbackObservedAt = new Date(options.observed_at ?? Date.now()).toISOString();
  const rows = [];

  for (const place of places) {
    const placeId = clean(place.id || place.name?.replace(/^places\//, ''));
    if (!placeId) continue;
    const stationName = clean(place.displayName?.text) || placeId;
    const location = place.location && Number.isFinite(Number(place.location.latitude)) && Number.isFinite(Number(place.location.longitude))
      ? {
          label: stationName,
          address: clean(place.formattedAddress) || null,
          lat: Number(place.location.latitude),
          long: Number(place.location.longitude),
        }
      : {
          label: stationName,
          address: clean(place.formattedAddress) || null,
        };

    for (const price of place.fuelOptions?.fuelPrices ?? []) {
      const type = clean(price?.type).toUpperCase();
      const itemKey = FUEL_MAP[type];
      const cents = moneyToCents(price?.price);
      if (!itemKey || cents == null) continue;

      let observedAt = fallbackObservedAt;
      if (price.updateTime && !Number.isNaN(new Date(price.updateTime).getTime())) {
        observedAt = new Date(price.updateTime).toISOString();
      }

      rows.push({
        id: 'google-places-' + placeId + '-' + itemKey,
        item_key: itemKey,
        item_label: itemKey.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' '),
        category: 'fuel',
        unit: 'gallon',
        price_cents_per_unit: cents,
        observed_at: observedAt,
        source_id: 'google-places:' + placeId,
        source_url: clean(place.googleMapsUri),
        source_name: stationName,
        evidence_state: 'licensed',
        confidence: 0.97,
        location,
        sponsored: false,
        sponsor_label: '',
      });
    }
  }

  return rows;
}
