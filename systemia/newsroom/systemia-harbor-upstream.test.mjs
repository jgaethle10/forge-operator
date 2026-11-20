import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SYSTEMIA_HARBOR_SCHEMA,
  prepareSystemiaHarborCandidate
} from './systemia-harbor-upstream.mjs';

const record = () => ({
  source_department: 'towi',
  destination: 'harbor',
  via: 'systemia',
  sensitivity: 'public',
  mission_id: 'towi-case-001',
  artifact_id: 'towi-report-001',
  revision: 'v1',
  source_receipt_ref: 'source-receipt-001',
  public_safe_summary: 'A bounded research finding with unresolved questions.',
  review_state: 'in_progress',
  claims: [{
    claim_id: 'claim-01',
    text: 'One public measurement changed within the stated window.',
    evidence_state: 'reported',
    source_urls: ['https://www.usgs.gov/'],
    uncertainty: 'Awaiting independent corroboration.'
  }]
});
const trusted = {
  isRegisteredProducer: (d) => d === 'towi' || d === 'faie',
  verifySourceReceipt: ({source_receipt_ref}) => source_receipt_ref === 'source-receipt-001',
  verifyPublicProjection: ({artifact_id}) => artifact_id === 'towi-report-001'
};

test('verified upstream TOWI becomes a non-authorizing Harbor editorial candidate', () => {
  const result = prepareSystemiaHarborCandidate(record(), trusted);
  assert.equal(result.action, 'staged_for_harbor_review');
  assert.equal(result.candidate.schema, SYSTEMIA_HARBOR_SCHEMA);
  assert.equal(result.candidate.source.source_department, 'towi');
  assert.equal(result.candidate.destination, 'harbor');
  assert.equal(result.candidate.review_state, 'in_progress');
  assert.equal(result.candidate.publication_authority, false);
  assert.equal(result.candidate.outreach_authority, false);
  assert.equal(result.candidate.research_dispatch_authority, false);
});

test('a registered non-TOWI department can submit using the same boundary', () => {
  const input = record();
  input.source_department = 'faie';
  assert.equal(prepareSystemiaHarborCandidate(input, trusted).action, 'staged_for_harbor_review');
});

test('Harbor cannot invert the upstream research relationship', () => {
  const input = record();
  input.source_department = 'harbor';
  assert.equal(prepareSystemiaHarborCandidate(input, trusted).reason, 'invalid_upstream_producer');
  input.source_department = 'towi';
  input.destination = 'towi';
  assert.equal(prepareSystemiaHarborCandidate(input, trusted).reason, 'wrong_direction');
  input.destination = 'harbor';
  input.via = 'direct';
  assert.equal(prepareSystemiaHarborCandidate(input, trusted).reason, 'wrong_direction');
});

test('source content never authorizes itself by claiming verified status', () => {
  const input = record();
  input.receipt_verified = true;
  input.release_approved = true;
  input.review_state = 'independent_reviewed';
  assert.equal(prepareSystemiaHarborCandidate(input).reason, 'producer_not_verified');
  assert.equal(prepareSystemiaHarborCandidate(input, {...trusted, verifySourceReceipt: () => false}).reason, 'source_receipt_not_verified');
  assert.equal(prepareSystemiaHarborCandidate(input, {...trusted, verifyPublicProjection: () => false}).reason, 'privacy_projection_not_verified');
});

test('sensitive material and untraceable claims hold before projection', () => {
  const input = record();
  input.sensitivity = 'restricted';
  assert.equal(prepareSystemiaHarborCandidate(input, trusted).reason, 'public_projection_not_established');
  input.sensitivity = 'public';
  input.claims[0].source_urls = ['http://internal.local/private'];
  assert.equal(prepareSystemiaHarborCandidate(input, trusted).reason, 'claim_evidence_incomplete');
  input.claims[0].source_urls = [];
  assert.equal(prepareSystemiaHarborCandidate(input, trusted).reason, 'claim_evidence_incomplete');
  input.claims[0].source_urls = ['https://www.usgs.gov/'];
  input.claims[0].evidence_state = 'fact';
  assert.equal(prepareSystemiaHarborCandidate(input, trusted).reason, 'claim_evidence_incomplete');
});

test('trusted verifier errors fail closed', () => {
  const result = prepareSystemiaHarborCandidate(record(), {
    ...trusted, verifyPublicProjection: () => { throw new Error('service unavailable'); }
  });
  assert.equal(result.action, 'hold');
  assert.equal(result.reason, 'trusted_verifier_failed');
});

test('no external contact or publication command is included in any candidate', () => {
  const result = prepareSystemiaHarborCandidate(record(), trusted);
  assert.ok(!('publish' in result.candidate));
  assert.ok(!('send' in result.candidate));
  assert.ok(!('contact' in result.candidate));
  assert.equal(result.candidate.customer_delivery_authority, false);
});
