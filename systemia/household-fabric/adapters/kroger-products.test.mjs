import assert from 'node:assert/strict';
import test from 'node:test';
import { krogerProductsToObservations } from './kroger-products.mjs';

const payload = {
  data: [{
    productId: 'prod-1',
    upc: '000111222333',
    description: 'Whole Milk',
    items: [{
      itemId: 'item-1',
      size: '1 gal',
      inventory: { stockLevel: 'HIGH' },
      price: { regular: 4.29, promo: 3.49 },
    }],
  }],
};

test('normalizes store-specific Kroger promo price into a grocery observation', () => {
  const rows = krogerProductsToObservations(payload, {
    location_id: 'yakima-fred-meyer-1',
    location_label: 'Fred Meyer Yakima',
    observed_at: '2026-09-28T19:00:00-07:00',
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].item_key, 'upc-000111222333');
  assert.equal(rows[0].price_cents_per_unit, 349);
  assert.equal(rows[0].unit, '1 gal');
  assert.equal(rows[0].source_name, 'Fred Meyer Yakima');
  assert.equal(rows[0].evidence_state, 'licensed');
});

test('requires a location ID because Kroger price is store-specific', () => {
  assert.throws(() => krogerProductsToObservations(payload), /location_id/i);
});

test('does not advertise temporarily out-of-stock items as current opportunities', () => {
  const rows = krogerProductsToObservations({
    data: [{
      ...payload.data[0],
      items: [{
        ...payload.data[0].items[0],
        inventory: { stockLevel: 'TEMPORARILY_OUT_OF_STOCK' },
      }],
    }],
  }, {
    location_id: 'yakima-fred-meyer-1',
    observed_at: '2026-09-28T19:00:00-07:00',
  });
  assert.equal(rows.length, 0);
});
