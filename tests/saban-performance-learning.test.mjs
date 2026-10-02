import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPerformanceLedger,
  recordPerformanceSample,
  performanceProfile,
  rankPerformanceAdjustment,
} from '../systemia/saban/performance-learning.mjs';

test('Saban learns reliability and latency per device/workload without overtrusting one sample',()=>{
  const ledger=createPerformanceLedger({created_at:'2026-10-01T03:00:00.000Z'});
  for(let i=0;i<10;i++){
    recordPerformanceSample(ledger,{
      device_id:'phone-fast',
      workload_class:'systemia.content-hash.v1',
      ok:true,
      duration_ms:20+i,
      bytes_processed:4096,
      observed_at:`2026-10-01T03:0${i}:00.000Z`,
    });
  }
  recordPerformanceSample(ledger,{
    device_id:'phone-fast',
    workload_class:'systemia.content-hash.v1',
    ok:false,
    duration_ms:50,
    observed_at:'2026-10-01T03:10:00.000Z',
  });

  const p=performanceProfile(ledger,{
    device_id:'phone-fast',
    workload_class:'systemia.content-hash.v1',
    now:new Date('2026-10-01T03:11:00.000Z'),
  });
  assert.equal(p.samples,11);
  assert.equal(p.successes,10);
  assert.equal(p.failures,1);
  assert.ok(p.metrics.success_rate>0.9);
  assert.ok(p.metrics.bayesian_reliability<1);
  assert.ok(p.metrics.p95_duration_ms>=20);
  assert.ok(p.metrics.throughput_bytes_per_second>0);
  assert.ok(p.metrics.confidence>0&&p.metrics.confidence<1);

  const adjustment=rankPerformanceAdjustment(p);
  assert.equal(adjustment.reason,'observed_performance');
  assert.ok(Number.isFinite(adjustment.score));
});

test('stale learned performance contributes zero score',()=>{
  const ledger=createPerformanceLedger();
  recordPerformanceSample(ledger,{
    device_id:'old-device',
    workload_class:'systemia.content-hash.v1',
    ok:true,
    duration_ms:10,
    observed_at:'2026-09-01T00:00:00.000Z',
  });
  const p=performanceProfile(ledger,{
    device_id:'old-device',
    workload_class:'systemia.content-hash.v1',
    now:new Date('2026-10-01T00:00:00.000Z'),
    max_age_ms:86400000,
  });
  assert.equal(p.fresh,false);
  assert.deepEqual(rankPerformanceAdjustment(p),{score:0,reason:'no_fresh_profile'});
});

test('thermal holds and preemptions penalize otherwise fast devices',()=>{
  const ledger=createPerformanceLedger();
  for(let i=0;i<20;i++){
    recordPerformanceSample(ledger,{
      device_id:'hot-phone',
      workload_class:'systemia.chunk-transform.v1',
      ok:i<18,
      duration_ms:5,
      preempted:i%4===0,
      thermal_hold:i%3===0,
      observed_at:'2026-10-01T03:00:00.000Z',
    });
  }
  const p=performanceProfile(ledger,{
    device_id:'hot-phone',
    workload_class:'systemia.chunk-transform.v1',
    now:new Date('2026-10-01T03:01:00.000Z'),
  });
  const adjustment=rankPerformanceAdjustment(p);
  assert.ok(adjustment.score<0);
});


test('three consecutive failures open the performance circuit and later successes heal it',()=>{
  const ledger=createPerformanceLedger();
  for(let i=0;i<3;i++){
    recordPerformanceSample(ledger,{
      device_id:'flaky-phone',
      workload_class:'systemia.content-hash.v1',
      ok:false,
      duration_ms:20,
      observed_at:`2026-10-01T03:0${i}:00.000Z`,
    });
  }
  let p=performanceProfile(ledger,{
    device_id:'flaky-phone',
    workload_class:'systemia.content-hash.v1',
    now:new Date('2026-10-01T03:03:00.000Z'),
  });
  assert.equal(p.metrics.consecutive_failures,3);
  assert.equal(p.metrics.circuit_open,true);
  assert.equal(rankPerformanceAdjustment(p).circuit_open,true);

  for(let i=0;i<6;i++){
    recordPerformanceSample(ledger,{
      device_id:'flaky-phone',
      workload_class:'systemia.content-hash.v1',
      ok:true,
      duration_ms:15,
      observed_at:`2026-10-01T03:1${i}:00.000Z`,
    });
  }
  p=performanceProfile(ledger,{
    device_id:'flaky-phone',
    workload_class:'systemia.content-hash.v1',
    now:new Date('2026-10-01T03:16:00.000Z'),
  });
  assert.equal(p.metrics.consecutive_failures,0);
  assert.equal(p.metrics.circuit_open,false);
});
