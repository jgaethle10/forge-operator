import assert from 'node:assert/strict';
import test from 'node:test';
import { createFleetController, makeDemoFleet, validateActuation } from './fleet-controller.mjs';

test('safety kernel rejects commands outside a machine speed envelope', () => {
  const truck = makeDemoFleet().find((m) => m.id === 'HT-01');
  const result = validateActuation(truck, { speedMps: 99, targetZone: 'haul-road' });
  assert.equal(result.ok, false);
  assert.match(result.reason, /exceeds/);
});

test('dispatcher moves material through excavator, trucks, dump pad, and loader', () => {
  const controller = createFleetController();
  for (let i = 0; i < 260; i += 1) controller.step();
  const state = controller.snapshot();

  assert.ok(state.cyclesCompleted >= 1, 'at least one haul cycle should complete');
  assert.ok(state.tonsMoved >= 18, 'a full truck payload should reach the dump pad');
  assert.ok(state.tonsProcessed > 0, 'front loader should process stockpile material');
  assert.equal(state.safetyInterventions, 0);
  assert.ok(state.fleet.every((m) => m.commandedSpeedMps <= m.maxSpeedMps));
});

test('only one truck can occupy the excavator load slot', () => {
  const controller = createFleetController();
  for (let i = 0; i < 120; i += 1) {
    const state = controller.step();
    const loading = state.fleet.filter((m) => m.kind === 'haul_truck' && ['approach', 'loading'].includes(m.state));
    assert.ok(loading.length <= 1, `load slot collision at t=${state.simSeconds}`);
  }
});

test('STOP ALL fails closed and freezes commanded motion until explicit resume', () => {
  const controller = createFleetController();
  for (let i = 0; i < 20; i += 1) controller.step();
  const stopped = controller.stopAll('test');
  assert.equal(stopped.mode, 'stopped');
  assert.ok(stopped.fleet.every((m) => m.hold && m.commandedSpeedMps === 0));
  const before = stopped.simSeconds;
  const after = controller.step();
  assert.equal(after.simSeconds, before);

  const resumed = controller.resume();
  assert.equal(resumed.mode, 'running');
  assert.ok(resumed.fleet.every((m) => !m.hold));
});

test('unsafe injected actuation is contained locally and receipted', () => {
  const controller = createFleetController();
  const state = controller.injectUnsafeCommand('HT-02', { speedMps: 50, targetZone: 'haul-road' });
  const truck = state.fleet.find((m) => m.id === 'HT-02');
  assert.equal(truck.hold, true);
  assert.equal(truck.commandedSpeedMps, 0);
  assert.equal(state.safetyInterventions, 1);
  assert.equal(state.eventLog.at(-1).type, 'safety');
});
