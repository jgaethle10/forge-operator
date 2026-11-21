import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateInfrastructureGuard } from './infrastructure-guard.mjs';

const NOW = '2026-10-29T22:00:00.000Z';
const source = (source_id, independence_group = source_id) =>
  ({ source_id, independence_group, max_age_seconds: 120, required: true });
const receipt = (source_id, status, checked_at = NOW) =>
  ({ source_id, status, checked_at });
const check = (sources, receipts) => evaluateInfrastructureGuard({
  asset_id: 'test-freezer-001',
  evaluated_at: NOW,
  sources, receipts
});

test('two fresh independent normal witnesses yield complete healthy coverage', () => {
  const result = check([source('controller'), source('thermometer')],
    [receipt('controller', 'normal'), receipt('thermometer', 'normal')]);
  assert.equal(result.status, 'healthy');
  assert.equal(result.coverage, 'complete');
  assert.equal(result.operator_review_required, false);
  assert.equal(result.controller_actions_authorized, false);
});

test('unexplained defrost/controller anomaly is a watch, not cyberattack attribution', () => {
  const result = check([source('controller'), source('thermometer')],
    [receipt('controller', 'abnormal'), receipt('thermometer', 'normal')]);
  assert.equal(result.status, 'watch');
  assert.equal(result.attribution, 'undetermined');
});

test('independent temperature and controller abnormalities escalate', () => {
  const result = check([source('controller'), source('thermometer')],
    [receipt('controller', 'abnormal'), receipt('thermometer', 'abnormal')]);
  assert.equal(result.status, 'elevated');
  assert.equal(result.abnormal_independence_groups, 2);
});

test('repackaging one controller telemetry stream never manufactures corroboration', () => {
  const result = check([source('mode', 'single-controller'), source('temp', 'single-controller')],
    [receipt('mode', 'abnormal'), receipt('temp', 'abnormal')]);
  assert.equal(result.status, 'watch');
  assert.equal(result.abnormal_independence_groups, 1);
});

test('a reported safety alarm requests local human verification immediately', () => {
  const result = check([source('thermometer')], [receipt('thermometer', 'safety_alarm')]);
  assert.equal(result.status, 'urgent_review');
  assert.equal(result.safety_state, 'requires_local_verification');
  assert.equal(result.controller_actions_authorized, false);
});

test('absent telemetry is blind, never healthy', () => {
  const result = check([source('node-health')], []);
  assert.equal(result.status, 'blind');
  assert.equal(result.coverage, 'blind');
  assert.equal(result.blind_spots.length, 1);
});

test('stale required source degrades otherwise normal coverage', () => {
  const result = check([source('edge-agent'), source('outside-monitor')],
    [receipt('edge-agent', 'normal'), receipt('outside-monitor', 'normal', '2026-10-29T21:50:00Z')]);
  assert.equal(result.status, 'degraded');
  assert.equal(result.required_usable, 1);
  assert.equal(result.coverage, 'degraded');
});

test('error and fabricated receipt status do not count as healthy readings', () => {
  assert.equal(check([source('edge')], [receipt('edge', 'error')]).status, 'blind');
  assert.equal(check([source('edge')], [receipt('edge', 'totally-fine')]).status, 'blind');
});

test('far future observations cannot produce healthy coverage', () => {
  const result = check([source('edge')], [receipt('edge', 'normal', '2026-10-30T01:00:00Z')]);
  assert.equal(result.status, 'blind');
});

test('duplicate contracts and missing authentication-context identifiers fail closed', () => {
  assert.throws(() => check([source('same'), source('same')], []), /duplicate source contracts/);
  assert.throws(() => check([source('a/private path')], []), /opaque identifier/);
});
