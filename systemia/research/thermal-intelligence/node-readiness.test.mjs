import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyNodeReadiness,captureNodeReadiness} from './node-readiness.mjs';

test('WSL2 is explicitly virtualized and not an at-wall meter',()=>{
  const r=classifyNodeReadiness({
    platform:'linux',kernelVersion:'Linux Microsoft WSL2',
    thermalZoneMillidegreesC:[42500,65000,999999],loadavg:[0.1,0.3,0.8]
  });
  assert.equal(r.environment,'WSL_HOST_VIRTUALIZED');
  assert.deepEqual(r.runtimeContext.thermalZoneReadingsC,[42.5,65]);
  assert.equal(r.runtimeContext.atWallElectricKWh,null);
  assert.equal(r.runtimeContext.usefulRecoveredHeatKWh,null);
  assert.equal(r.runtimeContext.thermalZoneReadingsAttributedToCPU,false);
});
test('bare Linux reports no actual energy even with thermal data',()=>{
  const r=classifyNodeReadiness({platform:'linux',kernelVersion:'Linux kernel',thermalZoneMillidegreesC:[51000],loadavg:[1,2,3]});
  assert.equal(r.environment,'LINUX');
  assert.equal(r.runtimeContext.atWallMeterPresent,false);
  assert.equal(r.independentlyVerified,false);
  assert.equal(r.fieldDeploymentApproved,false);
});
test('missing thermal zones or load metrics are not silently fabricated',()=>{
  const r=classifyNodeReadiness({platform:'linux',kernelVersion:'Microsoft',thermalZoneMillidegreesC:[],loadavg:null});
  assert.deepEqual(r.runtimeContext.thermalZoneReadingsC,[]);
  assert.equal(r.runtimeContext.loadavg,null);
  assert.equal(r.gateStatus,'EXTERNAL_METER_REQUIRED');
});
test('bad or unrealistic readings excluded, bounded to 64 samples',()=>{
  const r=classifyNodeReadiness({platform:'linux',thermalZoneMillidegreesC:[-41000,-40000,150000,150001,NaN,'50000',...Array(70).fill(40000)],loadavg:[0,0,0]});
  assert.equal(r.runtimeContext.thermalZoneReadingsC.length,64);
  assert.equal(r.runtimeContext.thermalZoneReadingsC[0],-40);
  assert.equal(r.runtimeContext.thermalZoneReadingsC[1],150);
});
test('Windows and macOS cannot imply electrical measurement',()=>{
  for(const platform of ['win32','darwin']){
    const r=classifyNodeReadiness({platform,loadavg:[0,0,0]});
    assert.equal(r.runtimeContext.hostPowerWatts,null);
    assert.equal(r.runtimeContext.atWallElectricKWh,null);
    assert.equal(r.runtimeContext.usefulRecoveredHeatKWh,null);
    assert.equal(r.fieldDeploymentApproved,false);
  }
});
test('invalid platforms are rejected',()=>{
  assert.throws(()=>classifyNodeReadiness(null),TypeError);
  assert.throws(()=>classifyNodeReadiness({platform:'fantasy'}),TypeError);
});
test('single-shot local sampler is privacy-bounded and not certified telemetry',()=>{
  const r=captureNodeReadiness();
  assert.equal(r.evidenceClass,'LOCAL_SOFTWARE_CONTEXT_ONLY');
  assert.equal(r.independentlyVerified,false);
  assert.equal(r.runtimeContext.atWallElectricKWh,null);
  assert.equal(r.runtimeContext.usefulRecoveredHeatKWh,null);
  assert.equal(r.fieldDeploymentApproved,false);
});
