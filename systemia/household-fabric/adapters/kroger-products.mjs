const clean = (value) => String(value ?? '').trim();

function currentPrice(item) {
  const regular = Number(item?.price?.regular);
  const promo = Number(item?.price?.promo);
  if (Number.isFinite(promo) && promo > 0 && (!Number.isFinite(regular) || promo <= regular)) return promo;
  if (Number.isFinite(regular) && regular > 0) return regular;
  return null;
}

function itemsFor(product) {
  if (!Array.isArray(product?.items)) return [];
  return product.items.flat(Infinity).filter(item => item && typeof item === 'object');
}

export function krogerProductsToObservations(payload, options = {}) {
  const products = Array.isArray(payload?.data) ? payload.data : payload?.data ? [payload.data] : [];
  const locationId = clean(options.location_id);
  const locationLabel = clean(options.location_label) || locationId;
  const observedAt = new Date(options.observed_at ?? Date.now()).toISOString();

  if (!locationId) throw new Error('location_id is required for store-specific Kroger pricing');

  const rows = [];
  for (const product of products) {
    const productId = clean(product?.productId);
    const upc = clean(product?.upc);
    const itemKey = upc ? 'upc-' + upc : productId ? 'kroger-product-' + productId : '';
    if (!itemKey) continue;

    for (const item of itemsFor(product)) {
      const stockLevel = clean(item?.inventory?.stockLevel).toUpperCase();
      if (stockLevel === 'TEMPORARILY_OUT_OF_STOCK') continue;
      const dollars = currentPrice(item);
      if (dollars == null) continue;
      const itemId = clean(item.itemId) || clean(item.size) || 'default';

      rows.push({
        id: 'kroger-' + locationId + '-' + productId + '-' + itemId,
        item_key: itemKey,
        item_label: clean(product.description) || itemKey,
        category: 'grocery',
        unit: clean(item.size) || 'package',
        price_cents_per_unit: Math.round(dollars * 100),
        observed_at: observedAt,
        source_id: 'kroger:' + locationId + ':' + productId + ':' + itemId,
        source_name: locationLabel,
        evidence_state: 'licensed',
        confidence: 0.98,
        location: options.location ?? { label: locationLabel },
        sponsored: false,
        sponsor_label: '',
      });
    }
  }
  return rows;
}
