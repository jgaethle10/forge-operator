import assert from 'node:assert/strict';
import test from 'node:test';
import { makeSimulatorAdapter } from './equipment-adapter.mjs';
import { runAdapterConformance } from './adapter-conformance.mjs';

test('simulator haul adapter earns interface conformance',()=>{
  const m=makeSimulatorAdapter('haul_truck');
  const r=runAdapterConformance({manifest:m,profile:'haul'});
  assert.equal(r.state,'conformant');
  assert.equal(r.failed,0);
  assert.equal(r.badge_eligible,true);
});

test('missing physical stop path fails conformance',()=>{
  const m=makeSimulatorAdapter('haul_truck');
  m.id='bad-physical';
  m.authority_states=['bounded_physical'];
  m.safety.independent_stop=false;
  const r=runAdapterConformance({manifest:m,profile:'haul'});
  assert.equal(r.state,'nonconformant');
  assert.ok(r.checks.some(x=>x.id==='physical.independent_stop'&&!x.pass));
});

test('conformance explicitly does not equal site approval',()=>{
  const r=runAdapterConformance({manifest:makeSimulatorAdapter(),profile:'haul'});
  assert.match(r.authority_note,/not machine certification or site safety approval/i);
});
