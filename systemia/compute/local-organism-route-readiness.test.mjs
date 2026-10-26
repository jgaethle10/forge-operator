import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForLocalOrganismRoutes } from './local-organism.mjs';

const services = [
  'kaidance-local-resident',
  'systemia-core-local-resident',
  'evercraft-fabric-local-resident',
];

test('temporary local route startup failures converge without false success', async () => {
  let ms = 0;
  const attempts = new Map();
  const output = await waitForLocalOrganismRoutes({
    timeoutMs: 100,
    pollMs: 10,
    clock: () => ms,
    sleepImpl: async n => { ms += n; },
    verifyRoute: async name => {
      attempts.set(name, (attempts.get(name) || 0) + 1);
      return (attempts.get(name) < 3)
        ? {ok: false, state: 'unreachable'}
        : {ok: true, state: 'private_health_verified'};
    },
  });
  assert.deepEqual([...attempts.keys()], services);
  assert.equal(output.kaidanceRoute.ok, true);
  assert.equal(output.coreRoute.ok, true);
  assert.equal(output.fabricOk, true);
  assert.equal(ms, 20);
});

test('never accepts an unhealthy Core even when KAIDANCE and Fabric are healthy', async () => {
  let ms = 0;
  let count = 0;
  await assert.rejects(waitForLocalOrganismRoutes({
    timeoutMs: 25, pollMs: 10, clock: () => ms,
    sleepImpl: async n => { ms += n; },
    verifyRoute: async name => {
      count++;
      return name === 'systemia-core-local-resident'
        ? {ok: false, state: 'degraded'}
        : {ok: true, state: 'private_health_verified'};
    },
  }), /local_organism_routes_unhealthy:kaidance=private_health_verified,core=degraded,fabric=private_health_verified/);
  assert.ok(count >= 6);
  assert.ok(ms >= 25);
});

test('Fabric locally healthy while public route unbound meets local-only contract', async () => {
  const result = await waitForLocalOrganismRoutes({
    timeoutMs: 0,
    verifyRoute: async name => name === 'evercraft-fabric-local-resident'
      ? {ok: false, state: 'public_route_unbound', local_health_ok: true}
      : {ok: true, state: 'private_health_verified'},
  });
  assert.equal(result.fabricOk, true);
});

test('Fabric unbound and local health unverified fails closed', async () => {
  await assert.rejects(waitForLocalOrganismRoutes({
    timeoutMs: 0,
    verifyRoute: async name => name === 'evercraft-fabric-local-resident'
      ? {ok: false, state: 'public_route_unbound', local_health_ok: false}
      : {ok: true, state: 'private_health_verified'},
  }), /fabric=public_route_unbound/);
});

test('rejects unbounded waits and missing verifier', async () => {
  await assert.rejects(waitForLocalOrganismRoutes(), /local_route_verifier_required/);
  await assert.rejects(waitForLocalOrganismRoutes({
    verifyRoute: async () => ({ok:true}), timeoutMs: 70000,
  }), /local_route_timeout_out_of_bounds/);
});
