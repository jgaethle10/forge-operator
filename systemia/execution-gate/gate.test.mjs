import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EvercraftPassport } from '../passport/passport.mjs';
import { EvercraftMeter } from '../meter/meter.mjs';
import { EvercraftExecutionGate, requestFingerprint } from './gate.mjs';

const temp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

function routeLedger(root) {
  const file = path.join(root, 'routes.json');
  fs.writeFileSync(
    file,
    JSON.stringify({
      schema: 'evercraft.direct-door-readiness.v2',
      universal_fallback: {
        registry_name: 'io.github.jgaethle10/evercraft-machine-commerce',
        remote_mcp: 'https://example.com/universal-mcp',
      },
      products: [
        {
          slug: 'aliev',
          name: 'AliEV / RIVET',
          state: 'registry_published_direct_mcp_existing',
          direct_callable: true,
          registry_published: true,
          blocking_gates: [],
          preferred_route: {
            mode: 'direct_specialist',
            hops_before_specialist: 0,
            use_universal_router_first: false,
            registry_name: 'io.github.jgaethle10/aliev',
            remote_mcp: 'https://example.com/aliev-mcp',
          },
          next_release_action: 'measure_provider_pickup_separately',
        },
        {
          slug: 'systemia-remote-ops',
          name: 'Systemia Remote Ops',
          state: 'yard_runtime_proven_public_route_pending',
          direct_callable: false,
          registry_published: false,
          blocking_gates: ['shared_public_edge_canary'],
          preferred_route: {
            mode: 'universal_fallback_until_specialist_promoted',
            hops_before_specialist: 1,
            use_universal_router_first: true,
            registry_name: 'io.github.jgaethle10/evercraft-machine-commerce',
            remote_mcp: 'https://example.com/universal-mcp',
            desired_specialist_registry_name: 'io.github.jgaethle10/systemia-remote-ops',
          },
          next_release_action: 'activate_shared_public_edge_and_verify_external_canary',
        },
      ],
    }, null, 2)
  );
  return file;
}

function setup() {
  const root = temp('execution-gate-');
  const passportStateDir = path.join(root, 'passport');
  const meterStateDir = path.join(root, 'meter');
  const gateStateDir = path.join(root, 'gate');
  const routes = routeLedger(root);

  const passport = new EvercraftPassport({ stateDir: passportStateDir });
  passport.issueGrant({
    grant_id: 'grant_rivet_generate',
    idempotency_key: 'grant:rivet:generate',
    subject_ref: 'agent:rivet-worker',
    issuer_ref: 'evercraft:identity-authority',
    product: 'rivet',
    scopes: ['report.generate'],
    resource_refs: ['site:yakima-001'],
    starts_at: '2026-09-01T00:00:00Z',
    ends_at: '2026-10-31T00:00:00Z',
    authority_state: 'verified_identity_authority',
    authority_receipt_ref: 'identity:agent:rivet-worker',
  });

  const meter = new EvercraftMeter({ stateDir: meterStateDir });
  meter.registerEntitlement({
    entitlement_id: 'ent_rivet_reports',
    idempotency_key: 'ent:rivet:reports',
    subject_ref: 'org:demo',
    product: 'rivet',
    metric: 'site_reports',
    limit: 5,
    starts_at: '2026-09-01T00:00:00Z',
    ends_at: '2026-10-31T00:00:00Z',
    authority_state: 'authoritative_verified',
    authority_receipt_ref: 'payment:verified:rivet-plan',
  });

  const gate = new EvercraftExecutionGate({
    stateDir: gateStateDir,
    passportStateDir,
    meterStateDir,
    routeLedgerPath: routes,
  });

  return { root, passport, meter, gate };
}

function prepare(gate, overrides = {}) {
  return gate.prepareExecution({
    lease_id: 'lease_rivet_001',
    idempotency_key: 'execution:prepare:rivet:001',
    actor_ref: 'agent:rivet-worker',
    passport_product: 'rivet',
    scope: 'report.generate',
    resource_ref: 'site:yakima-001',
    specialist_slug: 'aliev',
    request: {
      address: '6405 W Chestnut Ave, Yakima, WA',
      report: 'preliminary',
    },
    prepared_at: '2026-09-27T18:00:00Z',
    meter: {
      subject_ref: 'org:demo',
      product: 'rivet',
      metric: 'site_reports',
      quantity: 1,
      unit: 'report',
    },
    ...overrides,
  });
}

test('request fingerprint is stable across object key order', () => {
  const a = requestFingerprint({ request: { b: 2, a: 1, nested: { z: 9, y: 8 } } });
  const b = requestFingerprint({ request: { nested: { y: 8, z: 9 }, a: 1, b: 2 } });
  assert.equal(a, b);
  assert.match(a, /^sha256:[a-f0-9]{64}$/);
});

test('prepare binds authority, quota, exact request and zero-hop route without dispatch', () => {
  const { root, gate, meter, passport } = setup();
  const result = prepare(gate);

  assert.equal(result.state, 'prepared');
  assert.equal(result.dispatch_allowed, false);
  assert.equal(result.lease.raw_request_stored, false);
  assert.equal(result.route.direct_callable, true);
  assert.equal(result.route.route.hops_before_specialist, 0);
  assert.equal(result.lease.route.route.remote_mcp, 'https://example.com/aliev-mcp');

  const meterState = meter.getEntitlementState('ent_rivet_reports', {
    at: '2026-09-27T18:01:00Z',
  });
  assert.equal(meterState.used, 0);
  assert.equal(meterState.reserved, 1);
  assert.equal(meterState.available, 4);

  const permitState = passport.getActionPermitState(result.lease.permit_id, {
    at: '2026-09-27T18:01:00Z',
  });
  assert.equal(permitState.active, true);
  assert.equal(permitState.consumed, false);

  fs.rmSync(root, { recursive: true, force: true });
});

test('prepare denies before mutation when Passport scope is missing', () => {
  const { root, gate, meter } = setup();

  const denied = prepare(gate, {
    scope: 'payment.refund',
    lease_id: 'lease_denied',
    idempotency_key: 'execution:prepare:denied',
  });
  assert.equal(denied.state, 'denied');
  assert.equal(denied.reason, 'passport_authorization_denied');

  const state = meter.getEntitlementState('ent_rivet_reports', {
    at: '2026-09-27T18:01:00Z',
  });
  assert.equal(state.reserved, 0);
  assert.equal(gate.getLease('lease_denied'), null);

  fs.rmSync(root, { recursive: true, force: true });
});

test('prepare denies before mutation when Meter capacity is unavailable', () => {
  const { root, gate, meter } = setup();

  const denied = prepare(gate, {
    lease_id: 'lease_too_large',
    idempotency_key: 'execution:prepare:too-large',
    meter: {
      subject_ref: 'org:demo',
      product: 'rivet',
      metric: 'site_reports',
      quantity: 6,
      unit: 'report',
    },
  });
  assert.equal(denied.state, 'denied');
  assert.equal(denied.reason, 'meter_capacity_unavailable');
  assert.equal(
    meter.getEntitlementState('ent_rivet_reports', {
      at: '2026-09-27T18:01:00Z',
    }).reserved,
    0
  );

  fs.rmSync(root, { recursive: true, force: true });
});

test('start consumes exact authority once and commits reserved capacity before dispatch is allowed', () => {
  const { root, gate, meter, passport } = setup();
  const prepared = prepare(gate);

  const started = gate.startExecution({
    lease_id: prepared.lease.lease_id,
    idempotency_key: 'execution:start:rivet:001',
    start_evidence_ref: 'systemia:dispatch-intent:rivet:001',
    started_at: '2026-09-27T18:02:00Z',
  });
  assert.equal(started.state, 'started');
  assert.equal(started.dispatch_allowed, true);
  assert.equal(started.dispatch_performed, false);

  const permitState = passport.getActionPermitState(prepared.lease.permit_id, {
    at: '2026-09-27T18:03:00Z',
  });
  assert.equal(permitState.consumed, true);
  assert.equal(permitState.active, false);

  const meterState = meter.getEntitlementState('ent_rivet_reports', {
    at: '2026-09-27T18:03:00Z',
  });
  assert.equal(meterState.used, 1);
  assert.equal(meterState.reserved, 0);
  assert.equal(meterState.available, 4);

  const duplicate = gate.startExecution({
    lease_id: prepared.lease.lease_id,
    idempotency_key: 'execution:start:rivet:001',
    start_evidence_ref: 'systemia:dispatch-intent:rivet:001',
    started_at: '2026-09-27T18:02:00Z',
  });
  assert.equal(duplicate.state, 'started');
  assert.equal(duplicate.duplicate, true);

  fs.rmSync(root, { recursive: true, force: true });
});

test('cancel before start releases quota and cancels permit', () => {
  const { root, gate, meter, passport } = setup();
  const prepared = prepare(gate);

  const cancelled = gate.cancelExecution({
    lease_id: prepared.lease.lease_id,
    idempotency_key: 'execution:cancel:rivet:001',
    reason: 'customer_cancelled',
    cancelled_at: '2026-09-27T18:02:00Z',
  });
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(cancelled.dispatch_allowed, false);

  const permitState = passport.getActionPermitState(prepared.lease.permit_id, {
    at: '2026-09-27T18:03:00Z',
  });
  assert.equal(permitState.cancelled, true);
  assert.equal(permitState.active, false);

  const meterState = meter.getEntitlementState('ent_rivet_reports', {
    at: '2026-09-27T18:03:00Z',
  });
  assert.equal(meterState.used, 0);
  assert.equal(meterState.reserved, 0);
  assert.equal(meterState.available, 5);

  assert.throws(
    () =>
      gate.startExecution({
        lease_id: prepared.lease.lease_id,
        idempotency_key: 'execution:start:after-cancel',
        start_evidence_ref: 'must-not-dispatch',
        started_at: '2026-09-27T18:04:00Z',
      }),
    /lease_not_prepared/
  );

  fs.rmSync(root, { recursive: true, force: true });
});

test('completion records external outcome evidence without charging usage twice', () => {
  const { root, gate, meter } = setup();
  const prepared = prepare(gate);
  gate.startExecution({
    lease_id: prepared.lease.lease_id,
    idempotency_key: 'execution:start:rivet:complete',
    start_evidence_ref: 'systemia:dispatch-intent:rivet:complete',
    started_at: '2026-09-27T18:02:00Z',
  });

  const completed = gate.completeExecution({
    lease_id: prepared.lease.lease_id,
    idempotency_key: 'execution:complete:rivet:001',
    outcome_evidence_ref: 'rivet:report:ready:001',
    outcome_state: 'ready',
    completed_at: '2026-09-27T18:10:00Z',
  });
  assert.equal(completed.state, 'completed');
  assert.equal(completed.lease.outcome_evidence_ref, 'rivet:report:ready:001');

  const usage = meter.queryUsage({
    subject_ref: 'org:demo',
    product: 'rivet',
    metric: 'site_reports',
  });
  assert.equal(usage.event_count, 1);
  assert.equal(usage.quantity_total, 1);

  fs.rmSync(root, { recursive: true, force: true });
});

test('route-pending specialist can use truthful fallback but direct-only policy denies it', () => {
  const { root, passport, gate } = setup();
  passport.issueGrant({
    grant_id: 'grant_remote_ops',
    idempotency_key: 'grant:remote-ops',
    subject_ref: 'agent:rivet-worker',
    issuer_ref: 'evercraft:identity-authority',
    product: 'remote-ops',
    scopes: ['simulate.run'],
    starts_at: '2026-09-01T00:00:00Z',
    ends_at: '2026-10-31T00:00:00Z',
    authority_state: 'verified_identity_authority',
    authority_receipt_ref: 'identity:remote-ops',
  });

  const fallback = gate.prepareExecution({
    lease_id: 'lease_remote_ops',
    idempotency_key: 'execution:prepare:remote-ops',
    actor_ref: 'agent:rivet-worker',
    passport_product: 'remote-ops',
    scope: 'simulate.run',
    specialist_slug: 'systemia-remote-ops',
    request: { scenario: 'raise-prices' },
    prepared_at: '2026-09-27T18:00:00Z',
  });
  assert.equal(fallback.state, 'prepared');
  assert.equal(fallback.route.direct_callable, false);
  assert.equal(fallback.route.route.use_universal_router_first, true);
  assert.equal(fallback.route.route.remote_mcp, 'https://example.com/universal-mcp');

  const directOnly = gate.prepareExecution({
    lease_id: 'lease_remote_ops_direct',
    idempotency_key: 'execution:prepare:remote-ops:direct',
    actor_ref: 'agent:rivet-worker',
    passport_product: 'remote-ops',
    scope: 'simulate.run',
    specialist_slug: 'systemia-remote-ops',
    request: { scenario: 'raise-prices' },
    prepared_at: '2026-09-27T18:00:00Z',
    require_direct_specialist: true,
  });
  assert.equal(directOnly.state, 'denied');
  assert.equal(directOnly.reason, 'direct_specialist_not_ready');

  fs.rmSync(root, { recursive: true, force: true });
});

test('state survives restart and raw request is never persisted', () => {
  const { root, gate } = setup();
  const prepared = prepare(gate);
  const serialized = fs.readFileSync(
    path.join(root, 'gate', 'execution-lease-events.jsonl'),
    'utf8'
  );
  assert.equal(serialized.includes('6405 W Chestnut Ave'), false);

  const restarted = new EvercraftExecutionGate({
    stateDir: path.join(root, 'gate'),
    passportStateDir: path.join(root, 'passport'),
    meterStateDir: path.join(root, 'meter'),
    routeLedgerPath: path.join(root, 'routes.json'),
  });
  const state = restarted.getLease(prepared.lease.lease_id);
  assert.equal(state.state, 'prepared');
  assert.equal(state.request_fingerprint, prepared.lease.request_fingerprint);

  fs.rmSync(root, { recursive: true, force: true });
});
