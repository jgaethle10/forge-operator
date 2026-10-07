import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreSiteAutonomy } from './site-autonomy-study.mjs';

test('controlled repetitive private haul loop scores as a strong study candidate', () => {
  const r=scoreSiteAutonomy({
    repeatability:5,controlledAccess:5,routeStability:5,productionPressure:4,
    operatorExposure:3,telemetryReadiness:4,trafficComplexity:1,environmentVariability:1
  });
  assert.ok(r.score >= 72);
  assert.equal(r.disposition,'strong-simulation-shadow-candidate');
  assert.equal(r.blockers.length,0);
});

test('public/mixed high-complexity site cannot be promoted by a high headline score alone', () => {
  const r=scoreSiteAutonomy({
    repeatability:5,controlledAccess:1,routeStability:5,productionPressure:5,
    operatorExposure:5,telemetryReadiness:5,trafficComplexity:5,environmentVariability:1
  });
  assert.ok(r.blockers.length >= 2);
  assert.notEqual(r.disposition,'strong-simulation-shadow-candidate');
});

test('every study caps authority at simulation or shadow without a separate safety case', () => {
  const r=scoreSiteAutonomy({});
  assert.equal(r.authorityCeiling,'simulation_or_shadow_until_separate_physical_safety_case');
  assert.match(r.nextAction,/telemetry|twin/i);
});
