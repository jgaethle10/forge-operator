#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EvercraftCommerceBoundary } from './commerce-boundary.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-commerce-proof-'));
let providerReads = 0;
try {
  const boundary = new EvercraftCommerceBoundary({
    stateDir: dir,
    adapters: {
      ProofPay: {
        async fetchPayment({ paymentRef }) {
          providerReads += 1;
          assert.equal(paymentRef, 'pay-proof-1');
          return { status: 'succeeded', amount_minor: 4200, currency: 'usd', provider_event_ref: 'evt-paid-1' };
        }
      }
    }
  });
  const first = await boundary.verifyPayment({
    appKey: 'proof-app', provider: 'ProofPay', paymentRef: 'pay-proof-1', expected: { amount_minor: 4200, currency: 'USD' }
  });
  assert.equal(first.replayed, false);
  assert.equal(first.payment.provider_authoritative, true);
  assert.equal(first.payment.card_data_stored, false);
  const second = await boundary.verifyPayment({ appKey: 'proof-app', provider: 'ProofPay', paymentRef: 'pay-proof-1' });
  assert.equal(second.replayed, true);
  assert.equal(providerReads, 1);
  assert.equal(boundary.lookup({ appKey: 'proof-app', provider: 'ProofPay', paymentRef: 'pay-proof-1' }).amount_minor, 4200);
  assert.equal(boundary.health().creates_payment_obligations, false);

  const receipts = fs.readFileSync(path.join(dir, 'receipts.jsonl'), 'utf8');
  assert.ok(!receipts.includes('pay-proof-1'));

  console.log(JSON.stringify({
    schema: 'evercraft.commerce.proof.v1',
    status: 'pass',
    provider_authoritative: true,
    amount_currency_match: true,
    verification_idempotent: true,
    payment_refs_hashed_in_receipts: true,
    card_data_stored: false,
    creates_payment_obligations: false
  }));
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
