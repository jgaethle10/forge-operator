import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EvercraftMeter } from './meter.mjs';

function temp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function grant(meter, overrides = {}) {
  return meter.registerEntitlement({
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
    ...overrides,
  });
}

test('meters entitlement usage without double counting', () => {
  const stateDir = temp('evercraft-meter-');
  const meter = new EvercraftMeter({ stateDir });
  assert.equal(grant(meter).state, 'recorded');

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
  assert.equal(first.entitlement_state.available, 65);

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
  assert.equal(
    meter.getEntitlementState('ent_forensi_001', {
      at: '2026-09-27T18:05:00Z',
    }).used,
    35
  );

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
    /entitlement_capacity_unavailable/
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
  const stateDir = temp('evercraft-meter-auth-');
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
  const stateDir = temp('evercraft-meter-payg-');
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

test('quotes capacity without mutation and selects the entitlement expiring first', () => {
  const stateDir = temp('evercraft-meter-quote-');
  const meter = new EvercraftMeter({ stateDir });

  grant(meter, {
    entitlement_id: 'ent_late',
    idempotency_key: 'grant:late',
    ends_at: '2026-11-01T00:00:00Z',
  });
  grant(meter, {
    entitlement_id: 'ent_early',
    idempotency_key: 'grant:early',
    ends_at: '2026-10-01T00:00:00Z',
  });

  const quote = meter.quoteAuthorization({
    subject_ref: 'org:demo',
    product: 'forensiscope',
    metric: 'media_minutes',
    quantity: 25,
    at: '2026-09-27T18:00:00Z',
  });

  assert.equal(quote.state, 'authorized_capacity_available');
  assert.equal(quote.selected_entitlement_id, 'ent_early');
  assert.equal(quote.mutation_performed, false);
  assert.equal(
    meter.getEntitlementState('ent_early', { at: '2026-09-27T18:00:00Z' }).reserved,
    0
  );

  fs.rmSync(stateDir, { recursive: true, force: true });
});

test('reservation prevents two workers from oversubscribing the same entitlement', () => {
  const stateDir = temp('evercraft-meter-reserve-');
  const workerA = new EvercraftMeter({ stateDir });
  const workerB = new EvercraftMeter({ stateDir });
  grant(workerA);

  const reservation = workerA.reserveUsage({
    idempotency_key: 'reserve:job:a',
    subject_ref: 'org:demo',
    product: 'forensiscope',
    metric: 'media_minutes',
    quantity: 70,
    unit: 'minute',
    request_ref: 'job:a',
    hold_seconds: 600,
    reserved_at: '2026-09-27T18:00:00Z',
  });
  assert.equal(reservation.state, 'reserved');
  assert.equal(reservation.entitlement_state.available, 30);

  assert.throws(
    () =>
      workerB.reserveUsage({
        idempotency_key: 'reserve:job:b',
        subject_ref: 'org:demo',
        product: 'forensiscope',
        metric: 'media_minutes',
        quantity: 40,
        unit: 'minute',
        request_ref: 'job:b',
        hold_seconds: 600,
        reserved_at: '2026-09-27T18:01:00Z',
      }),
    /insufficient_entitlement/
  );

  const small = workerB.reserveUsage({
    idempotency_key: 'reserve:job:b-small',
    subject_ref: 'org:demo',
    product: 'forensiscope',
    metric: 'media_minutes',
    quantity: 30,
    unit: 'minute',
    request_ref: 'job:b-small',
    hold_seconds: 600,
    reserved_at: '2026-09-27T18:01:00Z',
  });
  assert.equal(small.entitlement_state.available, 0);

  fs.rmSync(stateDir, { recursive: true, force: true });
});

test('reservation commits to exactly one usage event and survives restart', () => {
  const stateDir = temp('evercraft-meter-commit-');
  const meter = new EvercraftMeter({ stateDir });
  grant(meter);

  const reserved = meter.reserveUsage({
    reservation_id: 'res_demo',
    idempotency_key: 'reserve:demo',
    subject_ref: 'org:demo',
    product: 'forensiscope',
    metric: 'media_minutes',
    quantity: 40,
    unit: 'minute',
    request_ref: 'job:demo',
    hold_seconds: 600,
    reserved_at: '2026-09-27T18:00:00Z',
  });
  assert.equal(reserved.entitlement_state.reserved, 40);
  assert.equal(reserved.entitlement_state.used, 0);

  const committed = meter.commitReservation({
    reservation_id: 'res_demo',
    idempotency_key: 'commit:demo',
    evidence_ref: 'job:demo:complete',
    occurred_at: '2026-09-27T18:05:00Z',
  });
  assert.equal(committed.state, 'committed');
  assert.equal(committed.entitlement_state.reserved, 0);
  assert.equal(committed.entitlement_state.used, 40);
  assert.equal(committed.entitlement_state.available, 60);

  const duplicate = meter.commitReservation({
    reservation_id: 'res_demo',
    idempotency_key: 'commit:demo',
    evidence_ref: 'job:demo:complete',
    occurred_at: '2026-09-27T18:05:00Z',
  });
  assert.equal(duplicate.state, 'duplicate');

  const restarted = new EvercraftMeter({ stateDir });
  const query = restarted.queryUsage({ entitlement_id: 'ent_forensi_001' });
  assert.equal(query.event_count, 1);
  assert.equal(query.quantity_total, 40);

  fs.rmSync(stateDir, { recursive: true, force: true });
});

test('release returns reserved capacity and expired reservations stop blocking capacity', () => {
  const stateDir = temp('evercraft-meter-release-');
  const meter = new EvercraftMeter({ stateDir });
  grant(meter);

  const one = meter.reserveUsage({
    reservation_id: 'res_release',
    idempotency_key: 'reserve:release',
    subject_ref: 'org:demo',
    product: 'forensiscope',
    metric: 'media_minutes',
    quantity: 80,
    request_ref: 'job:release',
    hold_seconds: 600,
    reserved_at: '2026-09-27T18:00:00Z',
  });
  assert.equal(one.entitlement_state.available, 20);

  const released = meter.releaseReservation({
    reservation_id: 'res_release',
    idempotency_key: 'release:release',
    reason: 'job_cancelled',
    released_at: '2026-09-27T18:02:00Z',
  });
  assert.equal(released.entitlement_state.available, 100);

  meter.reserveUsage({
    reservation_id: 'res_expire',
    idempotency_key: 'reserve:expire',
    subject_ref: 'org:demo',
    product: 'forensiscope',
    metric: 'media_minutes',
    quantity: 90,
    request_ref: 'job:expire',
    hold_seconds: 60,
    reserved_at: '2026-09-27T18:10:00Z',
  });

  const afterExpiry = meter.getEntitlementState('ent_forensi_001', {
    at: '2026-09-27T18:12:00Z',
  });
  assert.equal(afterExpiry.reserved, 0);
  assert.equal(afterExpiry.available, 100);

  fs.rmSync(stateDir, { recursive: true, force: true });
});

test('settlement digest is deterministic and does not infer price or payment', () => {
  const stateDir = temp('evercraft-meter-digest-');
  const meter = new EvercraftMeter({ stateDir });

  meter.recordUsage({
    idempotency_key: 'usage:web:001',
    subject_ref: 'org:demo',
    product: 'evercraft-web',
    metric: 'retrieval_units',
    quantity: 100,
    unit: 'request',
    evidence_ref: 'web:receipt:001',
    occurred_at: '2026-09-27T18:00:00Z',
  });
  meter.recordUsage({
    idempotency_key: 'usage:web:002',
    subject_ref: 'org:demo',
    product: 'evercraft-web',
    metric: 'retrieval_units',
    quantity: 50,
    unit: 'request',
    evidence_ref: 'web:receipt:002',
    occurred_at: '2026-09-27T18:01:00Z',
  });

  const digest = meter.buildSettlementDigest({
    subject_ref: 'org:demo',
    from: '2026-09-27T00:00:00Z',
    to: '2026-09-28T00:00:00Z',
  });

  assert.equal(digest.lines.length, 1);
  assert.equal(digest.lines[0].quantity, 150);
  assert.equal(digest.lines[0].event_count, 2);
  assert.equal(digest.pricing_applied, false);
  assert.equal(digest.payment_state_inferred, false);
  assert.match(digest.receipt_hash, /^sha256:[a-f0-9]{64}$/);

  fs.rmSync(stateDir, { recursive: true, force: true });
});
