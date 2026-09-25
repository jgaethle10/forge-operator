import assert from 'node:assert/strict';
import { createQuote, authorizeQuote, admitCommercialJob } from './commercial-gateway.mjs';

const now = '2026-09-25T22:00:00.000Z';
const quote = createQuote({
  customer_ref: 'customer:test',
  source_scope: 'source:upload:test',
  destination_scope: 'destination:test',
  byte_count: 1048576,
  artifact_count: 2,
  verification_depth: 'full'
}, { now, ttlSeconds: 900 });

assert.equal(quote.status, 'quoted');
assert.throws(() => authorizeQuote(quote, {
  human_or_customer_authorized: false,
  payment_entitlement_verified: true,
  entitlement_ref: 'ent:test',
  expires_at: '2026-09-25T23:00:00.000Z'
}, { now }), /human_or_customer_authority_required/);

assert.throws(() => authorizeQuote(quote, {
  human_or_customer_authorized: true,
  payment_entitlement_verified: false,
  entitlement_ref: 'ent:test',
  expires_at: '2026-09-25T23:00:00.000Z'
}, { now }), /payment_entitlement_required/);

const authorization = authorizeQuote(quote, {
  human_or_customer_authorized: true,
  payment_entitlement_verified: true,
  entitlement_ref: 'ent:test',
  expires_at: '2026-09-25T23:00:00.000Z'
}, { now });

const job = admitCommercialJob({ quote, authorization, cargoId: 'beast:test-cargo' }, { now });
assert.equal(job.state, 'AUTHORIZED');
assert.equal(job.agent_financial_authority, false);
assert.equal(job.source_scope, quote.request.source_scope);
assert.equal(job.destination_scope, quote.request.destination_scope);

const widened = structuredClone(authorization);
widened.destination_scope = 'destination:anywhere';
assert.throws(() => admitCommercialJob({ quote, authorization: widened, cargoId: 'beast:test-cargo' }, { now }), /authorization_destination_scope_mismatch/);

console.log('BEAST_COMMERCIAL_GATEWAY_PROOF_PASS');
