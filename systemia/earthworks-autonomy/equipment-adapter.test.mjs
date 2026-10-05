import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdapterRegistry, makeSimulatorAdapter, validateAdapterManifest } from './equipment-adapter.mjs';

test('simulator adapter registers and accepts simulation commands',()=>{
  const r=createAdapterRegistry();
  const a=r.register(makeSimulatorAdapter());
  assert.equal(a.machine_kind,'haul_truck');
  assert.equal(r.authorize({adapterId:a.id,authorityState:'simulation',command:'haul'}).ok,true);
});

test('bounded physical adapter cannot register without independent safety controls',()=>{
  const bad={
    id:'retrofit.truck.bad',machine_kind:'haul_truck',
    authority_states:['bounded_physical'],
    commands:['hold','haul'],
    telemetry:['position','speed','state','heartbeat_at'],
    safety:{}
  };
  const v=validateAdapterManifest(bad);
  assert.equal(v.ok,false);
  assert.ok(v.errors.some(x=>x.includes('independent_stop')));
  assert.ok(v.errors.some(x=>x.includes('operator_takeover')));
});

test('shadow mode is non-actuating even when an adapter supports the command',()=>{
  const r=createAdapterRegistry();
  const sim=makeSimulatorAdapter();
  sim.id='shadow.truck';
  sim.authority_states=['simulation','shadow'];
  r.register(sim);
  const a=r.authorize({adapterId:'shadow.truck',authorityState:'shadow',command:'haul'});
  assert.equal(a.ok,false);
  assert.match(a.reason,/cannot actuate/);
});

test('unsupported machine command is rejected at the adapter boundary',()=>{
  const r=createAdapterRegistry();
  const a=r.register(makeSimulatorAdapter('excavator'));
  const out=r.authorize({adapterId:a.id,authorityState:'simulation',command:'fly'});
  assert.equal(out.ok,false);
  assert.match(out.reason,/unsupported/);
});
