import assert from 'node:assert/strict';
import test from 'node:test';
import { EARTHWORKS_APPLICATIONS, findApplications, makePilotBrief } from './application-library.mjs';

test('application library covers multiple real operating wedges', () => {
  assert.ok(EARTHWORKS_APPLICATIONS.length >= 6);
  assert.ok(EARTHWORKS_APPLICATIONS.some((x) => x.id === 'aggregate-haul-loop'));
  assert.ok(EARTHWORKS_APPLICATIONS.some((x) => x.id === 'mass-earthwork'));
  assert.ok(EARTHWORKS_APPLICATIONS.some((x) => x.id === 'hazard-recovery'));
});

test('pain-first search finds the lane without brand seeding', () => {
  assert.equal(findApplications('operator shortages')[0].id, 'aggregate-haul-loop');
  assert.ok(findApplications('repetitive loading').some((x) => x.id === 'stationary-loading'));
  assert.ok(findApplications('unsafe human exposure').some((x) => x.id === 'hazard-recovery'));
});

test('pilot brief always begins read-only and simulation-first', () => {
  const brief = makePilotBrief('aggregate-haul-loop');
  assert.equal(brief.phases[0].gate, 'read-only');
  assert.equal(brief.phases[1].gate, 'no physical actuation');
  assert.equal(brief.phases.at(-1).id, 'fleet-pilot');
});
