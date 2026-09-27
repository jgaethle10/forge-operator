import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EvercraftMeter } from './meter.mjs';

test('meters entitlement usage without double counting', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-meter-'));
  const meter = new EvercraftMeter({ stateDir });

  const grant = meter.registerEntitlement({
    entitlement_id: 'ent_forensi_001',
    idempotency_key: 'grant:forensi:001',
    subject_ref: 'org:demo',
    product: 'forensiscope',
    metric: 'media_minutes',
    limit: 100,
    starts_at: '2026-09-01T00:00:00Z',
    ends_at: '2026-10-01T00:00:00Z',
    authority_state: 'authoritative_verified',
    authority_receipt_ref: 'payment:verified:001',
  });
  assert.equal(grant.state, 'recorded');

  const first = meter.recordUsage({
    idempotency_key: 'usage:job:001',
    subject_ref: 'org:demo',
    product: 'forensiscope',
    metric: 'media_minutes',
    quantity: 35,
    unit: 'minute',
    entitlement_id: 'ent_forensi_001',
    evidence_ref: 'job:forensi:001',
    occurred_at: '2026-09-27T18:00:00Z',
  });
  assert.equal(first.entitlement_state.used, 35);
  assert.equal(first.entitlement_state.remaining, 65);

  const duplicate = meter.recordUsage({
    idempotency_key: 'usage:job:001',
    subject_ref: 'org:demo',
    product: 'forensiscope',
    metric: 'media_minutes',
    quantity: 35,
    unit: 'minute',
    entitlement_id: 'ent_forensi_001',
    evidence_ref: 'job:forensi:001',
    occurred_at: '2026-09-27T18:00:00Z',
  });
  assert.equal(duplicate.state, 'duplicate');
  assert.equal(meter.getEntitlementState('ent_forensi_001', {
    at: '2026-09-27T18:05:00Z',
  }).used, 35);

  assert.throws(
    () =>
      meter.recordUsage({
        idempotency_key: 'usage:job:002',
        subject_ref: 'org:demo',
        product: 'forensiscope',
        metric: 'media_minutes',
        quantity: 66,
        entitlement_id: 'ent_forensi_001',
        evidence_ref: 'job:forensi:002',
        occurred_at: '2026-09-27T18:10:00Z',
      }),
    /entitlement_limit_exceeded/
  );

  const restarted = new EvercraftMeter({ stateDir });
  assert.equal(
    restarted.getEntitlementState('ent_forensi_001', {
      at: '2026-09-27T18:15:00Z',
    }).remaining,
    65
  );

  fs.rmSync(stateDir, { recursive: true, force: true });
});

test('does not mint entitlement from non-authoritative checkout state', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-meter-auth-'));
  const meter = new EvercraftMeter({ stateDir });

  assert.throws(
    () =>
      meter.registerEntitlement({
        idempotency_key: 'grant:bad:001',
        subject_ref: 'org:demo',
        product: 'rivet',
        metric: 'reports',
        limit: 1,
        starts_at: '2026-09-01T00:00:00Z',
        ends_at: '2026-10-01T00:00:00Z',
        authority_state: 'checkout_prepared',
        authority_receipt_ref: 'checkout:prepared:001',
      }),
    /entitlement_authority_not_verified/
  );

  fs.rmSync(stateDir, { recursive: true, force: true });
});

test('supports receipt-backed pay-as-you-go usage without inventing entitlement', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-meter-payg-'));
  const meter = new EvercraftMeter({ stateDir });

  meter.recordUsage({
    idempotency_key: 'usage:rivet:001',
    subject_ref: 'org:demo',
    product: 'rivet',
    metric: 'site_reports',
    quantity: 1,
    unit: 'report',
    evidence_ref: 'report:ready:001',
    occurred_at: '2026-09-27T19:00:00Z',
  });

  const query = meter.queryUsage({
    subject_ref: 'org:demo',
    product: 'rivet',
    metric: 'site_reports',
  });
  assert.equal(query.event_count, 1);
  assert.equal(query.quantity_total, 1);

  fs.rmSync(stateDir, { recursive: true, force: true });
});
