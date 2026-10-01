import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMicroDeviceManifest } from '../systemia/saban/microseed-device-bridge.mjs';
import { evaluateDeviceSafetyEnvelope } from '../systemia/saban/device-safety-envelope.mjs';

const fridge=normalizeMicroDeviceManifest({
  device_id:'fridge-safe-01',
  device_class:'refrigerator',
  bridge_mode:'matter',
  authorization_ref:'owner-fridge',
  endpoint:'matter://hub/fridge-safe-01',
  supported_workloads:['systemia.content-hash.v1'],
  resources:{cpu_units:0.2,memory_mb:256,storage_gb:0.5},
  max_concurrency:1,
  duty_cycle:'opportunistic',
  primary_function_priority:true,
  cpu_utilization_ceiling:0.5,
  memory_reserve_mb:96,
  temperature_ceiling_c:65,
  power_budget_watts:2,
  attestation:{mode:'gateway_bound',gateway_identity:'hub-a'},
});

test('primary appliance function always outranks Saban work',()=>{
  const decision=evaluateDeviceSafetyEnvelope({
    manifest:fridge,
    requestedWorkload:'systemia.content-hash.v1',
    requestedMemoryMb:64,
    requestedCpuFraction:0.1,
    telemetry:{
      primary_function_busy:true,
      cpu_utilization:0.1,
      memory_free_mb:200,
      temperature_c:40,
      external_power:true,
      network_utilization:0.1,
      observed_at:'2026-10-01T03:00:00.000Z',
      max_age_ms:120000,
    },
    now:new Date('2026-10-01T03:00:30.000Z'),
  });
  assert.equal(decision.safe_to_schedule,false);
  assert.ok(decision.reasons.includes('primary_function_busy'));
});

test('safe slack can be scheduled without claiming zero energy cost',()=>{
  const decision=evaluateDeviceSafetyEnvelope({
    manifest:fridge,
    requestedWorkload:'systemia.content-hash.v1',
    requestedMemoryMb:64,
    requestedCpuFraction:0.1,
    telemetry:{
      primary_function_busy:false,
      cpu_utilization:0.1,
      memory_free_mb:220,
      temperature_c:38,
      external_power:true,
      network_utilization:0.1,
      observed_at:'2026-10-01T03:00:00.000Z',
      max_age_ms:120000,
    },
    now:new Date('2026-10-01T03:00:30.000Z'),
  });
  assert.equal(decision.safe_to_schedule,true);
  assert.equal(decision.external_cash_spend_usd,0);
  assert.equal(decision.incremental_energy_cost_state,'not_measured');
  assert.ok(decision.computed_slack.memory_free_after_request_mb>=96);
});

test('thermal, battery, memory, CPU and stale telemetry gates fail closed',()=>{
  const hot=evaluateDeviceSafetyEnvelope({
    manifest:fridge,
    requestedWorkload:'systemia.content-hash.v1',
    requestedMemoryMb:200,
    requestedCpuFraction:0.5,
    telemetry:{
      primary_function_busy:false,
      cpu_utilization:0.55,
      memory_free_mb:220,
      temperature_c:70,
      battery_percent:10,
      external_power:false,
      network_utilization:0.9,
      observed_at:'2026-10-01T02:00:00.000Z',
      max_age_ms:60000,
    },
    now:new Date('2026-10-01T03:00:00.000Z'),
  });
  assert.equal(hot.safe_to_schedule,false);
  for(const reason of [
    'cpu_utilization_above_ceiling',
    'memory_reserve_violation',
    'temperature_above_ceiling',
    'network_utilization_above_ceiling',
    'requested_cpu_exceeds_slack',
    'telemetry_stale',
  ]) assert.ok(hot.reasons.includes(reason),reason);
});
